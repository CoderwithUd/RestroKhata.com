import { io, type Socket } from "socket.io-client";
import { RAW_API_BASE_URL } from "@/lib/constants";
import { clearMenuCache } from "@/lib/menu-cache";

type RealtimeState = {
  auth?: {
    token?: string | null;
    tenant?: {
      id?: string | null;
      slug?: string | null;
    } | null;
    user?: {
      id?: string | null;
    } | null;
  };
};

const REALTIME_REFRESH_EVENTS = [
  "api.refresh",
  "kitchen.queue.changed",
  "order.created",
  "order.updated",
  "order.deleted",
  "order:created",
  "order:updated",
  "order:deleted",
  "invoice.created",
  "invoice.updated",
  "invoice.deleted",
  "invoice.paid",
  "invoice:created",
  "invoice:updated",
  "invoice:deleted",
  "invoice:paid",
  "menu.updated",
  "menu.deleted",
  "item.created",
  "item.updated",
  "item.deleted",
  "category.created",
  "category.updated",
  "category.deleted",
  "option.updated",
  "option-group.updated",
] as const;

function socketBaseUrl(): string {
  return RAW_API_BASE_URL.replace(/\/+$/, "").replace(/\/api$/, "");
}

// ── Shared Socket Singleton Logic ────────────────────────────────────────────
let sharedSocket: Socket | null = null;
let activeInvalidators = new Set<() => void>();
let debounceTimer: any = null;
let menuClearTimer: any = null;

/**
 * Debounced invalidation to prevent rapid re-fetches when multiple
 * events arrive in a short window.
 */
function triggerSharedInvalidation() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    activeInvalidators.forEach((invalidate) => invalidate());
  }, 400); // 400ms debounce window
}

/**
 * Debounced menu cache clearing to prevent heavy IndexedDB
 * operations on every socket event.
 */
function debouncedMenuClear() {
  if (menuClearTimer) clearTimeout(menuClearTimer);
  menuClearTimer = setTimeout(() => {
    clearMenuCache().catch(() => {});
  }, 500); // Reduced to 500ms for faster sync
}

export function createRealtimeInvalidationSocket(args: {
  getState: () => unknown;
  invalidate: () => void;
}): Socket {
  // Add this specific invalidator to the shared set
  activeInvalidators.add(args.invalidate);

  if (sharedSocket) {
    // If socket exists, just return it (it already has listeners)
    return sharedSocket;
  }

  // Create the shared socket if it doesn't exist
  const auth = (args.getState() as RealtimeState | undefined)?.auth;
  const token = auth?.token?.trim() || undefined;
  const tenantId = auth?.tenant?.id?.trim() || undefined;
  const tenantSlug = auth?.tenant?.slug?.trim() || undefined;
  const userId = auth?.user?.id?.trim() || undefined;

  sharedSocket = io(socketBaseUrl(), {
    withCredentials: true,
    transports: ["websocket", "polling"],
    auth: {
      token: token ? `Bearer ${token}` : undefined,
      tenantSlug,
    },
    query: tenantSlug ? { tenantSlug } : undefined,
  });

  REALTIME_REFRESH_EVENTS.forEach((eventName) => {
    sharedSocket?.on(eventName, (data: any) => {
      // 1. Debounced Menu Cache Clear (Heavy DB op)
      if (!data?.scope || data.scope === "menu" || data.scope === "all" || eventName.startsWith("menu") || eventName.startsWith("item") || eventName.startsWith("category")) {
        debouncedMenuClear();
      }
      // 2. Debounced RTK Query Invalidation
      triggerSharedInvalidation();
    });
  });

  sharedSocket.on("connect", () => {
    if (tenantSlug) {
      sharedSocket?.emit("tenant:join", { tenantSlug });
    }
    if (tenantId || tenantSlug || userId) {
      sharedSocket?.emit("tenant:join", { tenantId, tenantSlug, userId });
    }
  });

  sharedSocket.on("disconnect", () => {
    console.log("[Realtime] Shared socket disconnected");
  });

  return sharedSocket;
}

export function destroyRealtimeInvalidationSocket(
  socket: Socket,
  invalidate: () => void,
): void {
  // Remove this specific invalidator
  activeInvalidators.delete(invalidate);

  // We don't disconnect the shared socket unless all invalidators are gone
  if (activeInvalidators.size === 0 && sharedSocket) {
    // Note: We might want to keep it alive if useOrderSocket is still using it
    // For now, we'll keep it simple
  }
}

/**
 * Returns the shared socket instance or creates one.
 */
export function getSharedSocket(state: unknown): Socket {
  if (sharedSocket) return sharedSocket;
  
  // Dummy invalidator just to initialize
  return createRealtimeInvalidationSocket({
    getState: () => state,
    invalidate: () => {},
  });
}

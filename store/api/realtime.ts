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
  "order.status_updated",
  "order:updated",
  "order:status_updated",
  "order.deleted",
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
  "table.updated",
  "table:updated",
] as const;

function socketBaseUrl(): string {
  return RAW_API_BASE_URL.replace(/\/+$/, "").replace(/\/api$/, "");
}

// ── Shared Socket Singleton Logic ────────────────────────────────────────────
let sharedSocket: Socket | null = null;
let lastAuthToken: string | undefined = undefined;
let lastTenantSlug: string | undefined = undefined;
let activeInvalidators = new Set<() => void>();
let globalRefreshThunks = new Set<() => any>(); // Registry for API-wide refreshes
let sharedDispatch: any = null;
let debounceTimer: any = null;
let menuClearTimer: any = null;

/**
 * Debounced invalidation to prevent rapid re-fetches when multiple
 * events arrive in a short window.
 */
function triggerSharedInvalidation() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.info("[Realtime] Triggering synchronized cache refresh");
    
    // 1. Call active invalidators (mounted components)
    activeInvalidators.forEach((invalidate) => invalidate());
    
    // 2. Call global refresh thunks (entire APIs)
    if (sharedDispatch) {
      globalRefreshThunks.forEach((thunk) => {
        try {
          sharedDispatch(thunk());
        } catch (err) {
          console.warn("[Realtime] Global refresh failed:", err);
        }
      });
    }
  }, 400); // 400ms debounce window
}

/**
 * Register a thunk (like api.util.invalidateTags) to be called 
 * globally whenever any real-time event occurs.
 */
export function registerGlobalRefresh(thunk: () => any) {
  globalRefreshThunks.add(thunk);
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
  dispatch?: any;
}): Socket {
  // Store dispatch for global refreshes
  if (!sharedDispatch && args.dispatch) {
    sharedDispatch = args.dispatch;
  } else if (!sharedDispatch && (args as any).dispatch) {
     // Fallback for cases where dispatch is passed differently
     sharedDispatch = (args as any).dispatch;
  }

  // Add this specific invalidator to the shared set
  activeInvalidators.add(args.invalidate);

  // Create or Update the shared socket
  const auth = (args.getState() as RealtimeState | undefined)?.auth;
  const token = auth?.token?.trim() || undefined;
  const tenantId = auth?.tenant?.id?.trim() || undefined;
  const tenantSlug = auth?.tenant?.slug?.trim() || undefined;
  const userId = auth?.user?.id?.trim() || undefined;

  const joinRooms = (socket: Socket) => {
    if (tenantSlug) {
      socket.emit("tenant:join", { tenantSlug });
    }
    if (tenantId || tenantSlug || userId) {
      socket.emit("tenant:join", { tenantId, tenantSlug, userId });
    }
  };

  if (sharedSocket) {
    // If auth changed, update socket auth and re-join rooms
    if (token !== lastAuthToken || tenantSlug !== lastTenantSlug) {
      console.info("[Realtime] Auth changed, updating socket session");
      sharedSocket.auth = {
        token: token ? `Bearer ${token}` : undefined,
        tenantSlug,
      };
      
      if (sharedSocket.connected) {
        joinRooms(sharedSocket);
      } else {
        sharedSocket.connect();
      }
      
      lastAuthToken = token;
      lastTenantSlug = tenantSlug;
    }
    return sharedSocket;
  }

  lastAuthToken = token;
  lastTenantSlug = tenantSlug;

  sharedSocket = io(socketBaseUrl(), {
    withCredentials: true,
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
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
    console.info("[Realtime] Shared socket connected:", sharedSocket?.id);
    if (sharedSocket) joinRooms(sharedSocket);
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

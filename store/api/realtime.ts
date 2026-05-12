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
  "api_refresh",
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
let statusListeners = new Set<(connected: boolean) => void>();
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
  }, 100); // 100ms for near-instant "WhatsApp-like" updates
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
  onConnectionChange?: (connected: boolean) => void;
}): Socket {
  // Store dispatch for global refreshes
  if (!sharedDispatch && args.dispatch) {
    sharedDispatch = args.dispatch;
  } else if (!sharedDispatch && (args as any).dispatch) {
     // Fallback for cases where dispatch is passed differently
     sharedDispatch = (args as any).dispatch;
  }

  // Add this specific invalidator to the shared set
  if (args.invalidate) activeInvalidators.add(args.invalidate);
  if (args.onConnectionChange) {
    statusListeners.add(args.onConnectionChange);
  }

  // Create or Update the shared socket
  const auth = (args.getState() as RealtimeState | undefined)?.auth;
  const token = auth?.token?.trim() || undefined;
  const tenantId = auth?.tenant?.id?.trim() || undefined;
  const tenantSlug = auth?.tenant?.slug?.trim() || undefined;
  const userId = auth?.user?.id?.trim() || undefined;

  const joinRooms = (socket: Socket) => {
    // Backend automatically joins tenant:${tenantId} on connection if authenticated.
    // We can still explicitly join if needed, but ensure we use the right format.
    if (tenantId) {
      socket.emit("tenant:join", { tenantId });
    } else if (tenantSlug) {
      socket.emit("tenant:join", { tenantSlug });
    }
  };

  if (sharedSocket) {
    // If auth changed, update socket auth and re-join rooms
    const isAuthChanged = token !== lastAuthToken || tenantSlug !== lastTenantSlug;
    if (isAuthChanged) {
      console.info("[Realtime] Auth change detected, updating socket...");
      
      sharedSocket.auth = {
        accessToken: token || undefined,
        tenantSlug,
      };
      
      // Update query for backwards compatibility
      (sharedSocket as any).query = tenantSlug ? { tenantSlug } : {};
      
      lastAuthToken = token;
      lastTenantSlug = tenantSlug;

      if (sharedSocket.connected) {
        joinRooms(sharedSocket);
      } else if (token && token.length > 10) {
        sharedSocket.connect();
      }
    }
    // If we have a socket (existing or newly created), notify the caller's connection listener
    if (args.onConnectionChange) {
      args.onConnectionChange(sharedSocket.connected);
    }
    return sharedSocket;
  }

  lastAuthToken = token;
  lastTenantSlug = tenantSlug;

  const hasValidToken = Boolean(token && token.length > 10);
  
  sharedSocket = io(socketBaseUrl(), {
    withCredentials: true,
    transports: ["websocket", "polling"],
    autoConnect: hasValidToken,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    auth: {
      accessToken: token || undefined,
      tenantSlug,
    },
    query: tenantSlug ? { tenantSlug } : undefined,
  });

  // Notify connection status for the first time
  if (args.onConnectionChange) {
    args.onConnectionChange(sharedSocket.connected);
  }

  // Listeners (Registered only once for the singleton)
  REALTIME_REFRESH_EVENTS.forEach((eventName) => {
    sharedSocket?.on(eventName, (data: any) => {
      console.info(`[Realtime] 📥 Event received: ${eventName}`, data);
      
      // 1. Debounced Menu Cache Clear (Heavy DB op)
      const isMenuEvent = !data?.scope || data.scope === "menu" || data.scope === "all" || 
                          eventName.startsWith("menu") || eventName.startsWith("item") || 
                          eventName.startsWith("category");
      
      if (isMenuEvent) {
        debouncedMenuClear();
      }

      // 2. Selective RTK Query Invalidation
      // Only invalidate for api_refresh or events that are too complex to patch
      const isRefreshEvent = eventName === "api.refresh" || eventName === "api_refresh";
      
      if (isRefreshEvent) {
        triggerSharedInvalidation();
      }
    });
  });

  sharedSocket.on("connect", () => {
    console.info("[Realtime] ✅ Socket connected successfully. ID:", sharedSocket?.id);
    statusListeners.forEach((fn) => fn(true));
    if (sharedSocket) joinRooms(sharedSocket);
  });

  sharedSocket.on("connect_error", (error) => {
    // Suppress "access token missing" error logs as it's expected during bootstrap/logout
    if (error.message.includes("access token missing")) {
      console.info("[Realtime] ℹ️ Socket waiting for authentication...");
    } else {
      console.error("[Realtime] ❌ Connection error:", error.message);
    }
    statusListeners.forEach((fn) => fn(false));
  });

  sharedSocket.on("reconnect_attempt", (attempt) => {
    console.info("[Realtime] 🔄 Reconnection attempt #", attempt);
  });

  sharedSocket.on("disconnect", (reason) => {
    console.warn("[Realtime] 🔌 Socket disconnected. Reason:", reason);
    statusListeners.forEach((fn) => fn(false));
  });

  return sharedSocket;
}

export function destroyRealtimeInvalidationSocket(
  socket: Socket,
  invalidate: () => void,
  onConnectionChange?: (connected: boolean) => void,
): void {
  // Remove this specific invalidator
  activeInvalidators.delete(invalidate);
  if (onConnectionChange) statusListeners.delete(onConnectionChange);

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

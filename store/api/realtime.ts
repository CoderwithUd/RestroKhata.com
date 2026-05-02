import { io, type Socket } from "socket.io-client";
import { RAW_API_BASE_URL } from "@/lib/constants";

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
] as const;

function socketBaseUrl(): string {
  return RAW_API_BASE_URL.replace(/\/+$/, "").replace(/\/api$/, "");
}

export function createRealtimeInvalidationSocket(args: {
  getState: () => unknown;
  invalidate: () => void;
}): Socket {
  const auth = (args.getState() as RealtimeState | undefined)?.auth;
  const token = auth?.token?.trim() || undefined;
  const tenantId = auth?.tenant?.id?.trim() || undefined;
  const tenantSlug = auth?.tenant?.slug?.trim() || undefined;
  const userId = auth?.user?.id?.trim() || undefined;

  const socket = io(socketBaseUrl(), {
    withCredentials: true,
    transports: ["websocket", "polling"],
    auth: {
      token: token ? `Bearer ${token}` : undefined,
      tenantSlug,
    },
    query: tenantSlug ? { tenantSlug } : undefined,
  });

  REALTIME_REFRESH_EVENTS.forEach((eventName) => {
    socket.on(eventName, args.invalidate);
  });

  socket.on("connect", () => {
    if (tenantId || tenantSlug || userId) {
      socket.emit("tenant:join", { tenantId, tenantSlug, userId });
    }
  });

  return socket;
}

export function destroyRealtimeInvalidationSocket(
  socket: Socket,
  invalidate: () => void,
): void {
  REALTIME_REFRESH_EVENTS.forEach((eventName) => {
    socket.off(eventName, invalidate);
  });
  socket.disconnect();
}

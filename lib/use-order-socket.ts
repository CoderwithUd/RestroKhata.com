"use client";

/**
 * useOrderSocket
 * Connects to the Socket.IO server and fires callbacks on order events.
 * Also handles:
 *   - Browser Notification API (requests permission on first use)
 *   - Audio beep via Web Audio API (no file needed)
 *
 * Events from server (per Order_API.md):
 *   order.created  → { order: OrderRecord }
 *   order.updated  → { order: OrderRecord }
 *   order.deleted  → { orderId: string }
 */

import { useEffect, useRef } from "react";
import { RAW_API_BASE_URL } from "@/lib/constants";

export type SocketOrderEvent = {
  type: "created" | "updated" | "deleted";
  order?: {
    id: string;
    status?: string;
    table?: { id: string; number: number; name: string };
  };
  orderId?: string;
};

type UseOrderSocketOptions = {
  token: string | null | undefined;
  enabled?: boolean;
  onEvent?: (event: SocketOrderEvent) => void;
};

// ── Audio beep (Web Audio API — no file needed) ──────────────────────────────
function playBeep(type: "new" | "ready") {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "new") {
      // Two quick high beeps — new order alert
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else {
      // Three ascending tones — order ready
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    }
  } catch {
    // AudioContext not available — silent fallback
  }
}

// ── Browser notification ──────────────────────────────────────────────────────
async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function showNotification(title: string, body: string, tag: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const n = new Notification(title, { body, tag, icon: "/favicon.ico", requireInteraction: false });
  setTimeout(() => n.close(), 6000);
}

// ── Socket hook ───────────────────────────────────────────────────────────────
export function useOrderSocket({ token, enabled = true, onEvent }: UseOrderSocketOptions) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !token || typeof window === "undefined") return;

    let socket: import("socket.io-client").Socket | null = null;
    let destroyed = false;

    async function connect() {
      // Request notification permission on first use
      await requestNotificationPermission();

      const { io } = await import("socket.io-client");

      if (destroyed) return;

      socket = io(RAW_API_BASE_URL, {
        auth: { accessToken: token },
        transports: ["websocket", "polling"],
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      });

      socket.on("connect", () => {
        console.info("[OrderSocket] Connected:", socket?.id);
      });

      socket.on("disconnect", (reason) => {
        console.info("[OrderSocket] Disconnected:", reason);
      });

      socket.on("connect_error", (err) => {
        console.warn("[OrderSocket] Connection error:", err.message);
      });

      // ── order.created ────────────────────────────────────────────────────
      socket.on("order.created", (data: { order?: SocketOrderEvent["order"] }) => {
        const order = data?.order;
        const tableName = order?.table?.name || `Table ${order?.table?.number ?? "?"}`;

        playBeep("new");
        showNotification("🆕 New Order!", tableName, `order-new-${order?.id}`);

        onEventRef.current?.({
          type: "created",
          order,
        });
      });

      // ── order.updated ─────────────────────────────────────────────────────
      socket.on("order.updated", (data: { order?: SocketOrderEvent["order"] }) => {
        const order = data?.order;
        const status = (order?.status || "").toUpperCase();
        const tableName = order?.table?.name || `Table ${order?.table?.number ?? "?"}`;

        if (status === "READY") {
          playBeep("ready");
          showNotification("✅ Order Ready!", `${tableName} — ready to serve`, `order-ready-${order?.id}`);
        }

        onEventRef.current?.({
          type: "updated",
          order,
        });
      });

      // ── order.deleted ─────────────────────────────────────────────────────
      socket.on("order.deleted", (data: { orderId?: string }) => {
        onEventRef.current?.({
          type: "deleted",
          orderId: data?.orderId,
        });
      });
    }

    connect();

    return () => {
      destroyed = true;
      socket?.disconnect();
      socket = null;
    };
  }, [token, enabled]);
}

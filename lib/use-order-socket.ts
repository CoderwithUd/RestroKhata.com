"use client";

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

export type SocketOrderRole = "owner" | "manager" | "waiter" | "kitchen" | "all";

type UseOrderSocketOptions = {
  token: string | null | undefined;
  enabled?: boolean;
  role?: SocketOrderRole;
  notifications?: boolean;
  voice?: boolean;
  onConnectionChange?: (connected: boolean) => void;
  onEvent?: (event: SocketOrderEvent) => void;
};

function socketBaseUrl(): string {
  return RAW_API_BASE_URL.replace(/\/+$/, "").replace(/\/api$/, "");
}

function normalizeStatus(status?: string): string {
  return (status || "").toUpperCase();
}

function tableLabel(order: SocketOrderEvent["order"]): string {
  return order?.table?.name || `Table ${order?.table?.number ?? "?"}`;
}

function playBeep(type: "new" | "ready" | "update") {
  if (typeof window === "undefined") return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "new") {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === "ready") {
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    } else {
      osc.frequency.setValueAtTime(760, ctx.currentTime);
      gain.gain.setValueAtTime(0.28, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch {
    // Silent fallback.
  }
}

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

  const notice = new Notification(title, {
    body,
    tag,
    icon: "/RestroKhata-RK-Complete-Icons/notification-icon-192x192.png",
    requireInteraction: false,
  });
  setTimeout(() => notice.close(), 6000);
}

function buildVoiceText(role: SocketOrderRole, event: SocketOrderEvent): string | null {
  if (!event.order) return null;

  const label = tableLabel(event.order);
  const status = normalizeStatus(event.order.status);

  if (event.type === "created") {
    return `${label}. New order received.`;
  }

  if (event.type !== "updated") return null;

  if (status === "IN_PROGRESS") {
    return role === "waiter" ? `${label}. Order is now cooking.` : `${label}. Cooking started.`;
  }
  if (status === "READY") {
    return role === "kitchen"
      ? `${label}. Order cooked and ready for server.`
      : `${label}. Order cooked. Ready for serve.`;
  }
  if (status === "SERVED") return `${label}. Order served.`;
  if (status === "CANCELLED") return `${label}. Order cancelled.`;

  return `${label}. Order updated.`;
}

function announceVoice(text: string) {
  if (
    typeof window === "undefined" ||
    !("speechSynthesis" in window) ||
    !("SpeechSynthesisUtterance" in window)
  ) {
    return;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    // Silent fallback.
  }
}

type LiveOptions = Pick<
  UseOrderSocketOptions,
  "role" | "voice" | "notifications" | "onEvent" | "onConnectionChange"
>;

export function useOrderSocket({
  token,
  enabled = true,
  role = "all",
  notifications = true,
  voice = true,
  onConnectionChange,
  onEvent,
}: UseOrderSocketOptions) {
  const liveRef = useRef<LiveOptions>({
    role,
    voice,
    notifications,
    onEvent,
    onConnectionChange,
  });

  liveRef.current = {
    role,
    voice,
    notifications,
    onEvent,
    onConnectionChange,
  };

  useEffect(() => {
    if (!enabled || !token || typeof window === "undefined") return;

    let socket: import("socket.io-client").Socket | null = null;
    let destroyed = false;

    async function connect() {
      if (liveRef.current.notifications) {
        await requestNotificationPermission();
      }

      const { io } = await import("socket.io-client");
      if (destroyed) return;

      socket = io(socketBaseUrl(), {
        auth: { accessToken: token },
        transports: ["websocket", "polling"],
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      });

      const createdHandler = (data: { order?: SocketOrderEvent["order"] }) => {
        const order = data?.order;
        const label = tableLabel(order);
        const currentRole = liveRef.current.role || "all";

        playBeep("new");
        if (liveRef.current.notifications) {
          showNotification("New Order", label, `order-new-${order?.id}`);
        }
        if (liveRef.current.voice) {
          const text = buildVoiceText(currentRole, { type: "created", order });
          if (text) announceVoice(text);
        }

        liveRef.current.onEvent?.({
          type: "created",
          order,
        });
      };

      const updatedHandler = (data: { order?: SocketOrderEvent["order"] }) => {
        const order = data?.order;
        const status = normalizeStatus(order?.status);
        const label = tableLabel(order);
        const currentRole = liveRef.current.role || "all";

        if (status === "READY") {
          playBeep("ready");
          if (liveRef.current.notifications) {
            showNotification("Order Ready", `${label} ready to serve`, `order-ready-${order?.id}`);
          }
        } else {
          playBeep("update");
          if (liveRef.current.notifications) {
            showNotification("Order Updated", `${label} status: ${status || "updated"}`, `order-updated-${order?.id}`);
          }
        }

        if (liveRef.current.voice) {
          const text = buildVoiceText(currentRole, { type: "updated", order });
          if (text) announceVoice(text);
        }

        liveRef.current.onEvent?.({
          type: "updated",
          order,
        });
      };

      const deletedHandler = (data: { orderId?: string }) => {
        liveRef.current.onEvent?.({
          type: "deleted",
          orderId: data?.orderId,
        });
      };

      socket.on("connect", () => {
        console.info("[OrderSocket] Connected:", socket?.id);
        liveRef.current.onConnectionChange?.(true);
      });

      socket.on("disconnect", (reason) => {
        console.info("[OrderSocket] Disconnected:", reason);
        liveRef.current.onConnectionChange?.(false);
      });

      socket.on("connect_error", (error) => {
        console.warn("[OrderSocket] Connection error:", error.message);
        liveRef.current.onConnectionChange?.(false);
      });

      ["order.created", "order:created"].forEach((eventName) => socket?.on(eventName, createdHandler));
      ["order.updated", "order:updated"].forEach((eventName) => socket?.on(eventName, updatedHandler));
      ["order.deleted", "order:deleted"].forEach((eventName) => socket?.on(eventName, deletedHandler));
    }

    connect();

    return () => {
      destroyed = true;
      liveRef.current.onConnectionChange?.(false);
      socket?.disconnect();
      socket = null;
    };
  }, [token, enabled]);
}

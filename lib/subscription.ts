import type { SubscriptionPayload } from "@/store/types/auth";

const EXPIRED_STATUSES = new Set(["EXPIRED", "INACTIVE", "CANCELLED", "PAST_DUE", "UNPAID"]);

export function isSubscriptionExpired(subscription?: SubscriptionPayload | null): boolean {
  if (!subscription) return false;

  const normalizedStatus = (subscription.status || "").toUpperCase();
  if (EXPIRED_STATUSES.has(normalizedStatus)) {
    return true;
  }

  if (!subscription.endsAt) {
    return false;
  }

  const expiresAt = Date.parse(subscription.endsAt);
  if (Number.isNaN(expiresAt)) {
    return false;
  }

  return expiresAt <= Date.now();
}

export function formatSubscriptionDate(value?: string): string {
  if (!value) return "Not set";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

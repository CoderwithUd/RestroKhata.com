import type { SessionPayload } from "@/store/types/auth";

const STORAGE_KEY = "restro_khata_auth_session";

type StoredSession = {
  token?: string | null;
  refreshToken?: string | null;
  user?: SessionPayload["user"];
  tenant?: SessionPayload["tenant"];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeToken(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token ? token : null;
}

export function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;

    return {
      token: sanitizeToken(parsed?.token),
      refreshToken: sanitizeToken(parsed?.refreshToken),
      user: isObject(parsed?.user) ? (parsed.user as SessionPayload["user"]) : null,
      tenant: isObject(parsed?.tenant) ? (parsed.tenant as SessionPayload["tenant"]) : null,
    };
  } catch {
    return null;
  }
}

export function writeStoredSession(next: StoredSession): void {
  if (typeof window === "undefined") return;

  const current = readStoredSession() || {};
  const merged: StoredSession = {
    token: next.token !== undefined ? sanitizeToken(next.token) : current.token,
    refreshToken:
      next.refreshToken !== undefined
        ? sanitizeToken(next.refreshToken)
        : current.refreshToken,
    user: next.user !== undefined ? next.user : current.user,
    tenant: next.tenant !== undefined ? next.tenant : current.tenant,
  };

  const hasAny = Boolean(merged.token || merged.refreshToken || merged.user || merged.tenant);
  if (!hasAny) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}


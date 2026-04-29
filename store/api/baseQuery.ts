import {
  type BaseQueryFn,
  fetchBaseQuery,
  type FetchArgs,
  type FetchBaseQueryError,
  type BaseQueryApi,
} from "@reduxjs/toolkit/query/react";
import { parseAuthPayload } from "@/lib/auth-payload";
import { clearStoredSession, readStoredSession, writeStoredSession } from "@/lib/auth-session";
import { API_BASE_URL } from "@/lib/constants";
import type { RootState } from "@/store/store";
import { clearSession, setToken } from "@/store/slices/authSlice";

const refreshCandidates = ["/auth/refresh", "/auth/refresh-token"];

// Track refresh attempts to prevent multiple concurrent refreshes
let refreshPromise: Promise<boolean> | null = null;
let lastClearSessionTime = 0;
const CLEAR_SESSION_COOLDOWN_MS = 1000; // Prevent multiple clears within 1 second

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: "include",
  prepareHeaders: (headers, api) => {
    const state = api.getState() as RootState;
    const stored = readStoredSession();

    const token = state?.auth?.token || stored?.token || null;
    const tenantSlug = state?.auth?.tenant?.slug || stored?.tenant?.slug || null;

    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }

    if (tenantSlug) {
      headers.set("x-tenant-slug", tenantSlug);
    }

    return headers;
  },
});

function getStatusCode(error: FetchBaseQueryError | undefined): number | undefined {
  if (!error) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

function getRequestPath(args: string | FetchArgs): string {
  if (typeof args === "string") return args;
  return args.url;
}

function buildRefreshRequest(path: string): FetchArgs {
  const stored = readStoredSession();
  const refreshToken = stored?.refreshToken || null;

  return {
    url: path,
    method: "POST",
    credentials: "include",
    headers: refreshToken ? { "x-refresh-token": refreshToken } : undefined,
    body: refreshToken ? { refreshToken } : undefined,
  };
}

function isPublicMenuPath(pathname: string): boolean {
  if (pathname === "/qr") return true;
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return false;
  const reserved = new Set(["dashboard", "login", "register", "plan", "qr"]);
  return !reserved.has(segments[0]?.toLowerCase() || "");
}

async function performRefresh(api: BaseQueryApi, extraOptions: {}): Promise<boolean> {
  for (const path of refreshCandidates) {
    const refreshResult = (await rawBaseQuery(buildRefreshRequest(path), api, extraOptions)) as { data?: unknown; error?: FetchBaseQueryError };
    const refreshStatus = getStatusCode(refreshResult.error);

    if (!refreshResult.error) {
      const parsed = parseAuthPayload(refreshResult.data as Record<string, unknown>);
      const nextToken = parsed.token || null;
      const nextRefreshToken = parsed.refreshToken || null;

      if (nextToken) {
        api.dispatch(setToken(nextToken));
        writeStoredSession({
          token: nextToken,
          refreshToken: nextRefreshToken ?? undefined,
        });
      }

      return true;
    }

    // Don't retry if we get a real error (not 404)
    if (refreshStatus !== 404) {
      break;
    }
  }

  return false;
}

export const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, api, extraOptions);
  const requestPath = getRequestPath(args);
  const isRefreshRequest = refreshCandidates.includes(requestPath);

  if (getStatusCode(result.error) === 401 && !isRefreshRequest) {
    // If a refresh is already in progress, wait for it to complete
    if (refreshPromise) {
      const refreshed = await refreshPromise;
      if (refreshed) {
        result = await rawBaseQuery(args, api, extraOptions);
      }
    } else {
      // Start a new refresh attempt and share it across concurrent requests
      refreshPromise = performRefresh(api, extraOptions);
      try {
        const refreshed = await refreshPromise;
        if (refreshed) {
          result = await rawBaseQuery(args, api, extraOptions);
        }
      } finally {
        refreshPromise = null;
      }
    }
  }

  // Only clear session if we still have a 401 after refresh attempt
  if (getStatusCode(result.error) === 401) {
    // Prevent multiple logout events within cooldown period
    const now = Date.now();
    if (now - lastClearSessionTime > CLEAR_SESSION_COOLDOWN_MS) {
      lastClearSessionTime = now;
      api.dispatch(clearSession());
      clearStoredSession();

      if (typeof window !== "undefined") {
        const pathname = window.location.pathname || "/";
        const isAuthPage = pathname === "/login" || pathname === "/register";
        const publicMenuPage = isPublicMenuPath(pathname);
        if (!isAuthPage && !publicMenuPage) {
          window.location.replace("/login");
        }
      }
    }
  }

  return result;
};

import {
  type BaseQueryFn,
  fetchBaseQuery,
  type FetchArgs,
  type FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { extractAuthToken } from "@/lib/auth-payload";
import { clearStoredSession, readStoredSession, writeStoredSession } from "@/lib/auth-session";
import { API_BASE_URL } from "@/lib/constants";
import type { RootState } from "@/store/store";
import { clearSession, setToken } from "@/store/slices/authSlice";

const refreshCandidates = ["/auth/refresh", "/auth/refresh-token"];

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

function isPublicMenuPath(pathname: string): boolean {
  if (pathname === "/qr") return true;
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return false;
  const reserved = new Set(["dashboard", "login", "register", "plan", "qr"]);
  return !reserved.has(segments[0]?.toLowerCase() || "");
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
    let refreshed = false;

    for (const path of refreshCandidates) {
      const refreshResult = await rawBaseQuery({ url: path, method: "POST", credentials: "include" }, api, extraOptions);
      const refreshStatus = getStatusCode(refreshResult.error);

      if (!refreshResult.error) {
        const nextToken = extractAuthToken(refreshResult.data);

        if (nextToken) {
          api.dispatch(setToken(nextToken));
          writeStoredSession({ token: nextToken });
        }

        refreshed = true;
        break;
      }

      if (refreshStatus !== 404) {
        break;
      }
    }

    if (refreshed) {
      result = await rawBaseQuery(args, api, extraOptions);
    }
  }

  if (getStatusCode(result.error) === 401) {
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

  return result;
};

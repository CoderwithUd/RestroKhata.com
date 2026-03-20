"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { clearStoredSession, readStoredSession, writeStoredSession } from "@/lib/auth-session";
import { useLazyMeQuery, useRefreshSessionMutation } from "@/store/api/authApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  bootstrapFinished,
  bootstrapStarted,
  clearSession,
  selectAuthBootstrapStatus,
  setSession,
  setToken,
} from "@/store/slices/authSlice";

export function SessionBootstrap() {
  const dispatch = useAppDispatch();
  const pathname = usePathname() || "/";
  const bootstrapStatus = useAppSelector(selectAuthBootstrapStatus);
  const [loadMe] = useLazyMeQuery();
  const [refreshSession] = useRefreshSessionMutation();
  const hydratedFromStorageRef = useRef(false);

  useEffect(() => {
    const segments = pathname.split("/").filter(Boolean);
    const isPublicTenantPath =
      segments.length === 1 &&
      !["dashboard", "login", "register", "plan", "qr"].includes(
        segments[0]?.toLowerCase() || "",
      );
    const isPublicQrPath = pathname === "/qr" || isPublicTenantPath;
    if (isPublicQrPath) return;

    if (bootstrapStatus !== "idle") return;

    if (!hydratedFromStorageRef.current) {
      const saved = readStoredSession();
      if (saved?.token) {
        dispatch(setToken(saved.token));
      }
      if (saved?.user || saved?.tenant) {
        dispatch(
          setSession({
            user: saved.user || null,
            tenant: saved.tenant || null,
          }),
        );
      }
      hydratedFromStorageRef.current = true;
    }

    const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Request timeout")), timeoutMs);
          }),
        ]);
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    };

    const runBootstrap = async () => {
      dispatch(bootstrapStarted());

      try {
        const profile = await withTimeout(loadMe(undefined, true).unwrap(), 8000);
        dispatch(setSession(profile));
        writeStoredSession(profile);
      } catch {
        try {
          const refreshed = await withTimeout(refreshSession().unwrap(), 8000);

          if (refreshed?.token) {
            dispatch(setToken(refreshed.token));
            writeStoredSession({ token: refreshed.token });
          }

          const refreshedProfile = await withTimeout(loadMe(undefined, true).unwrap(), 8000);

          dispatch(setSession(refreshedProfile));
          writeStoredSession(refreshedProfile);
        } catch {
          dispatch(clearSession());
          clearStoredSession();
        }
      } finally {
        dispatch(bootstrapFinished());
      }
    };

    void runBootstrap();
  }, [bootstrapStatus, dispatch, loadMe, pathname, refreshSession]);

  return null;
}

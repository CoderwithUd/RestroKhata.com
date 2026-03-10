"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { FullPageLoader } from "@/components/full-page-loader";
import { useAppSelector } from "@/store/hooks";
import { selectAuthBootstrapStatus, selectIsAuthenticated } from "@/store/slices/authSlice";

type RouteGuardProps = {
  mode: "guest" | "private";
  children: ReactNode;
};

export function RouteGuard({ mode, children }: RouteGuardProps) {
  const router = useRouter();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const bootstrapStatus = useAppSelector(selectAuthBootstrapStatus);
  const isChecking = bootstrapStatus !== "done";

  useEffect(() => {
    if (!isChecking && mode === "guest" && isAuthenticated) {
      router.replace("/dashboard");
      return;
    }

    if (!isChecking && mode === "private" && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isChecking, mode, router]);

  if (mode === "guest" && isChecking) {
    return <FullPageLoader label="Checking your session" />;
  }

  if (mode === "private" && isChecking) {
    return <FullPageLoader label="Checking your session" />;
  }

  if (mode === "guest" && isAuthenticated) {
    return <FullPageLoader label="Opening dashboard" />;
  }

  if (mode === "private" && !isAuthenticated) {
    return <FullPageLoader label="Redirecting to login" />;
  }

  return <>{children}</>;
}

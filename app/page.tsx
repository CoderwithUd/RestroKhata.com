"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FullPageLoader } from "@/components/full-page-loader";
import { useAppSelector } from "@/store/hooks";
import { selectAuthBootstrapStatus, selectIsAuthenticated } from "@/store/slices/authSlice";

export default function HomePage() {
  const router = useRouter();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const bootstrapStatus = useAppSelector(selectAuthBootstrapStatus);

  useEffect(() => {
    if (bootstrapStatus !== "done") return;
    router.replace(isAuthenticated ? "/dashboard" : "/login");
  }, [bootstrapStatus, isAuthenticated, router]);

  return <FullPageLoader label="Checking your session" />;
}

"use client";

import { AuthCard } from "@/components/auth-card";
import { RouteGuard } from "@/components/route-guard";

export default function LoginPage() {
  return (
    <RouteGuard mode="guest">
      <AuthCard mode="login" />
    </RouteGuard>
  );
}

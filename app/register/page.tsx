"use client";

import { AuthCard } from "@/components/auth-card";
import { RouteGuard } from "@/components/route-guard";

export default function RegisterPage() {
  return (
    <RouteGuard mode="guest">
      <AuthCard mode="register" />
    </RouteGuard>
  );
}

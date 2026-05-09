"use client";

import { AuthCard } from "@/components/auth-card";
import { RouteGuard } from "@/components/route-guard";

export default function RegisterDigitalMenuPage() {
  return (
    <RouteGuard mode="guest">
      <AuthCard mode="register-digital-menu" />
    </RouteGuard>
  );
}

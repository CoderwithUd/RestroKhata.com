"use client";

import { DashboardCard } from "@/components/dashboard-card";
import { RouteGuard } from "@/components/route-guard";

export default function DashboardPage() {
  return (
    <RouteGuard mode="private">
      <DashboardCard />
    </RouteGuard>
  );
}

import { DashboardCard } from "@/components/dashboard-card";
import { RouteGuard } from "@/components/route-guard";

export default function TakeawayNewPage() {
  return (
    <RouteGuard mode="private">
      <DashboardCard section="orders" />
    </RouteGuard>
  );
}

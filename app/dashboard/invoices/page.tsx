import { DashboardCard } from "@/components/dashboard-card";
import { RouteGuard } from "@/components/route-guard";

export default function InvoicesPage() {
  return (
    <RouteGuard mode="private">
      <DashboardCard section="invoices" />
    </RouteGuard>
  );
}

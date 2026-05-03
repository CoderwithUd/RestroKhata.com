import { DashboardCard } from "@/components/dashboard-card";
import { RouteGuard } from "@/components/route-guard";

export default function InvoiceEditPage({ params }: { params: Promise<{ id: string }> }) {
  // we could pass id as prop if we wanted, but we'll extract it from usePathname() in the workspace
  return (
    <RouteGuard mode="private">
      <DashboardCard section="invoices" />
    </RouteGuard>
  );
}

import { DashboardCard } from "@/components/dashboard-card";
import { RouteGuard } from "@/components/route-guard";

export default function InvoicePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <RouteGuard mode="private">
      <DashboardCard section="invoices" />
    </RouteGuard>
  );
}

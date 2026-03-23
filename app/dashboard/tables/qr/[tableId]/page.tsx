import { TableQrStudioPage } from "@/components/table-qr-studio-page";
import { RouteGuard } from "@/components/route-guard";

type DashboardTableQrPageProps = {
  params: Promise<{ tableId: string }>;
};

export default async function DashboardTableQrPage({
  params,
}: DashboardTableQrPageProps) {
  const { tableId } = await params;

  return (
    <RouteGuard mode="private">
      <TableQrStudioPage tableId={tableId} />
    </RouteGuard>
  );
}

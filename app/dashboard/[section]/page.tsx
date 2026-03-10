import { DashboardCard } from "@/components/dashboard-card";
import { RouteGuard } from "@/components/route-guard";

type DashboardSectionPageProps = {
  params: Promise<{ section: string }>;
};

export default async function DashboardSectionPage({ params }: DashboardSectionPageProps) {
  const { section } = await params;

  return (
    <RouteGuard mode="private">
      <DashboardCard section={section} />
    </RouteGuard>
  );
}


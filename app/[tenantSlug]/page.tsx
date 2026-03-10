import { PublicQrMenu } from "@/components/public-qr-menu";

type TenantPageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function TenantPublicPage({ params }: TenantPageProps) {
  const { tenantSlug } = await params;
  return <PublicQrMenu tenantSlug={tenantSlug} />;
}

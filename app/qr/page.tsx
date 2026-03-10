import { Suspense } from "react";
import { PublicQrMenu } from "@/components/public-qr-menu";

export default function QrPage() {
  return (
    <Suspense fallback={<div className="min-h-screen p-4 text-sm text-slate-600">Loading menu...</div>}>
      <PublicQrMenu />
    </Suspense>
  );
}

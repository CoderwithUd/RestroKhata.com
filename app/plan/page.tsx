"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FullPageLoader } from "@/components/full-page-loader";
import { RouteGuard } from "@/components/route-guard";
import { formatSubscriptionDate, isSubscriptionExpired } from "@/lib/subscription";
import { useTentantProfileQuery } from "@/store/api/authApi";

function PlanPageContent() {
  const router = useRouter();
  const { data, isLoading, isError } = useTentantProfileQuery();

  const subscription = data?.subscription;
  const expired = isSubscriptionExpired(subscription);

  useEffect(() => {
    if (!isLoading && !isError && !expired) {
      router.replace("/dashboard");
    }
  }, [expired, isError, isLoading, router]);

  if (isLoading) {
    return <FullPageLoader label="Checking subscription details" />;
  }

  if (!expired) {
    return <FullPageLoader label="Opening dashboard" />;
  }

  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-8 text-slate-900 md:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Subscription Required</p>
        <h1 className="mt-2 text-2xl font-semibold">Your plan has ended</h1>
        <p className="mt-2 text-sm text-slate-600">
          Renew your subscription to continue using dashboard modules for {data?.tenant?.name || "your restaurant"}.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plan</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{subscription?.planCode || "Not set"}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{subscription?.status || "EXPIRED"}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Starts On</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{formatSubscriptionDate(subscription?.startsAt)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ends On</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{formatSubscriptionDate(subscription?.endsAt)}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-lg border border-[#e6dfd1] bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            Retry Access
          </Link>
          <a
            href="mailto:support@restrokhata.com?subject=Subscription%20Renewal"
            className="inline-flex items-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
          >
            Contact For Renewal
          </a>
        </div>
      </div>
    </main>
  );
}

export default function PlanPage() {
  return (
    <RouteGuard mode="private">
      <PlanPageContent />
    </RouteGuard>
  );
}

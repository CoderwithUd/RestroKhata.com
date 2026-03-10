"use client";

import { FormEvent, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import { formatSubscriptionDate } from "@/lib/subscription";
import { useTentantProfileQuery, useUpdateTenantProfileMutation } from "@/store/api/authApi";
import type { TenantProfilePayload, UpdateTenantProfilePayload } from "@/store/types/auth";

type Props = {
  title?: string;
};

type ProfileForm = {
  name: string;
  contactNumber: string;
  gstNumber: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

function toPayload(form: ProfileForm): UpdateTenantProfilePayload {
  return {
    name: form.name.trim() || undefined,
    contactNumber: form.contactNumber.trim() || undefined,
    gstNumber: form.gstNumber.trim() || undefined,
    address: {
      line1: form.line1.trim() || undefined,
      line2: form.line2.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
      country: form.country.trim() || undefined,
      postalCode: form.postalCode.trim() || undefined,
    },
  };
}

function formFromProfile(data: TenantProfilePayload | undefined): ProfileForm {
  const tenant = data?.tenant;
  return {
    name: tenant?.name || "",
    contactNumber: tenant?.contactNumber || "",
    gstNumber: tenant?.gstNumber || "",
    line1: tenant?.address?.line1 || "",
    line2: tenant?.address?.line2 || "",
    city: tenant?.address?.city || "",
    state: tenant?.address?.state || "",
    country: tenant?.address?.country || "",
    postalCode: tenant?.address?.postalCode || "",
  };
}

export function ProfileSettingsWorkspace({ title = "Profile & Settings" }: Props) {
  const { data, isLoading, isFetching, refetch } = useTentantProfileQuery();
  const [updateProfile, { isLoading: isSaving }] = useUpdateTenantProfileMutation();
  const baseline = useMemo(() => formFromProfile(data), [data]);
  const [draft, setDraft] = useState<ProfileForm | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const form = draft || baseline;
  const isDirty = useMemo(() => Boolean(draft && JSON.stringify(draft) !== JSON.stringify(baseline)), [baseline, draft]);
  const subscription = data?.subscription || null;

  function updateField(field: keyof ProfileForm, value: string) {
    setDraft((prev) => ({
      ...(prev || baseline),
      [field]: value,
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    if (!(draft || baseline).name.trim()) return setError("Restaurant name is required");

    try {
      await updateProfile(toPayload(draft || baseline)).unwrap();
      setNotice("Profile updated");
      setDraft(null);
      refetch();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  function resetForm() {
    setDraft(null);
    setError("");
  }

  return (
    <section className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1.8fr]">
      <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
        <div className="rounded-t-2xl bg-[linear-gradient(130deg,#e2f5eb_0%,#f7e4b7_45%,#ebb18d_100%)] px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Account</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs text-slate-700">Single form se business details update karo. Save once.</p>
        </div>
        <div className="space-y-2 p-4 text-xs">
          <div className="rounded-lg border border-[#ebdfc8] bg-white p-2.5">
            <p className="text-slate-500">Logged-in User</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{data?.user?.name || "-"}</p>
            <p className="text-[11px] text-slate-500">{data?.user?.email || "-"}</p>
          </div>
          <div className="rounded-lg border border-[#ebdfc8] bg-white p-2.5">
            <p className="text-slate-500">Role</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{data?.role || "-"}</p>
          </div>
          <div className="rounded-lg border border-[#ebdfc8] bg-white p-2.5">
            <p className="text-slate-500">Tenant Slug</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{data?.tenant?.slug || "-"}</p>
          </div>
          <div className="rounded-lg border border-[#ebdfc8] bg-white p-2.5">
            <p className="text-slate-500">Subscription</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{subscription?.status || "-"}</p>
            <p className="text-[11px] text-slate-500">
              {formatSubscriptionDate(subscription?.startsAt)} to {formatSubscriptionDate(subscription?.endsAt)}
            </p>
          </div>
        </div>
      </article>

      <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
        <div className="flex items-center justify-between border-b border-[#eee7d8] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Business Details</h3>
            <p className="text-xs text-slate-500">{isLoading ? "Loading..." : "Update tenant profile and address"}</p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            {isFetching ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {notice ? <p className="mx-4 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p> : null}
        {error ? <p className="mx-4 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}

        <form onSubmit={submit} className="grid gap-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="Restaurant name"
            />
            <input
              value={form.contactNumber}
              onChange={(event) => updateField("contactNumber", event.target.value)}
              className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="Contact number"
            />
          </div>
          <input
            value={form.gstNumber}
            onChange={(event) => updateField("gstNumber", event.target.value)}
            className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
            placeholder="GST number"
          />
          <input
            value={form.line1}
            onChange={(event) => updateField("line1", event.target.value)}
            className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
            placeholder="Address line 1"
          />
          <input
            value={form.line2}
            onChange={(event) => updateField("line2", event.target.value)}
            className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
            placeholder="Address line 2 (optional)"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              value={form.city}
              onChange={(event) => updateField("city", event.target.value)}
              className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="City"
            />
            <input
              value={form.state}
              onChange={(event) => updateField("state", event.target.value)}
              className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="State"
            />
            <input
              value={form.country}
              onChange={(event) => updateField("country", event.target.value)}
              className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="Country"
            />
          </div>
          <input
            value={form.postalCode}
            onChange={(event) => updateField("postalCode", event.target.value)}
            className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
            placeholder="Postal code"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="submit"
              disabled={!isDirty || isSaving}
              className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={!isDirty || isSaving}
              className="rounded-xl border border-[#dfd2bb] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              Reset
            </button>
          </div>
        </form>
      </article>
    </section>
  );
}

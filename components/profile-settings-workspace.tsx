"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clearStoredSession } from "@/lib/auth-session";
import { getErrorMessage } from "@/lib/error";
import { showError, showSuccess } from "@/lib/feedback";
import { formatSubscriptionDate } from "@/lib/subscription";
import { useLogoutMutation, useTentantProfileQuery, useUpdateTenantProfileMutation } from "@/store/api/authApi";
import { useAppDispatch } from "@/store/hooks";
import { clearSession } from "@/store/slices/authSlice";
import type { TenantProfilePayload, UpdateTenantProfilePayload } from "@/store/types/auth";

type Props = {
  title?: string;
};

type ProfileForm = {
  tenantName: string;
  ownerName: string;
  ownerEmail: string;
  whatsappNumber: string;
  secondaryNumber: string;
  gstNumber: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

function isValidPhone(value: string): boolean {
  return !value.trim() || value.replace(/\D/g, "").length >= 10;
}

function isValidEmail(value: string): boolean {
  return !value.trim() || /^\S+@\S+\.\S+$/.test(value.trim());
}

function toPayload(form: ProfileForm): UpdateTenantProfilePayload {
  return {
    name: form.tenantName.trim() || undefined,
    ownerName: form.ownerName.trim() || undefined,
    email: form.ownerEmail.trim() || "",
    contactNumber: form.whatsappNumber.trim() || undefined,
    whatsappNumber: form.whatsappNumber.trim() || undefined,
    secondaryNumber: form.secondaryNumber.trim() || undefined,
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
  const user = data?.user;
  return {
    tenantName: tenant?.name || "",
    ownerName: tenant?.ownerName || user?.name || "",
    ownerEmail: tenant?.email || user?.email || "",
    whatsappNumber: tenant?.contactNumber || user?.whatsappNumber || "",
    secondaryNumber: tenant?.secondaryNumber || "",
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
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { data, isLoading, isFetching, refetch } = useTentantProfileQuery();
  const [logout, { isLoading: isLoggingOut }] = useLogoutMutation();
  const [updateProfile, { isLoading: isSaving }] = useUpdateTenantProfileMutation();
  const baseline = useMemo(() => formFromProfile(data), [data]);
  const [draft, setDraft] = useState<ProfileForm | null>(null);
  const form = draft || baseline;
  const isDirty = useMemo(() => Boolean(draft && JSON.stringify(draft) !== JSON.stringify(baseline)), [baseline, draft]);
  const subscription = data?.subscription || null;

  function updateField(field: keyof ProfileForm, value: string) {
    setDraft((prev) => ({
      ...(prev || baseline),
      [field]:
        field === "whatsappNumber" || field === "secondaryNumber" ? normalizePhone(value) : value,
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.tenantName.trim()) {
      showError("Tenant name is required");
      return;
    }
    if (!form.ownerName.trim()) {
      showError("Owner name is required");
      return;
    }
    if (!isValidEmail(form.ownerEmail)) {
      showError("Enter a valid email address");
      return;
    }
    if (!isValidPhone(form.whatsappNumber)) {
      showError("Enter a valid WhatsApp number");
      return;
    }
    if (!isValidPhone(form.secondaryNumber)) {
      showError("Enter a valid secondary number");
      return;
    }

    try {
      await updateProfile(toPayload(form)).unwrap();
      showSuccess("Profile updated");
      setDraft(null);
      refetch();
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  function resetForm() {
    setDraft(null);
  }

  async function handleLogout() {
    try {
      await logout().unwrap();
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      dispatch(clearSession());
      clearStoredSession();
      router.replace("/login");
    }
  }

  return (
    <section className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1.8fr]">
      <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
        <div className="rounded-t-2xl bg-[linear-gradient(130deg,#e2f5eb_0%,#f7e4b7_45%,#ebb18d_100%)] px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Account</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs text-slate-700">Owner aur business details dono yahin se update karo.</p>
        </div>
        <div className="space-y-2 p-4 text-xs">
          <div className="rounded-lg border border-[#ebdfc8] bg-white p-2.5">
            <p className="text-slate-500">Logged-in User</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{data?.user?.name || data?.tenant?.ownerName || "-"}</p>
            <p className="text-[11px] text-slate-500">{data?.user?.whatsappNumber || data?.tenant?.contactNumber || "-"}</p>
            <p className="text-[11px] text-slate-400">{data?.user?.email || data?.tenant?.email || "-"}</p>
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
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full rounded-xl border border-[#dfd2bb] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
          >
            {isLoggingOut ? "Signing out..." : "Logout"}
          </button>
        </div>
      </article>

      <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
        <div className="flex items-center justify-between border-b border-[#eee7d8] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Business Details</h3>
            <p className="text-xs text-slate-500">
              {isLoading ? "Loading..." : "Update owner info, WhatsApp number, GST, and address"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            {isFetching ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <form onSubmit={submit} className="grid gap-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={form.tenantName}
              onChange={(event) => updateField("tenantName", event.target.value)}
              className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="Tenant name"
            />
            <input
              value={form.ownerName}
              onChange={(event) => updateField("ownerName", event.target.value)}
              className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="Owner name"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="email"
              value={form.ownerEmail}
              onChange={(event) => updateField("ownerEmail", event.target.value)}
              className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="Owner email"
            />
            <input
              value={form.whatsappNumber}
              onChange={(event) => updateField("whatsappNumber", event.target.value)}
              className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="WhatsApp number"
              inputMode="tel"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={form.secondaryNumber}
              onChange={(event) => updateField("secondaryNumber", event.target.value)}
              className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="Secondary number (optional)"
              inputMode="tel"
            />
            <input
              value={form.gstNumber}
              onChange={(event) => updateField("gstNumber", event.target.value.toUpperCase())}
              className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="GST number"
            />
          </div>

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

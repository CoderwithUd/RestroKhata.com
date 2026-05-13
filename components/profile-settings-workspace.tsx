"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clearStoredSession } from "@/lib/auth-session";
import { getErrorMessage } from "@/lib/error";
import { showError, showSuccess } from "@/lib/feedback";
import { formatSubscriptionDate } from "@/lib/subscription";
import {
  useLogoutMutation,
  useTentantProfileQuery,
  useTenantSettingsQuery,
  useUpdateTenantProfileMutation,
  useUpdateTenantSettingsMutation,
} from "@/store/api/authApi";
import { useAppDispatch } from "@/store/hooks";
import { clearSession } from "@/store/slices/authSlice";
import type {
  TenantProfilePayload,
  TenantSettingsPayload,
  UpdateTenantProfilePayload,
  UpdateTenantSettingsPayload,
} from "@/store/types/auth";

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

type SettingsForm = {
  orderMode: "RESTAURANT" | "CAFE";
  prefix: string;
  headerNote: string;
  footer: string;
  termsAndConditions: string;
  logoUrl: string;
  licenceNumber: string;
  upiId: string;
  printCopies: number;
  showGst: boolean;
  showItemTax: boolean;
  showCustomerDetails: boolean;
  defaultTaxPercentage: string;
  taxLabel: string;
  taxInclusive: boolean;
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
function isValidUrl(value: string): boolean {
  if (!value.trim()) return true;
  try { new URL(value.trim()); return true; } catch { return false; }
}

function toProfilePayload(form: ProfileForm): UpdateTenantProfilePayload {
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

function profileFormFromProfile(data: TenantProfilePayload | undefined): ProfileForm {
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

function settingsFormFromPayload(
  settingsData: TenantSettingsPayload | undefined,
  profileData: TenantProfilePayload | undefined,
): SettingsForm {
  const settings = settingsData?.settings || profileData?.tenant?.settings;
  return {
    orderMode: settings?.orderMode === "CAFE" ? "CAFE" : "RESTAURANT",
    prefix: settings?.invoice?.prefix || "",
    headerNote: settings?.invoice?.headerNote || "",
    footer: settings?.invoice?.footer || "",
    termsAndConditions: settings?.invoice?.termsAndConditions || "",
    logoUrl: settings?.invoice?.logoUrl || "",
    licenceNumber: settings?.invoice?.licenceNumber || "",
    upiId: settings?.invoice?.upiId || "",
    printCopies: settings?.invoice?.printCopies || 1,
    showGst: settings?.invoice?.showGst ?? true,
    showItemTax: settings?.invoice?.showItemTax ?? false,
    showCustomerDetails: settings?.invoice?.showCustomerDetails ?? true,
    defaultTaxPercentage: `${settings?.tax?.defaultTaxPercentage ?? 5}`,
    taxLabel: settings?.tax?.taxLabel || "GST",
    taxInclusive: settings?.tax?.taxInclusive ?? false,
  };
}

function toSettingsPayload(form: SettingsForm): UpdateTenantSettingsPayload {
  return {
    orderMode: form.orderMode,
    invoice: {
      prefix: form.prefix,
      headerNote: form.headerNote,
      footer: form.footer,
      termsAndConditions: form.termsAndConditions,
      logoUrl: form.logoUrl,
      licenceNumber: form.licenceNumber,
      upiId: form.upiId,
      printCopies: form.printCopies,
      showGst: form.showGst,
      showItemTax: form.showItemTax,
      showCustomerDetails: form.showCustomerDetails,
    },
    tax: {
      defaultTaxPercentage: Number(form.defaultTaxPercentage),
      taxLabel: form.taxLabel,
      taxInclusive: form.taxInclusive,
    },
  };
}

// ─── Design Tokens ────────────────────────────────────────────────────────────
const token = {
  amber: "#D97706",
  amberLight: "#FEF3C7",
  amberBorder: "#FDE68A",
  emerald: "#059669",
  emeraldLight: "#ECFDF5",
  emeraldBorder: "#A7F3D0",
  surface: "#FFFDF9",
  border: "#E8E0D0",
  borderStrong: "#D4C9B0",
  text: "#1C1917",
  textMuted: "#78716C",
  textLight: "#A8A29E",
  red: "#DC2626",
  redLight: "#FEF2F2",
};

// ─── Primitives ───────────────────────────────────────────────────────────────

function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <span className="block text-[13px] font-semibold text-stone-800 leading-tight">{children}</span>
      {hint && <span className="block mt-0.5 text-[11px] text-stone-400 leading-tight">{hint}</span>}
    </div>
  );
}

function Input({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  label: string;
  hint?: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        placeholder={placeholder}
        className="w-full h-10 rounded-xl border border-[#E8E0D0] bg-white px-3 text-[13px] text-stone-900 placeholder:text-stone-300 outline-none transition-all focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
      />
    </div>
  );
}

function Textarea({
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#E8E0D0] bg-white px-3 py-2.5 text-[13px] text-stone-900 placeholder:text-stone-300 outline-none transition-all focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none"
      />
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 py-3 px-4 rounded-xl border border-[#E8E0D0] bg-white hover:bg-stone-50 transition-all text-left group"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-stone-800 leading-tight">{label}</p>
        <p className="mt-0.5 text-[11px] text-stone-400 leading-snug">{hint}</p>
      </div>
      <div
        className={`flex-shrink-0 relative h-5 w-9 rounded-full transition-colors duration-200 ${
          checked ? "bg-amber-500" : "bg-stone-200"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </div>
    </button>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-stone-50 border border-[#E8E0D0]">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{label}</span>
      <span className="text-[13px] font-semibold text-stone-800">{value}</span>
    </div>
  );
}

function Card({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#E8E0D0] bg-[#FFFDF9] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E8E0D0]">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600">{eyebrow}</p>
        <h3 className="mt-0.5 text-[15px] font-semibold text-stone-900">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function SaveBar({
  isDirty,
  isSaving,
  isFetching,
  isLoading,
  isReadOnly,
  readOnlyHint,
  onRefresh,
  onReset,
  saveLabel = "Save",
  color = "amber",
}: {
  isDirty: boolean;
  isSaving: boolean;
  isFetching: boolean;
  isLoading: boolean;
  isReadOnly?: boolean;
  readOnlyHint?: string;
  onRefresh: () => void;
  onReset: () => void;
  saveLabel?: string;
  color?: "amber" | "emerald";
}) {
  const saveBg = color === "emerald"
    ? "bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700 disabled:bg-emerald-300"
    : "bg-amber-500 shadow-amber-200 hover:bg-amber-600 disabled:bg-amber-300";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#E8E0D0] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[13px] font-semibold text-stone-800 leading-tight">
          {isLoading ? "Loading..." : isReadOnly ? (readOnlyHint || "Read only") : isDirty ? "Unsaved changes" : "All saved"}
        </p>
        <p className="mt-0.5 text-[11px] text-stone-400">
          {isReadOnly ? "Sirf owner changes kar sakta hai" : isDirty ? "Save karo ya reset karo" : "Koi pending changes nahi"}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onRefresh}
          className="h-9 px-4 rounded-xl border border-[#E8E0D0] bg-white text-[12px] font-semibold text-stone-600 hover:bg-stone-50 transition-all"
        >
          {isFetching ? "..." : "Refresh"}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!isDirty || isSaving}
          className="h-9 px-4 rounded-xl border border-[#E8E0D0] bg-white text-[12px] font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-40 transition-all"
        >
          Reset
        </button>
        <button
          type="submit"
          disabled={isReadOnly || !isDirty || isSaving}
          className={`h-9 px-5 rounded-xl text-[12px] font-semibold text-white shadow-lg transition-all disabled:opacity-40 disabled:shadow-none ${saveBg}`}
        >
          {isSaving ? "Saving..." : saveLabel}
        </button>
      </div>
    </div>
  );
}

function useLogoutAction() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [logout, { isLoading }] = useLogoutMutation();
  async function handleLogout() {
    try { await logout().unwrap(); } catch (e) { showError(getErrorMessage(e)); }
    finally {
      dispatch(clearSession());
      clearStoredSession();
      router.replace("/login");
    }
  }
  return { handleLogout, isLoggingOut: isLoading };
}

// ─── Profile Workspace ────────────────────────────────────────────────────────

export function ProfileWorkspace() {
  const { data, isLoading, isFetching, refetch } = useTentantProfileQuery();
  const [updateProfile, { isLoading: isSaving }] = useUpdateTenantProfileMutation();
  const { handleLogout, isLoggingOut } = useLogoutAction();

  const baseline = useMemo(() => profileFormFromProfile(data), [data]);
  const [draft, setDraft] = useState<ProfileForm | null>(null);
  const form = draft || baseline;
  const isDirty = useMemo(
    () => Boolean(draft && JSON.stringify(draft) !== JSON.stringify(baseline)),
    [baseline, draft],
  );

  function updateField(field: keyof ProfileForm, value: string) {
    setDraft((prev) => ({
      ...(prev || baseline),
      [field]: field === "whatsappNumber" || field === "secondaryNumber"
        ? normalizePhone(value) : value,
    }));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.tenantName.trim()) return showError("Business name required hai");
    if (!form.ownerName.trim()) return showError("Owner name required hai");
    if (!isValidEmail(form.ownerEmail)) return showError("Valid email daalo");
    if (!isValidPhone(form.whatsappNumber)) return showError("Valid WhatsApp number daalo");
    if (!isValidPhone(form.secondaryNumber)) return showError("Valid secondary number daalo");
    try {
      await updateProfile(toProfilePayload(form)).unwrap();
      showSuccess("Profile updated");
      setDraft(null);
      refetch();
    } catch (e) { showError(getErrorMessage(e)); }
  }

  const sub = data?.subscription || null;

  return (
    <section className="grid gap-4 ">
      {/* Hero */}
      <div className="rounded-2xl border border-[#E8E0D0] bg-gradient-to-br from-amber-50 via-[#FFFDF9] to-stone-50 px-5 py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">Profile</p>
        <h2 className="mt-1 text-xl font-semibold text-stone-900">Business & Owner Details</h2>
        <p className="mt-1 text-[13px] text-stone-500">Contact, address aur basic info update karo.</p>
        {/* <div className="mt-4 grid grid-cols-3 gap-2">
          <Chip label="Role" value={data?.role || "—"} />
          <Chip label="Plan" value={sub?.status || "—"} />
          <Chip label="Slug" value={data?.tenant?.slug || "—"} />
        </div> */}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <form onSubmit={submit} className="grid gap-4">
          <Card eyebrow="Business" title="Basic Identity">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Business name" value={form.tenantName} onChange={(v) => updateField("tenantName", v)} placeholder="Sharma Cafe" />
              <Input label="Owner name" value={form.ownerName} onChange={(v) => updateField("ownerName", v)} placeholder="Rahul Sharma" />
              <Input label="Email" type="email" value={form.ownerEmail} onChange={(v) => updateField("ownerEmail", v)} placeholder="owner@example.com" />
              <Input label="WhatsApp" inputMode="tel" value={form.whatsappNumber} onChange={(v) => updateField("whatsappNumber", v)} placeholder="9876543210" />
              <Input label="Secondary number" hint="Optional" inputMode="tel" value={form.secondaryNumber} onChange={(v) => updateField("secondaryNumber", v)} placeholder="Optional" />
              <Input label="GST number" value={form.gstNumber} onChange={(v) => updateField("gstNumber", v.toUpperCase())} placeholder="GSTIN" />
            </div>
          </Card>

          <Card eyebrow="Location" title="Address">
            <div className="grid gap-3">
              <Input label="Address line 1" value={form.line1} onChange={(v) => updateField("line1", v)} placeholder="Shop number, street, area" />
              <Input label="Address line 2" hint="Optional" value={form.line2} onChange={(v) => updateField("line2", v)} placeholder="Landmark ya floor" />
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                <Input label="City" value={form.city} onChange={(v) => updateField("city", v)} placeholder="City" />
                <Input label="State" value={form.state} onChange={(v) => updateField("state", v)} placeholder="State" />
                <Input label="Country" value={form.country} onChange={(v) => updateField("country", v)} placeholder="Country" />
                <Input label="PIN code" value={form.postalCode} onChange={(v) => updateField("postalCode", v)} placeholder="PIN" />
              </div>
            </div>
          </Card>

          <SaveBar
            isDirty={isDirty}
            isSaving={isSaving}
            isFetching={isFetching}
            isLoading={isLoading}
            onRefresh={refetch}
            onReset={() => setDraft(null)}
            saveLabel="Save Profile"
            color="amber"
          />
        </form>

        {/* Right panel */}
        {/* <div className="grid gap-4 content-start">
          <Card eyebrow="Account" title="Quick Info">
            <div className="grid gap-2">
              <Chip label="Name" value={data?.user?.name || data?.tenant?.ownerName || "—"} />
              <Chip label="Email" value={data?.user?.email || "—"} />
              <Chip label="Phone" value={data?.tenant?.contactNumber || "—"} />
              <Chip label="Plan till" value={formatSubscriptionDate(sub?.endsAt) || "—"} />
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="mt-4 w-full h-9 rounded-xl border border-[#E8E0D0] bg-white text-[12px] font-semibold text-red-600 hover:bg-red-50 hover:border-red-200 disabled:opacity-50 transition-all"
            >
              {isLoggingOut ? "Signing out..." : "Logout"}
            </button>
          </Card>
        </div> */}
      </div>
    </section>
  );
}

// ─── Settings Workspace ───────────────────────────────────────────────────────

export function SettingsWorkspace() {
  const { data: profileData } = useTentantProfileQuery();
  const { data: settingsData, isLoading, isFetching, refetch } = useTenantSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdateTenantSettingsMutation();

  const baseline = useMemo(
    () => settingsFormFromPayload(settingsData, profileData),
    [profileData, settingsData],
  );
  const [draft, setDraft] = useState<SettingsForm | null>(null);
  const form = draft || baseline;
  const isDirty = useMemo(
    () => Boolean(draft && JSON.stringify(draft) !== JSON.stringify(baseline)),
    [baseline, draft],
  );
  const isOwner = (profileData?.role || "").toUpperCase().includes("OWNER");

  function updateField<K extends keyof SettingsForm>(field: K, value: SettingsForm[K]) {
    setDraft((prev) => ({ ...(prev || baseline), [field]: value }));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const taxValue = Number(form.defaultTaxPercentage);
    if (!Number.isFinite(taxValue) || taxValue < 0 || taxValue > 100)
      return showError("Tax 0 se 100 ke beech hona chahiye");
    if (!Number.isInteger(form.printCopies) || form.printCopies < 1 || form.printCopies > 5)
      return showError("Print copies 1 se 5 ke beech honi chahiye");
    if (!form.taxLabel.trim()) return showError("Tax label required hai");
    if (!isValidUrl(form.logoUrl)) return showError("Valid logo URL daalo");
    if (!isOwner) return showError("Owner access chahiye settings update karne ke liye");
    try {
      await updateSettings(toSettingsPayload(form)).unwrap();
      showSuccess("Settings updated");
      setDraft(null);
      refetch();
    } catch (e) { showError(getErrorMessage(e)); }
  }

  return (
    <section className="grid gap-4">
      {/* Hero */}
      <div className="rounded-2xl border border-[#E8E0D0] bg-gradient-to-br from-emerald-50 via-[#FFFDF9] to-amber-50 px-5 py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Settings</p>
        <h2 className="mt-1 text-xl font-semibold text-stone-900">Billing, Tax & Operation Mode</h2>
        <p className="mt-1 text-[13px] text-stone-500">Receipt, tax aur cafe/restaurant mode yahin se manage karo.</p>
        {/* <div className="mt-4 grid grid-cols-3 gap-2">
          <Chip label="Mode" value={form.orderMode === "CAFE" ? "Cafe" : "Restaurant"} />
          <Chip label="Tax" value={`${form.defaultTaxPercentage || 0}%`} />
          <Chip label="Access" value={isOwner ? "Owner" : "Read only"} />
        </div> */}
      </div>

      <form onSubmit={submit} className="grid gap-4">
        {/* Operation Mode — most important, top */}
        <Card eyebrow="Operation" title="Kaise kaam karta hai aapka business?">
          <div className="grid gap-3 sm:grid-cols-2">
            {(["RESTAURANT", "CAFE"] as const).map((mode) => {
              const active = form.orderMode === mode;
              const isRestaurant = mode === "RESTAURANT";
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateField("orderMode", mode)}
                  className={`relative text-left rounded-xl border p-4 transition-all ${
                    active
                      ? isRestaurant
                        ? "border-amber-300 bg-amber-50 ring-1 ring-amber-200"
                        : "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200"
                      : "border-[#E8E0D0] bg-white hover:bg-stone-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-stone-900">
                        {isRestaurant ? "🍽️  Restaurant" : "☕  Cafe"}
                      </p>
                      <p className="mt-1 text-[12px] text-stone-500 leading-snug">
                        {isRestaurant
                          ? "Table orders, kitchen tracking, full workflow."
                          : "Quick billing, kitchen skip, seedha invoice."}
                      </p>
                    </div>
                    <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 transition-all ${
                      active
                        ? isRestaurant ? "border-amber-500 bg-amber-500" : "border-emerald-500 bg-emerald-500"
                        : "border-stone-300 bg-white"
                    }`} />
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-stone-400 leading-relaxed">
            {form.orderMode === "CAFE"
              ? "⚡ Cafe mode mein order items automatically served mark ho jaate hain — koi kitchen step nahi."
              : "🍳 Restaurant mode mein full kitchen tracking hoga — PLACED → COOKING → READY → SERVED."}
          </p>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          {/* Receipt */}
          <Card eyebrow="Receipt" title="Bill kaisa dikhega?">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Bill prefix" hint="Jaise INV-, CAFE-" value={form.prefix} onChange={(v) => updateField("prefix", v)} placeholder="INV-" />
              <Input label="Print copies" hint="1 to 5" type="number" value={form.printCopies}
                onChange={(v) => updateField("printCopies", Math.max(1, Math.min(5, Number(v) || 1)))}
                placeholder="1" />
              <Input label="UPI ID" value={form.upiId} onChange={(v) => updateField("upiId", v)} placeholder="store@upi" />
              <Input label="Licence no." value={form.licenceNumber} onChange={(v) => updateField("licenceNumber", v)} placeholder="FSSAI number" />
              <div className="sm:col-span-2">
                <Input label="Logo URL" hint="Receipt par logo" value={form.logoUrl} onChange={(v) => updateField("logoUrl", v)} placeholder="https://..." />
              </div>
              <div className="sm:col-span-2">
                <Input label="Header note" hint="Bill ke upar" value={form.headerNote} onChange={(v) => updateField("headerNote", v)} placeholder="Welcome note" />
              </div>
              <div className="sm:col-span-2">
                <Textarea label="Footer message" value={form.footer} onChange={(v) => updateField("footer", v)} placeholder="Thank you for visiting!" rows={2} />
              </div>
              <div className="sm:col-span-2">
                <Textarea label="Terms & conditions" hint="Optional" value={form.termsAndConditions} onChange={(v) => updateField("termsAndConditions", v)} placeholder="All sales are final." rows={2} />
              </div>
            </div>
          </Card>

          {/* Tax */}
          <Card eyebrow="Tax" title="Tax rules">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Tax label" value={form.taxLabel} onChange={(v) => updateField("taxLabel", v.toUpperCase())} placeholder="GST" />
              <Input label="Tax %" type="number" value={form.defaultTaxPercentage}
                onChange={(v) => updateField("defaultTaxPercentage", v)} placeholder="5" />
            </div>
            <div className="mt-3 grid gap-2">
              <Toggle
                label="GST bill par dikhao"
                hint="Customer ko receipt par tax details visible rahegi."
                checked={form.showGst}
                onChange={(v) => updateField("showGst", v)}
              />
              <Toggle
                label="Item-wise tax"
                hint="Har item line mein alag tax detail."
                checked={form.showItemTax}
                onChange={(v) => updateField("showItemTax", v)}
              />
              <Toggle
                label="Customer details"
                hint="Naam ya customer info bill par print ho."
                checked={form.showCustomerDetails}
                onChange={(v) => updateField("showCustomerDetails", v)}
              />
              <Toggle
                label="Tax inclusive pricing"
                hint="Menu price mein tax already included hai."
                checked={form.taxInclusive}
                onChange={(v) => updateField("taxInclusive", v)}
              />
            </div>
          </Card>
        </div>

        <SaveBar
          isDirty={isDirty}
          isSaving={isSaving}
          isFetching={isFetching}
          isLoading={isLoading}
          isReadOnly={!isOwner}
          readOnlyHint="Sirf owner settings change kar sakta hai"
          onRefresh={refetch}
          onReset={() => setDraft(null)}
          saveLabel="Save Settings"
          color="emerald"
        />
      </form>
    </section>
  );
}
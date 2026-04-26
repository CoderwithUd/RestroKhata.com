"use client";

import { FormEvent, useMemo, useState } from "react";
import { useConfirm } from "@/components/confirm-provider";
import { getErrorMessage } from "@/lib/error";
import { showError, showSuccess } from "@/lib/feedback";
import {
  useCreateTenantStaffMutation,
  useDeleteTenantStaffMutation,
  useStaffRolesQuery,
  useTenantStaffQuery,
  useUpdateTenantStaffMutation,
} from "@/store/api/authApi";
import type { TenantStaffMember } from "@/store/types/auth";

type Props = { tenantName?: string };
type ViewMode = "grid" | "list";

type CreateStaffForm = {
  name: string;
  whatsappNumber: string;
  email: string;
  password: string;
  role: string;
};

type EditDraft = {
  name: string;
  whatsappNumber: string;
  email: string;
  password: string;
  role: string;
  isActive: boolean;
};

const FALLBACK_ROLES = ["MANAGER", "KITCHEN", "WAITER"];

const ROLE_META: Record<string, { bg: string; text: string; border: string; dot: string; lightBg: string }> = {
  MANAGER: {
    bg: "bg-violet-100",
    text: "text-violet-800",
    border: "border-violet-200",
    dot: "bg-violet-500",
    lightBg: "bg-violet-50",
  },
  KITCHEN: {
    bg: "bg-orange-100",
    text: "text-orange-800",
    border: "border-orange-200",
    dot: "bg-orange-500",
    lightBg: "bg-orange-50",
  },
  WAITER: {
    bg: "bg-sky-100",
    text: "text-sky-800",
    border: "border-sky-200",
    dot: "bg-sky-500",
    lightBg: "bg-sky-50",
  },
  DEFAULT: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
    dot: "bg-slate-400",
    lightBg: "bg-slate-50",
  },
};

function getRoleMeta(role: string) {
  return ROLE_META[normalizeRole(role)] ?? ROLE_META.DEFAULT;
}

function normalizeRole(role?: string): string {
  return (role || "").trim().toUpperCase() || "WAITER";
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

function defaultCreateForm(roles: string[]): CreateStaffForm {
  return { name: "", whatsappNumber: "", email: "", password: "", role: roles[0] || "WAITER" };
}

function toSafeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidPhone(value: string): boolean {
  return value.replace(/\D/g, "").length >= 10;
}

function isValidEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value);
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase()
    .slice(0, 2) || "??";
}

// ─── Minimal Icon Set ────────────────────────────────────────────────────────
const Icon = {
  Close: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Plus: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  ),
  Search: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Grid: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  List: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  Edit: () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  ),
  Trash: () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  Refresh: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  Phone: () => (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  ),
  Mail: () => (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Lock: () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  Users: () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  ),
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function Avatar({ name, role, size = "md" }: { name: string; role: string; size?: "sm" | "md" | "lg" }) {
  const m = getRoleMeta(role);
  const sz =
    size === "sm"
      ? "w-8 h-8 text-xs"
      : size === "lg"
      ? "w-12 h-12 text-base"
      : "w-9 h-9 text-xs";
  return (
    <div
      className={`${sz} rounded-xl ${m.bg} ${m.border} border-[1.5px] flex items-center justify-center flex-shrink-0`}
    >
      <span className={`font-bold tracking-tight ${m.text}`}>{getInitials(name)}</span>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const m = getRoleMeta(role);
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold tracking-wide ${m.lightBg} ${m.text}`}
    >
      <span className={`w-1 h-1 rounded-full ${m.dot}`} />
      {normalizeRole(role)}
    </span>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      <span
        className={`w-1 h-1 rounded-full ${
          active ? "bg-emerald-500" : "bg-slate-400"
        }`}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function Modal({
  onClose,
  children,
  title,
  subtitle,
}: {
  onClose: () => void;
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md max-h-[90dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
        {/* Modal Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between rounded-t-2xl sm:rounded-t-2xl">
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-all"
          >
            <Icon.Close />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function FormField({
  label,
  icon,
  children,
  required,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
        {icon && <span className="opacity-60">{icon}</span>}
        {label}
        {required && <span className="text-red-400 normal-case font-normal">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:outline-none transition-all";

function RoleSelector({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (r: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((role) => {
        const m = getRoleMeta(role);
        const active = value === role;
        return (
          <button
            key={role}
            type="button"
            onClick={() => onChange(role)}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border transition-all ${
              active
                ? `${m.bg} ${m.text} ${m.border} ring-1 ring-offset-0 ring-current/40`
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${active ? m.dot : "bg-slate-300"}`} />
            {role}
          </button>
        );
      })}
    </div>
  );
}

function ToggleSwitch({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      onClick={() => onChange(!value)}
      className={`flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer select-none transition-all ${
        value
          ? "bg-emerald-50 border-emerald-200"
          : "bg-slate-50 border-slate-200"
      }`}
    >
      <div>
        <p
          className={`text-sm font-semibold ${
            value ? "text-emerald-700" : "text-slate-600"
          }`}
        >
          {value ? "Active" : "Inactive"}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {value ? "Member can log in and use the system" : "Access is currently suspended"}
        </p>
      </div>
      <div
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
          value ? "bg-emerald-500" : "bg-slate-300"
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
            value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </div>
    </div>
  );
}

function ActionButtons({
  onEdit,
  onDelete,
  disabled,
}: {
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onEdit}
        className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 hover:border-slate-300 transition-all"
      >
        <Icon.Edit />
        <span>Edit</span>
      </button>
      <button
        onClick={onDelete}
        disabled={disabled}
        className="h-7 w-7 rounded-lg border border-red-100 flex items-center justify-center text-red-400 hover:bg-red-50 hover:border-red-200 transition-all disabled:opacity-40"
      >
        <Icon.Trash />
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function StaffWorkspace({ tenantName }: Props) {
  const confirm = useConfirm();
  const { data: rolesPayload } = useStaffRolesQuery();
  const { data: staffPayload, isLoading, isFetching, refetch } = useTenantStaffQuery();
  const [createStaff, { isLoading: isCreating }] = useCreateTenantStaffMutation();
  const [updateStaff, { isLoading: isUpdating }] = useUpdateTenantStaffMutation();
  const [deleteStaff, { isLoading: isDeleting }] = useDeleteTenantStaffMutation();

  const roleOptions = useMemo(() => {
    const list = (rolesPayload?.roles || []).map((r) => normalizeRole(r)).filter(Boolean);
    return Array.from(new Set(list.length ? list : FALLBACK_ROLES));
  }, [rolesPayload?.roles]);

  const staffItems = useMemo(
    () =>
      (staffPayload?.items || [])
        .slice()
        .sort((a, b) =>
          `${a.role}-${a.user.name}`.localeCompare(`${b.role}-${b.user.name}`)
        ),
    [staffPayload?.items]
  );

  const [createForm, setCreateForm] = useState<CreateStaffForm>(() =>
    defaultCreateForm(FALLBACK_ROLES)
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingMember, setEditingMember] = useState<TenantStaffMember | null>(null);
  const [edits, setEdits] = useState<Record<string, EditDraft>>({});
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const activeCount = staffItems.filter((m) => m.isActive ?? true).length;
  const inactiveCount = staffItems.length - activeCount;

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staffItems.filter((m) => {
      const role = normalizeRole(m.role);
      const active = m.isActive ?? true;
      if (roleFilter !== "all" && role !== roleFilter) return false;
      if (statusFilter === "active" && !active) return false;
      if (statusFilter === "inactive" && active) return false;
      if (!q) return true;
      return `${m.user.name} ${m.user.email} ${m.user.whatsappNumber} ${role}`
        .toLowerCase()
        .includes(q);
    });
  }, [roleFilter, search, staffItems, statusFilter]);

  function getDraft(m: TenantStaffMember): EditDraft {
    return (
      edits[m.membershipId] || {
        name: m.user.name || "",
        whatsappNumber: m.user.whatsappNumber || "",
        email: m.user.email || "",
        password: "",
        role: normalizeRole(m.role),
        isActive: m.isActive ?? true,
      }
    );
  }

  function setDraft(membershipId: string, next: Partial<EditDraft>, m: TenantStaffMember) {
    setEdits((p) => ({ ...p, [membershipId]: { ...getDraft(m), ...next } }));
  }

  function openEdit(m: TenantStaffMember) {
    setDraft(m.membershipId, {}, m);
    setEditingMember(m);
  }

  async function submitCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!createForm.name.trim()) return showError("Staff name is required");
    if (!isValidPhone(createForm.whatsappNumber)) return showError("Valid WhatsApp number required");
    if (createForm.email.trim() && !isValidEmail(toSafeEmail(createForm.email)))
      return showError("Enter a valid email");
    if (!createForm.password.trim() || createForm.password.trim().length < 6)
      return showError("Password must be at least 6 characters");
    try {
      const res = await createStaff({
        name: createForm.name.trim(),
        whatsappNumber: createForm.whatsappNumber.trim(),
        email: createForm.email.trim() ? toSafeEmail(createForm.email) : undefined,
        password: createForm.password.trim(),
        role: normalizeRole(createForm.role),
      }).unwrap();
      setCreateForm(defaultCreateForm(roleOptions));
      setCreateOpen(false);
      showSuccess(res.message || "Staff member added");
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  async function saveMember(m: TenantStaffMember) {
    const draft = getDraft(m);
    if (!draft.name.trim()) return showError("Name is required");
    if (!isValidPhone(draft.whatsappNumber)) return showError("Valid WhatsApp number required");
    if (draft.email.trim() && !isValidEmail(toSafeEmail(draft.email)))
      return showError("Enter a valid email");
    if (draft.password.trim() && draft.password.trim().length < 6)
      return showError("Password must be at least 6 characters");
    try {
      const res = await updateStaff({
        membershipId: m.membershipId,
        userId: m.user.id,
        payload: {
          name: draft.name.trim(),
          whatsappNumber: draft.whatsappNumber.trim(),
          email: draft.email.trim() ? toSafeEmail(draft.email) : "",
          password: draft.password.trim() || undefined,
          role: normalizeRole(draft.role),
          isActive: draft.isActive,
        },
      }).unwrap();
      showSuccess(res.message || "Changes saved");
      setEditingMember(null);
      setEdits((p) => {
        const n = { ...p };
        delete n[m.membershipId];
        return n;
      });
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  async function removeMember(m: TenantStaffMember) {
    const ok = await confirm({
      title: "Remove Staff Member",
      message: `Remove ${m.user.name || "this member"}? They'll immediately lose system access.`,
      confirmText: "Remove",
      cancelText: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const res = await deleteStaff({ membershipId: m.membershipId, userId: m.user.id }).unwrap();
      showSuccess(res.message || "Staff member removed");
      setEdits((p) => {
        const n = { ...p };
        delete n[m.membershipId];
        return n;
      });
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50">

        {/* ── Sticky Header ─────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-100">
          <div className="px-4 pt-3.5 pb-2 space-y-2.5">

            {/* Row 1: Title + Actions */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <h1 className="text-base font-bold text-slate-900 tracking-tight">Staff</h1>
                  <span className="text-xs text-slate-400 font-medium truncate">{tenantName}</span>
                </div>
                {/* Compact stat pills */}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] font-semibold text-slate-700">
                    {staffItems.length} total
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-[11px] font-medium text-emerald-600">
                    {activeCount} active
                  </span>
                  {inactiveCount > 0 && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-[11px] font-medium text-slate-400">
                        {inactiveCount} inactive
                      </span>
                    </>
                  )}
                  {roleOptions.map((r) => {
                    const count = staffItems.filter((m) => normalizeRole(m.role) === r).length;
                    const meta = getRoleMeta(r);
                    return count > 0 ? (
                      <span key={r} className="text-slate-300">·</span>
                    ) : null;
                  })}
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition-all"
                >
                  <Icon.Refresh />
                </button>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="flex items-center gap-1 h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-sm shadow-amber-200/60 transition-all active:scale-95"
                >
                  <Icon.Plus />
                  <span>Add Staff</span>
                </button>
              </div>
            </div>

            {/* Row 2: Search + View toggle */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <Icon.Search />
                </span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, phone, role…"
                  className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-amber-400 focus:ring-1 focus:ring-amber-100 focus:outline-none transition-all"
                />
              </div>
              <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`h-7 w-7 rounded-md flex items-center justify-center transition-all ${
                    viewMode === "grid"
                      ? "bg-white shadow-sm text-amber-600"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <Icon.Grid />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`h-7 w-7 rounded-md flex items-center justify-center transition-all ${
                    viewMode === "list"
                      ? "bg-white shadow-sm text-amber-600"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <Icon.List />
                </button>
              </div>
            </div>

            {/* Row 3: Compact filter chips */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
              {/* Status filters */}
              {(["all", "active", "inactive"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`flex-shrink-0 h-6 px-2.5 rounded-full text-[11px] font-semibold border transition-all capitalize ${
                    statusFilter === f
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {f === "all"
                    ? `All · ${staffItems.length}`
                    : f === "active"
                    ? `Active · ${activeCount}`
                    : `Inactive · ${inactiveCount}`}
                </button>
              ))}

              <span className="h-6 w-px bg-slate-200 flex-shrink-0 self-center" />

              {/* Role filters */}
              <button
                onClick={() => setRoleFilter("all")}
                className={`flex-shrink-0 h-6 px-2.5 rounded-full text-[11px] font-semibold border transition-all ${
                  roleFilter === "all"
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                All roles
              </button>
              {roleOptions.map((role) => {
                const m = getRoleMeta(role);
                const isActive = roleFilter === role;
                return (
                  <button
                    key={role}
                    onClick={() => setRoleFilter(role)}
                    className={`flex-shrink-0 h-6 px-2.5 rounded-full text-[11px] font-semibold border transition-all flex items-center gap-1 ${
                      isActive
                        ? `${m.bg} ${m.text} ${m.border}`
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span className={`w-1 h-1 rounded-full ${isActive ? m.dot : "bg-slate-300"}`} />
                    {role}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Content Area ──────────────────────────────────────────────────── */}
        <div className="p-3">
          {/* Results count */}
          {!isLoading && staffItems.length > 0 && (
            <p className="text-[11px] text-slate-400 font-medium mb-2 px-0.5">
              {filteredStaff.length === staffItems.length
                ? `${staffItems.length} members`
                : `${filteredStaff.length} of ${staffItems.length} shown`}
            </p>
          )}

          {/* Loading */}
          {isLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filteredStaff.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3 text-slate-300">
                <Icon.Users />
              </div>
              <p className="text-sm font-semibold text-slate-600">No staff found</p>
              <p className="text-xs text-slate-400 mt-1">
                {search ? "Try a different search term" : "Add your first staff member"}
              </p>
              {!search && (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="mt-4 flex items-center gap-1.5 h-8 px-4 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-all"
                >
                  <Icon.Plus />
                  Add Staff
                </button>
              )}
            </div>
          ) : viewMode === "grid" ? (
            /* ── Horizontal Card Rows ─────────────────────────────────────── */
            <div className="space-y-1.5">
              {filteredStaff.map((member) => {
                const role = normalizeRole(member.role);
                const isActive = member.isActive ?? true;
                return (
                  <div
                    key={member.membershipId}
                    className={`bg-white rounded-xl border border-slate-100 flex items-center gap-3 px-3.5 py-2.5 hover:border-slate-200 hover:shadow-sm transition-all group ${
                      !isActive ? "opacity-55" : ""
                    }`}
                    onClick={() => openEdit(member)}
                  >
                    <Avatar name={member.user.name || "?"} role={role} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate leading-tight">
                        {member.user.name || "Unnamed"}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {normalizeRole(role)}{member.user.whatsappNumber ? ` · ${member.user.whatsappNumber}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`w-2 h-2 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-300"}`} />
                      <RoleBadge role={role} />
                      <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(member)} className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all">
                          <Icon.Edit />
                        </button>
                        <button onClick={() => removeMember(member)} disabled={isDeleting} className="h-7 w-7 rounded-lg flex items-center justify-center text-red-300 hover:bg-red-50 hover:text-red-500 transition-all disabled:opacity-40">
                          <Icon.Trash />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── List View ────────────────────────────────────────────────── */
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Member
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">
                        Contact
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredStaff.map((member) => {
                      const role = normalizeRole(member.role);
                      const isActive = member.isActive ?? true;
                      return (
                        <tr
                          key={member.membershipId}
                          className={`hover:bg-slate-50/60 transition-colors ${
                            !isActive ? "opacity-60" : ""
                          }`}
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <Avatar name={member.user.name || "?"} role={role} size="sm" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-900 truncate">
                                  {member.user.name || "Unnamed"}
                                </p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <StatusDot active={isActive} />
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 hidden sm:table-cell">
                            <div className="space-y-0.5">
                              {member.user.whatsappNumber && (
                                <div className="flex items-center gap-1 text-[11px] text-slate-600">
                                  <Icon.Phone />
                                  {member.user.whatsappNumber}
                                </div>
                              )}
                              {member.user.email && (
                                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                  <Icon.Mail />
                                  {member.user.email}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <RoleBadge role={role} />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex justify-end">
                              <ActionButtons
                                onEdit={() => openEdit(member)}
                                onDelete={() => removeMember(member)}
                                disabled={isDeleting}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Create Modal ───────────────────────────────────────────────────── */}
      {createOpen && (
        <Modal
          onClose={() => setCreateOpen(false)}
          title="Add Staff Member"
          subtitle="New member will be able to log in immediately"
        >
          <form onSubmit={submitCreate} className="space-y-3.5">
            <FormField label="Full Name" required>
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Rahul Sharma"
                className={inputCls}
                required
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="WhatsApp" icon={<Icon.Phone />} required>
                <input
                  value={createForm.whatsappNumber}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, whatsappNumber: normalizePhone(e.target.value) }))
                  }
                  placeholder="+91 98765…"
                  inputMode="tel"
                  className={inputCls}
                />
              </FormField>
              <FormField label="Email" icon={<Icon.Mail />}>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="Optional"
                  className={inputCls}
                />
              </FormField>
            </div>

            <FormField label="Role">
              <RoleSelector
                options={roleOptions}
                value={createForm.role}
                onChange={(role) => setCreateForm((p) => ({ ...p, role }))}
              />
            </FormField>

            <FormField label="Password" icon={<Icon.Lock />} required>
              <input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Min 6 characters"
                className={inputCls}
              />
            </FormField>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="flex-1 h-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold shadow-sm shadow-amber-200/70 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isCreating ? "Adding…" : "Add Member"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Edit Modal ─────────────────────────────────────────────────────── */}
      {editingMember && (
        <Modal
          onClose={() => setEditingMember(null)}
          title={editingMember.user.name || "Staff Member"}
          subtitle={`Edit · ${normalizeRole(editingMember.role)}`}
        >
          <div className="space-y-3.5">
            <FormField label="Full Name" required>
              <input
                value={getDraft(editingMember).name}
                onChange={(e) =>
                  setDraft(editingMember.membershipId, { name: e.target.value }, editingMember)
                }
                placeholder="Full name"
                className={inputCls}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="WhatsApp" icon={<Icon.Phone />} required>
                <input
                  value={getDraft(editingMember).whatsappNumber}
                  onChange={(e) =>
                    setDraft(
                      editingMember.membershipId,
                      { whatsappNumber: normalizePhone(e.target.value) },
                      editingMember
                    )
                  }
                  placeholder="+91…"
                  inputMode="tel"
                  className={inputCls}
                />
              </FormField>
              <FormField label="Email" icon={<Icon.Mail />}>
                <input
                  type="email"
                  value={getDraft(editingMember).email}
                  onChange={(e) =>
                    setDraft(editingMember.membershipId, { email: e.target.value }, editingMember)
                  }
                  placeholder="Optional"
                  className={inputCls}
                />
              </FormField>
            </div>

            <FormField label="Role">
              <RoleSelector
                options={roleOptions}
                value={getDraft(editingMember).role}
                onChange={(role) =>
                  setDraft(editingMember.membershipId, { role }, editingMember)
                }
              />
            </FormField>

            <FormField label="New Password" icon={<Icon.Lock />}>
              <input
                type="password"
                value={getDraft(editingMember).password}
                onChange={(e) =>
                  setDraft(editingMember.membershipId, { password: e.target.value }, editingMember)
                }
                placeholder="Leave blank to keep current"
                className={inputCls}
              />
            </FormField>

            <FormField label="Status">
              <ToggleSwitch
                value={getDraft(editingMember).isActive}
                onChange={(isActive) =>
                  setDraft(editingMember.membershipId, { isActive }, editingMember)
                }
              />
            </FormField>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveMember(editingMember)}
                disabled={isUpdating}
                className="flex-1 h-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold shadow-sm shadow-amber-200/70 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isUpdating ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
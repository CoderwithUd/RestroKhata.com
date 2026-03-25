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
type StaffListViewMode = "grid" | "table";

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

function normalizeRole(role?: string): string {
  const value = (role || "").trim().toUpperCase();
  return value || "WAITER";
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

function defaultCreateForm(roles: string[]): CreateStaffForm {
  return {
    name: "",
    whatsappNumber: "",
    email: "",
    password: "",
    role: roles[0] || "WAITER",
  };
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

export function StaffWorkspace({ tenantName }: Props) {
  const confirm = useConfirm();
  const { data: rolesPayload } = useStaffRolesQuery();
  const { data: staffPayload, isLoading, isFetching, refetch } = useTenantStaffQuery();
  const [createStaff, { isLoading: isCreating }] = useCreateTenantStaffMutation();
  const [updateStaff, { isLoading: isUpdating }] = useUpdateTenantStaffMutation();
  const [deleteStaff, { isLoading: isDeleting }] = useDeleteTenantStaffMutation();

  const roleOptions = useMemo(() => {
    const list = (rolesPayload?.roles || []).map((role) => normalizeRole(role)).filter(Boolean);
    return Array.from(new Set(list.length ? list : FALLBACK_ROLES));
  }, [rolesPayload?.roles]);

  const staffItems = useMemo(
    () =>
      (staffPayload?.items || [])
        .slice()
        .sort((a, b) => `${a.role || ""}-${a.user.name || ""}`.localeCompare(`${b.role || ""}-${b.user.name || ""}`)),
    [staffPayload?.items],
  );

  const [createForm, setCreateForm] = useState<CreateStaffForm>(() => defaultCreateForm(FALLBACK_ROLES));
  const [isCreateStaffOpen, setIsCreateStaffOpen] = useState(false);
  const [staffListViewMode, setStaffListViewMode] = useState<StaffListViewMode>("grid");
  const [editingMember, setEditingMember] = useState<TenantStaffMember | null>(null);
  const [edits, setEdits] = useState<Record<string, EditDraft>>({});
  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const filteredStaff = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return staffItems.filter((member) => {
      const role = normalizeRole(member.role);
      const isActive = member.isActive ?? true;

      if (roleFilter !== "all" && role !== roleFilter) return false;
      if (statusFilter === "active" && !isActive) return false;
      if (statusFilter === "inactive" && isActive) return false;
      if (!q) return true;

      const content = `${member.user.name || ""} ${member.user.email || ""} ${member.user.whatsappNumber || ""} ${role}`.toLowerCase();
      return content.includes(q);
    });
  }, [roleFilter, searchText, staffItems, statusFilter]);

  const activeCount = staffItems.filter((member) => member.isActive ?? true).length;
  const inactiveCount = staffItems.length - activeCount;

  function getDraft(member: TenantStaffMember): EditDraft {
    return (
      edits[member.membershipId] || {
        name: member.user.name || "",
        whatsappNumber: member.user.whatsappNumber || "",
        email: member.user.email || "",
        password: "",
        role: normalizeRole(member.role),
        isActive: member.isActive ?? true,
      }
    );
  }

  function setMemberDraft(membershipId: string, next: Partial<EditDraft>, member: TenantStaffMember) {
    setEdits((prev) => {
      const base = prev[membershipId] || getDraft(member);
      return {
        ...prev,
        [membershipId]: { ...base, ...next },
      };
    });
  }

  function openMemberEditor(member: TenantStaffMember) {
    setMemberDraft(member.membershipId, {}, member);
    setEditingMember(member);
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createForm.name.trim()) {
      showError("Staff name is required");
      return;
    }
    if (!isValidPhone(createForm.whatsappNumber)) {
      showError("Valid WhatsApp number is required");
      return;
    }
    if (createForm.email.trim() && !isValidEmail(toSafeEmail(createForm.email))) {
      showError("Enter a valid email address");
      return;
    }
    if (!createForm.password.trim() || createForm.password.trim().length < 6) {
      showError("Password minimum 6 chars");
      return;
    }

    try {
      const response = await createStaff({
        name: createForm.name.trim(),
        whatsappNumber: createForm.whatsappNumber.trim(),
        email: createForm.email.trim() ? toSafeEmail(createForm.email) : undefined,
        password: createForm.password.trim(),
        role: normalizeRole(createForm.role),
      }).unwrap();
      setCreateForm(defaultCreateForm(roleOptions));
      setIsCreateStaffOpen(false);
      showSuccess(response.message || "Staff created");
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  async function saveMember(member: TenantStaffMember) {
    const draft = getDraft(member);
    if (!draft.name.trim()) {
      showError("Staff name is required");
      return;
    }
    if (!isValidPhone(draft.whatsappNumber)) {
      showError("Valid WhatsApp number is required");
      return;
    }
    if (draft.email.trim() && !isValidEmail(toSafeEmail(draft.email))) {
      showError("Enter a valid email address");
      return;
    }
    if (draft.password.trim() && draft.password.trim().length < 6) {
      showError("New password minimum 6 chars");
      return;
    }

    try {
      const response = await updateStaff({
        membershipId: member.membershipId,
        userId: member.user.id,
        payload: {
          name: draft.name.trim(),
          whatsappNumber: draft.whatsappNumber.trim(),
          email: draft.email.trim() ? toSafeEmail(draft.email) : "",
          password: draft.password.trim() || undefined,
          role: normalizeRole(draft.role),
          isActive: draft.isActive,
        },
      }).unwrap();
      showSuccess(response.message || "Staff updated");
    } catch (e) {
      showError(getErrorMessage(e));
      return;
    }

    setEditingMember(null);
    setEdits((prev) => {
      const next = { ...prev };
      delete next[member.membershipId];
      return next;
    });
  }

  async function removeMember(member: TenantStaffMember) {
    const approved = await confirm({
      title: "Delete Staff",
      message: `Delete ${member.user.name || member.user.whatsappNumber || "this staff"}? Access for this account will be removed from this tenant.`,
      confirmText: "Delete Staff",
      cancelText: "Keep Staff",
      tone: "danger",
    });
    if (!approved) return;

    try {
      const response = await deleteStaff({
        membershipId: member.membershipId,
        userId: member.user.id,
      }).unwrap();
      showSuccess(response.message || "Staff deleted");
      setEdits((prev) => {
        const next = { ...prev };
        delete next[member.membershipId];
        return next;
      });
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  return (
    <>
      <section className="mt-1 grid gap-3 sm:mt-2 sm:gap-4">
        {isCreateStaffOpen ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-6">
            <button
              type="button"
              aria-label="Close create staff panel"
              className="absolute inset-0 bg-slate-900/35"
              onClick={() => setIsCreateStaffOpen(false)}
            />
            <article className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#e6dfd1] bg-[#fffdf9] p-3 shadow-2xl sm:p-5">
              <div className="mb-3 flex items-center justify-between sm:mb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Quick Add</p>
                  <h4 className="text-lg font-semibold text-slate-900">Add Staff</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateStaffOpen(false)}
                  className="h-8 w-8 rounded-full border border-[#e0d8c9] bg-white text-lg leading-none text-slate-700"
                  aria-label="Close popup"
                >
                  x
                </button>
              </div>
              <form onSubmit={submitCreate} className="space-y-3">
                <input
                  value={createForm.name}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                  placeholder="Full name"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    value={createForm.whatsappNumber}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, whatsappNumber: normalizePhone(event.target.value) }))
                    }
                    className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                    placeholder="WhatsApp number"
                    inputMode="tel"
                  />
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                    placeholder="Email optional"
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    value={createForm.role}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, role: normalizeRole(event.target.value) }))}
                    className="h-11 rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm"
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))}
                    className="h-11 rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                    placeholder="Password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 disabled:opacity-60"
                >
                  {isCreating ? "Creating..." : "Create Staff"}
                </button>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl border border-[#ebdfc8] bg-white p-2">
                    <p className="text-slate-500">Total</p>
                    <p className="mt-1 text-base font-semibold">{staffItems.length}</p>
                  </div>
                  <div className="rounded-xl border border-[#ebdfc8] bg-white p-2">
                    <p className="text-slate-500">Active</p>
                    <p className="mt-1 text-base font-semibold">{activeCount}</p>
                  </div>
                  <div className="rounded-xl border border-[#ebdfc8] bg-white p-2">
                    <p className="text-slate-500">Inactive</p>
                    <p className="mt-1 text-base font-semibold">{inactiveCount}</p>
                  </div>
                </div>
              </form>
            </article>
          </div>
        ) : null}

        <article
          aria-label={`${tenantName || "Restaurant"} staff workspace`}
          className="min-w-0 rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm"
        >
          <div className="border-b border-[#eee7d8] px-2.5 py-2.5 sm:px-4 sm:py-3">
            <div className="mt-2.5 rounded-xl border border-[#eadfc9] bg-[#fffaf1] p-2.5 sm:mt-3 sm:p-3">
              <div className="flex items-center gap-2">
                <div className="flex shrink-0 flex-col items-center leading-none">
                  <span className="text-lg font-bold text-slate-700">{isLoading ? "..." : filteredStaff.length}</span>
                  <span className="text-[10px] font-medium text-slate-700">staff</span>
                </div>
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search..."
                  className="h-10 min-w-0 flex-1 rounded-xl border border-[#dcccaf] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                />
                <div className="flex shrink-0 items-center rounded-lg border border-[#dccfb8] bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setStaffListViewMode("grid")}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                      staffListViewMode === "grid" ? "bg-[#f6ead4] text-[#7a5a34]" : "text-slate-600"
                    }`}
                  >
                    Grid
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaffListViewMode("table")}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                      staffListViewMode === "table" ? "bg-[#f6ead4] text-[#7a5a34]" : "text-slate-600"
                    }`}
                  >
                    Table
                  </button>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-10 md:items-center">
                <div className="md:col-span-7">
                  <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap no-scrollbar">
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Role</span>
                    <button
                      type="button"
                      onClick={() => setRoleFilter("all")}
                      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                        roleFilter === "all"
                          ? "border-amber-300 bg-amber-100 text-amber-800"
                          : "border-[#ddcfb7] bg-white text-slate-700"
                      }`}
                    >
                      All
                    </button>
                    {roleOptions.map((role) => (
                      <button
                        key={`staff-role-chip-${role}`}
                        type="button"
                        onClick={() => setRoleFilter(role)}
                        className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                          roleFilter === role
                            ? "border-amber-300 bg-amber-100 text-amber-800"
                            : "border-[#ddcfb7] bg-white text-slate-700"
                        }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-3">
                  <div className="flex items-center justify-start gap-2 overflow-x-auto whitespace-nowrap no-scrollbar md:justify-end">
                    <button
                      type="button"
                      onClick={() => setStatusFilter((prev) => (prev === "active" ? "all" : "active"))}
                      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                        statusFilter === "active"
                          ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                          : "border-[#ddcfb7] bg-white text-slate-700"
                      }`}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter((prev) => (prev === "inactive" ? "all" : "inactive"))}
                      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                        statusFilter === "inactive"
                          ? "border-slate-300 bg-slate-100 text-slate-700"
                          : "border-[#ddcfb7] bg-white text-slate-700"
                      }`}
                    >
                      Inactive
                    </button>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="shrink-0 rounded-lg border border-[#e0d8c9] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {isFetching ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCreateStaffOpen(true)}
                className="mt-3 w-full rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 shadow-sm transition-all hover:border-amber-400 hover:bg-amber-100 hover:shadow-md active:scale-[0.98]"
              >
                + Add Staff
              </button>
            </div>
          </div>

          <div className="p-2.5 sm:p-4">
            {filteredStaff.length ? (
              staffListViewMode === "grid" ? (
                <div className="space-y-2">
                  {filteredStaff.map((member) => {
                    const role = normalizeRole(member.role);
                    const isActive = member.isActive ?? true;
                    return (
                      <article
                        key={member.membershipId}
                        className="rounded-xl border border-[#eadfc9] bg-[linear-gradient(160deg,#fffcf6_0%,#fff7e8_100%)] p-2.5 sm:p-3"
                      >
                        <div className="grid gap-2 lg:grid-cols-[1.4fr_.8fr_.7fr_.8fr]">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{member.user.name || "No name"}</p>
                            <p className="truncate text-xs text-slate-500">{member.user.whatsappNumber || "No WhatsApp"}</p>
                            <p className="truncate text-xs text-slate-400">{member.user.email || "No email"}</p>
                          </div>

                          <p className="inline-flex h-10 items-center rounded-lg border border-[#ddd4c1] bg-white px-2.5 text-xs font-semibold text-slate-700">
                            {role}
                          </p>

                          <p
                            className={`inline-flex h-10 items-center justify-center rounded-lg border px-2.5 text-xs font-semibold ${
                              isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-slate-100 text-slate-700"
                            }`}
                          >
                            {isActive ? "Active" : "Inactive"}
                          </p>

                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => openMemberEditor(member)}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-2 text-[11px] font-semibold text-blue-700"
                            >
                              Update
                            </button>
                            <button
                              type="button"
                              onClick={() => removeMember(member)}
                              disabled={isDeleting}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="no-scrollbar -mx-1 overflow-x-auto overscroll-x-contain px-1 sm:mx-0 sm:px-0">
                  <table className="w-full min-w-[860px] divide-y divide-[#efe4d3] rounded-xl border border-[#eadfc9] bg-white text-left text-xs whitespace-nowrap sm:min-w-full">
                    <thead className="bg-[#fff8ec]">
                      <tr className="text-slate-700">
                        <th className="px-2.5 py-2 font-semibold sm:px-3">Name</th>
                        <th className="px-2.5 py-2 font-semibold sm:px-3">WhatsApp</th>
                        <th className="px-2.5 py-2 font-semibold sm:px-3">Email</th>
                        <th className="px-2.5 py-2 font-semibold sm:px-3">Role</th>
                        <th className="px-2.5 py-2 font-semibold sm:px-3">Status</th>
                        <th className="px-2.5 py-2 font-semibold text-right sm:px-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1e7d9] bg-white">
                      {filteredStaff.map((member) => {
                        const role = normalizeRole(member.role);
                        const isActive = member.isActive ?? true;
                        return (
                          <tr key={`staff-row-${member.membershipId}`}>
                            <td className="px-2.5 py-2 font-semibold text-slate-900 sm:px-3">{member.user.name || "No name"}</td>
                            <td className="px-2.5 py-2 text-slate-700 sm:px-3">{member.user.whatsappNumber || "-"}</td>
                            <td className="px-2.5 py-2 text-slate-700 sm:px-3">{member.user.email || "No email"}</td>
                            <td className="px-2.5 py-2 text-slate-700 sm:px-3">{role}</td>
                            <td className="px-2.5 py-2 sm:px-3">
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                  isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-slate-100 text-slate-700"
                                }`}
                              >
                                {isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td className="px-2.5 py-2 sm:px-3">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openMemberEditor(member)}
                                  className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700"
                                >
                                  Update
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeMember(member)}
                                  disabled={isDeleting}
                                  className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-dashed border-[#e0d6c4] bg-[#fffcf7] px-4 py-10 text-center text-sm text-slate-600">
                No staff found for selected filters.
              </div>
            )}
          </div>
        </article>
      </section>

      {editingMember ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setEditingMember(null)} />
          <section className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#e6dfd1] bg-[#fffdf9] p-3 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-center justify-between sm:mb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Quick Edit</p>
                <h4 className="text-lg font-semibold text-slate-900">Update Staff</h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="h-8 w-8 rounded-full border border-[#e0d8c9] bg-white text-lg leading-none text-slate-700"
                aria-label="Close popup"
              >
                x
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={getDraft(editingMember).name}
                onChange={(event) => setMemberDraft(editingMember.membershipId, { name: event.target.value }, editingMember)}
                className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                placeholder="Full name"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={getDraft(editingMember).whatsappNumber}
                  onChange={(event) =>
                    setMemberDraft(
                      editingMember.membershipId,
                      { whatsappNumber: normalizePhone(event.target.value) },
                      editingMember,
                    )
                  }
                  className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                  placeholder="WhatsApp number"
                  inputMode="tel"
                />
                <input
                  type="email"
                  value={getDraft(editingMember).email}
                  onChange={(event) => setMemberDraft(editingMember.membershipId, { email: event.target.value }, editingMember)}
                  className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                  placeholder="Email optional"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  value={getDraft(editingMember).role}
                  onChange={(event) =>
                    setMemberDraft(editingMember.membershipId, { role: normalizeRole(event.target.value) }, editingMember)
                  }
                  className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm"
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <input
                  type="password"
                  value={getDraft(editingMember).password}
                  onChange={(event) => setMemberDraft(editingMember.membershipId, { password: event.target.value }, editingMember)}
                  className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                  placeholder="New password optional"
                />
              </div>
              <label className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#ddd4c1] bg-white px-3 text-xs">
                <input
                  type="checkbox"
                  checked={getDraft(editingMember).isActive}
                  onChange={(event) =>
                    setMemberDraft(editingMember.membershipId, { isActive: event.target.checked }, editingMember)
                  }
                  className="h-4 w-4 rounded border-slate-300 text-amber-500"
                />
                {getDraft(editingMember).isActive ? "Active" : "Inactive"}
              </label>
              <button
                type="button"
                onClick={() => saveMember(editingMember)}
                disabled={isUpdating}
                className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isUpdating ? "Saving..." : "Update Staff"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

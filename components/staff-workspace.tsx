"use client";

import { FormEvent, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import {
  useCreateTenantStaffMutation,
  useDeleteTenantStaffMutation,
  useStaffRolesQuery,
  useTenantStaffQuery,
  useUpdateTenantStaffMutation,
} from "@/store/api/authApi";
import type { TenantStaffMember } from "@/store/types/auth";

type Props = { tenantName?: string };

type CreateStaffForm = {
  name: string;
  email: string;
  password: string;
  role: string;
};

type EditDraft = {
  role: string;
  isActive: boolean;
};

const FALLBACK_ROLES = ["MANAGER", "KITCHEN", "WAITER"];

function normalizeRole(role?: string): string {
  const value = (role || "").trim().toUpperCase();
  return value || "WAITER";
}

function defaultCreateForm(roles: string[]): CreateStaffForm {
  return {
    name: "",
    email: "",
    password: "",
    role: roles[0] || "WAITER",
  };
}

function toSafeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function StaffWorkspace({ tenantName }: Props) {
  const { data: rolesPayload } = useStaffRolesQuery();
  const { data: staffPayload, isLoading, isFetching, refetch } = useTenantStaffQuery();
  const [createStaff, { isLoading: isCreating }] = useCreateTenantStaffMutation();
  const [updateStaff, { isLoading: isUpdating }] = useUpdateTenantStaffMutation();
  const [deleteStaff, { isLoading: isDeleting }] = useDeleteTenantStaffMutation();

  const roleOptions = useMemo(() => {
    const list = (rolesPayload?.roles || []).map((role) => normalizeRole(role)).filter((role) => Boolean(role));
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
  const [edits, setEdits] = useState<Record<string, EditDraft>>({});
  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const filteredStaff = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return staffItems.filter((member) => {
      const role = normalizeRole(member.role);
      const isActive = member.isActive ?? true;

      if (roleFilter !== "all" && role !== roleFilter) return false;
      if (statusFilter === "active" && !isActive) return false;
      if (statusFilter === "inactive" && isActive) return false;
      if (!q) return true;

      const content = `${member.user.name || ""} ${member.user.email || ""} ${role}`.toLowerCase();
      return content.includes(q);
    });
  }, [roleFilter, searchText, staffItems, statusFilter]);

  const activeCount = staffItems.filter((member) => member.isActive ?? true).length;
  const inactiveCount = staffItems.length - activeCount;

  function getDraft(member: TenantStaffMember): EditDraft {
    return edits[member.membershipId] || {
      role: normalizeRole(member.role),
      isActive: member.isActive ?? true,
    };
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

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    if (!createForm.name.trim()) return setError("Staff name is required");
    if (!toSafeEmail(createForm.email)) return setError("Valid email is required");
    if (!createForm.password.trim() || createForm.password.trim().length < 6) return setError("Password minimum 6 chars");

    try {
      const response = await createStaff({
        name: createForm.name.trim(),
        email: toSafeEmail(createForm.email),
        password: createForm.password.trim(),
        role: normalizeRole(createForm.role),
      }).unwrap();
      setCreateForm(defaultCreateForm(roleOptions));
      setNotice(response.message || "Staff created");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function saveMember(member: TenantStaffMember) {
    setNotice("");
    setError("");
    const draft = getDraft(member);

    try {
      const response = await updateStaff({
        membershipId: member.membershipId,
        userId: member.user.id,
        payload: {
          role: normalizeRole(draft.role),
          isActive: draft.isActive,
        },
      }).unwrap();
      setNotice(response.message || "Staff updated");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function removeMember(member: TenantStaffMember) {
    if (!window.confirm(`Delete ${member.user.name || member.user.email || "this staff"}?`)) return;
    setNotice("");
    setError("");

    try {
      const response = await deleteStaff({
        membershipId: member.membershipId,
        userId: member.user.id,
      }).unwrap();
      setNotice(response.message || "Staff deleted");
      setEdits((prev) => {
        const next = { ...prev };
        delete next[member.membershipId];
        return next;
      });
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <section className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_1.95fr]">
      <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
        <div className="rounded-t-2xl bg-[linear-gradient(130deg,#dbeaf8_0%,#f7e6be_45%,#f3bc8b_100%)] px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Staff Control</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">Add Staff Fast</h3>
          <p className="mt-1 text-xs text-slate-700">One form, one click create. Role and active state list me direct update kar sakte ho.</p>
        </div>

        <form onSubmit={submitCreate} className="space-y-3 p-4">
          <input
            value={createForm.name}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
            className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
            placeholder="Full name"
          />
          <input
            type="email"
            value={createForm.email}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
            className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
            placeholder="staff@restaurant.com"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={createForm.role}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, role: normalizeRole(event.target.value) }))}
              className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
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
              className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
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
            <div className="rounded-lg border border-[#ebdfc8] bg-white p-2">
              <p className="text-slate-500">Total</p>
              <p className="mt-1 text-base font-semibold">{staffItems.length}</p>
            </div>
            <div className="rounded-lg border border-[#ebdfc8] bg-white p-2">
              <p className="text-slate-500">Active</p>
              <p className="mt-1 text-base font-semibold">{activeCount}</p>
            </div>
            <div className="rounded-lg border border-[#ebdfc8] bg-white p-2">
              <p className="text-slate-500">Inactive</p>
              <p className="mt-1 text-base font-semibold">{inactiveCount}</p>
            </div>
          </div>
        </form>
      </article>

      <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
        <div className="border-b border-[#eee7d8] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{tenantName || "Restaurant"} Staff</h3>
              <p className="text-xs text-slate-500">{isLoading ? "Loading..." : `${filteredStaff.length} staff shown`}</p>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              {isFetching ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search name/email/role"
              className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
            />
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm">
              <option value="all">All Roles</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")} className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {notice ? <p className="mx-4 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p> : null}
        {error ? <p className="mx-4 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}

        <div className="p-4">
          {filteredStaff.length ? (
            <div className="space-y-2">
              {filteredStaff.map((member) => {
                const draft = getDraft(member);
                const isActive = draft.isActive;
                return (
                  <article key={member.membershipId} className="rounded-xl border border-[#eadfc9] bg-[linear-gradient(160deg,#fffcf6_0%,#fff7e8_100%)] p-3">
                    <div className="grid gap-2 lg:grid-cols-[1.25fr_.9fr_.8fr_.6fr]">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{member.user.name || "No name"}</p>
                        <p className="truncate text-xs text-slate-500">{member.user.email || "No email"}</p>
                      </div>

                      <select
                        value={draft.role}
                        onChange={(event) => setMemberDraft(member.membershipId, { role: normalizeRole(event.target.value) }, member)}
                        className="h-10 rounded-lg border border-[#ddd4c1] bg-white px-2.5 text-xs"
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>

                      <label className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#ddd4c1] bg-white px-2.5 text-xs">
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={(event) => setMemberDraft(member.membershipId, { isActive: event.target.checked }, member)}
                          className="h-4 w-4 rounded border-slate-300 text-amber-500"
                        />
                        {isActive ? "Active" : "Inactive"}
                      </label>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => saveMember(member)}
                          disabled={isUpdating}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-2 text-[11px] font-semibold text-blue-700 disabled:opacity-60"
                        >
                          Save
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
            <div className="rounded-2xl border border-dashed border-[#e0d6c4] bg-[#fffcf7] px-4 py-10 text-center text-sm text-slate-600">
              No staff found for selected filters.
            </div>
          )}
        </div>
      </article>
    </section>
  );
}

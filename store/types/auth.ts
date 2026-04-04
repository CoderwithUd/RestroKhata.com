export type AuthUser = {
  id?: string;
  name?: string;
  email?: string;
  whatsappNumber?: string;
  role?: string;
};

export type AuthTenant = {
  id?: string;
  name?: string;
  slug?: string;
};

export type TenantAddress = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
};

export type TenantProfileTenant = AuthTenant & {
  status?: string;
  contactNumber?: string | null;
  email?: string | null;
  secondaryNumber?: string | null;
  ownerName?: string | null;
  gstNumber?: string | null;
  address?: TenantAddress | null;
};

export type SubscriptionPayload = {
  planCode?: string;
  status?: string;
  startsAt?: string;
  endsAt?: string;
};

export type TenantProfilePayload = {
  tenant: TenantProfileTenant | null;
  user: AuthUser | null;
  role?: string;
  subscription?: SubscriptionPayload | null;
};

export type StaffRolesPayload = {
  roles: string[];
};

export type ReportPeriod =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "all"
  | "custom";

export type ReportsSummaryQueryParams = {
  period?: ReportPeriod;
  from?: string;
  to?: string;
  tzOffsetMinutes?: number;
  weekStartsOn?: number;
};

type Metrics = {
  orders: number;
  invoices: number;
  paidInvoices: number;
  sales: number;
  expenses: number;
  profit: number;
};

export type ReportsMonthlyPayload = {
  timezone: string;

  range: {
    type: string; // "tenant_start_to_today_by_month"
    from: string; // "2026-03"
    to: string;   // "2026-04"
  };

  totals: Metrics;

  months: (Metrics & {
    month: string; // "2026-03"
    label: string; // "mar-2026"
  })[];
};


export type ReportsSummaryPayload = {
  timezone: string;

  range: {
    type: string; // e.g. "last_7_days"
    from: string;
    to: string;
  };

  thisMonth: {
    month: string;     // "2026-04"
    label: string;     // "apr-2026"
    orders: number;
    invoices: number;
    paidInvoices: number;
    sales: number;
    expenses: number;
    profit: number;
  };

  totals: {
    orders: number;
    invoices: number;
    paidInvoices: number;
    sales: number;
    expenses: number;
    profit: number;
  };

  days: DaySummary[];
};

export type DaySummary = {
  date: string;        // "2026-04-04"
  day: string;         // "sat"
  label: string;       // "04/04/26 sat"
  orders: number;
  invoices: number;
  paidInvoices: number;
  sales: number;
  expenses: number;
  profit: number;
};
export type TenantStaffUser = {
  id?: string;
  name?: string;
  email?: string;
  whatsappNumber?: string;
  isActive?: boolean;
};

export type TenantStaffMember = {
  membershipId: string;
  role?: string;
  isActive?: boolean;
  user: TenantStaffUser;
  raw: Record<string, unknown>;
};

export type TenantStaffListPayload = {
  items: TenantStaffMember[];
};

export type CreateTenantStaffPayload = {
  name: string;
  whatsappNumber: string;
  email?: string;
  password: string;
  role: string;
};

export type UpdateTenantStaffPayload = {
  role?: string;
  isActive?: boolean;
  name?: string;
  email?: string;
  whatsappNumber?: string;
  password?: string;
};

export type UpdateTenantStaffArgs = {
  membershipId: string;
  userId?: string;
  payload: UpdateTenantStaffPayload;
};

export type DeleteTenantStaffArgs = {
  membershipId: string;
  userId?: string;
};

export type TenantStaffMutationPayload = {
  message: string;
  staff?: TenantStaffMember | null;
};

export type UpdateTenantProfilePayload = {
  name?: string;
  contactNumber?: string | null;
  whatsappNumber?: string | null;
  secondaryNumber?: string | null;
  ownerName?: string | null;
  email?: string | null;
  gstNumber?: string | null;
  address?: TenantAddress | null;
};

export type SessionPayload = {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  token?: string | null;
  refreshToken?: string | null;
};

export type LoginPayload = {
  whatsappNumber?: string;
  email?: string;
  password: string;
  tenantSlug?: string;
};

export type RegisterPayload = {
  ownerName?: string;
  whatsappNumber: string;
  email: string;
  password: string;
  tenantName: string;
  tenantSlug?: string;
  gstNumber?: string;
  secondaryNumber?: string;
  address: {
    line1: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    line2?: string;
  };
};

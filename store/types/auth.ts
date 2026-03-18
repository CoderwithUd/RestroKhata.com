export type AuthUser = {
  id?: string;
  name?: string;
  email?: string;
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

export type ReportsSummaryPayload = {
  range: {
    period?: string;
    from?: string;
    to?: string;
    tzOffsetMinutes?: number;
    weekStartsOn?: number;
  };
  sales: {
    paidInvoices: number;
    grossSales: number;
    discountTotal: number;
    taxTotal: number;
    netSales: number;
    paidTotal: number;
    avgTicket: number;
  };
  orders: {
    total: number;
    byStatus: Record<string, number>;
  };
  invoices: {
    total: number;
    byStatus: Record<string, number>;
  };
  expenses: {
    total: number;
    count: number;
  };
  profitLoss: {
    netResult: number;
    profit: number;
    loss: number;
    note?: string;
  };
};

export type TenantStaffUser = {
  id?: string;
  name?: string;
  email?: string;
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
  email: string;
  password: string;
  role: string;
};

export type UpdateTenantStaffPayload = {
  role?: string;
  isActive?: boolean;
  name?: string;
  email?: string;
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
  gstNumber?: string | null;
  address?: TenantAddress | null;
};

export type SessionPayload = {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  token?: string | null;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  restaurantName: string;
};

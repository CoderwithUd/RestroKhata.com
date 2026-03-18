import { createApi } from "@reduxjs/toolkit/query/react";
import type { FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { io } from "socket.io-client";
import { parseAuthPayload } from "@/lib/auth-payload";
import { RAW_API_BASE_URL } from "@/lib/constants";
import { slugify } from "@/lib/slugify";
import { baseQueryWithReauth } from "@/store/api/baseQuery";
import type { RootState } from "@/store/store";
import type {
  AuthTenant,
  AuthUser,
  CreateTenantStaffPayload,
  DeleteTenantStaffArgs,
  LoginPayload,
  ReportsSummaryPayload,
  ReportsSummaryQueryParams,
  RegisterPayload,
  SessionPayload,
  StaffRolesPayload,
  TenantStaffListPayload,
  TenantStaffMember,
  TenantStaffMutationPayload,
  TenantProfilePayload,
  UpdateTenantProfilePayload,
  UpdateTenantStaffArgs,
} from "@/store/types/auth";
import type { OrderRecord, OrdersListPayload, OrdersQueryParams } from "@/store/types/orders";

type QueryResult = {
  data?: unknown;
  error?: FetchBaseQueryError;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "active"].includes(normalized)) return true;
    if (["false", "0", "no", "inactive"].includes(normalized)) return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
}

function parseSession(data: unknown): SessionPayload {
  const parsed = parseAuthPayload(data);
  const root = asRecord(data);
  const roleFromRoot = asString(root?.role);

  const user: AuthUser | null = parsed.user
    ? {
        ...parsed.user,
        role: parsed.user.role || roleFromRoot,
      }
    : null;

  const tenant: AuthTenant | null = parsed.tenant ? { ...parsed.tenant } : null;

  return {
    user,
    tenant,
    token: parsed.token,
  };
}

function parseTenantProfile(data: unknown): TenantProfilePayload {
  const parsed = parseAuthPayload(data);
  const root = asRecord(data);
  const tenantRecord = asRecord(root?.tenant);
  const addressRecord = asRecord(tenantRecord?.address);
  const subscriptionRecord = asRecord(root?.subscription);
  const userRecord = asRecord(root?.user);

  const user: AuthUser | null = parsed.user
    ? {
        ...parsed.user,
        id: parsed.user.id || asString(userRecord?.id) || asString(userRecord?._id),
        name: parsed.user.name || asString(userRecord?.name),
        email: parsed.user.email || asString(userRecord?.email),
        role: parsed.user.role || asString(root?.role),
      }
    : null;

  const tenant: TenantProfilePayload["tenant"] = parsed.tenant
    ? {
        ...parsed.tenant,
        status: asString(tenantRecord?.status),
        contactNumber: asString(tenantRecord?.contactNumber) ?? null,
        gstNumber: asString(tenantRecord?.gstNumber) ?? null,
        address: addressRecord
          ? {
              line1: asString(addressRecord.line1) ?? null,
              line2: asString(addressRecord.line2) ?? null,
              city: asString(addressRecord.city) ?? null,
              state: asString(addressRecord.state) ?? null,
              country: asString(addressRecord.country) ?? null,
              postalCode: asString(addressRecord.postalCode) ?? null,
            }
          : null,
      }
    : null;

  return {
    tenant,
    user,
    role: asString(root?.role),
    subscription: subscriptionRecord
      ? {
          planCode: asString(subscriptionRecord.planCode),
          status: asString(subscriptionRecord.status),
          startsAt: asString(subscriptionRecord.startsAt),
          endsAt: asString(subscriptionRecord.endsAt),
        }
      : null,
  };
}

function parseStaffMember(value: unknown): TenantStaffMember | null {
  const record = asRecord(value);
  if (!record) return null;

  const userRecord = asRecord(record.user);
  const membershipId = asString(record.membershipId) || asString(record.id) || asString(record._id);
  if (!membershipId) return null;

  return {
    membershipId,
    role: asString(record.role),
    isActive: asBoolean(record.isActive),
    user: {
      id: asString(userRecord?.id) || asString(userRecord?._id),
      name: asString(userRecord?.name),
      email: asString(userRecord?.email),
      isActive: asBoolean(userRecord?.isActive),
    },
    raw: record,
  };
}

function parseStaffList(data: unknown): TenantStaffListPayload {
  const root = asRecord(data);
  const nestedData = asRecord(root?.data);
  const rawItems =
    asArray(root?.items).length
      ? root?.items
      : asArray(root?.staff).length
        ? root?.staff
        : asArray(nestedData?.items).length
          ? nestedData?.items
          : asArray(nestedData?.staff).length
            ? nestedData?.staff
            : [];
  const items = asArray(rawItems).map(parseStaffMember).filter((staff): staff is TenantStaffMember => Boolean(staff));
  return { items };
}

function parseStaffRoles(data: unknown): StaffRolesPayload {
  const root = asRecord(data);
  const nestedData = asRecord(root?.data);
  const rawRoles = asArray(root?.roles).length ? root?.roles : nestedData?.roles;
  const roles = asArray(rawRoles).map((role) => asString(role)).filter((role): role is string => Boolean(role));
  return { roles };
}

function parseStaffMutation(data: unknown, fallbackMessage: string): TenantStaffMutationPayload {
  const root = asRecord(data);
  if (!root) {
    return { message: fallbackMessage };
  }

  return {
    message: asString(root.message) || fallbackMessage,
    staff: parseStaffMember(root.staff) || parseStaffMember(root.data) || parseStaffMember(root.member) || null,
  };
}

function parseOrderItemsSummary(record: Record<string, unknown>): string | undefined {
  const itemsArray = asArray(record.items).concat(asArray(record.orderItems));
  if (!itemsArray.length) {
    return asString(record.itemsText) || asString(record.itemsSummary) || undefined;
  }

  const parts = itemsArray
    .map((entry) => {
      const item = asRecord(entry);
      if (!item) return null;

      const name = asString(item.name) || asString(item.itemName) || asString(item.title);
      const quantity = asNumber(item.quantity) || asNumber(item.qty);

      if (!name) return null;
      return quantity && quantity > 1 ? `${name} x ${quantity}` : name;
    })
    .filter((value): value is string => Boolean(value));

  return parts.length ? parts.join(", ") : undefined;
}

function parseOrderRecord(value: unknown): OrderRecord | null {
  const record = asRecord(value);
  if (!record) return null;

  const tableRecord = asRecord(record.table);
  const customerRecord = asRecord(record.customer);

  const id =
    asString(record.id) ||
    asString(record._id) ||
    asString(record.orderId) ||
    asString(record.orderID) ||
    asString(record.orderNumber);

  if (!id) return null;

  const tableId = asString(record.tableId) || asString(tableRecord?.id) || asString(tableRecord?._id);
  const tableName =
    asString(record.tableName) ||
    asString(tableRecord?.name) ||
    asString(tableRecord?.tableName) ||
    (asNumber(tableRecord?.number) ? `Table ${asNumber(tableRecord?.number)}` : undefined);
  const customerName = asString(customerRecord?.name) || asString(customerRecord?.fullName);

  return {
    id,
    orderNumber: asString(record.orderNumber) || asString(record.displayId),
    status: asString(record.status) || "PLACED",
    tableId,
    tableName,
    sourceLabel: tableName ? `${tableName} - Dine-in` : customerName ? `${customerName} - Takeaway` : "Order",
    itemsSummary: parseOrderItemsSummary(record),
    items: [],
    subTotal: asNumber(record.subTotal),
    taxTotal: asNumber(record.taxTotal),
    grandTotal: asNumber(record.grandTotal),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
    raw: record,
  };
}

function parseOrdersList(data: unknown): OrdersListPayload {
  const root = asRecord(data);
  const items = asArray(root?.items).map(parseOrderRecord).filter((item): item is OrderRecord => Boolean(item));
  const pagination = asRecord(root?.pagination);

  return {
    items,
    pagination: {
      page: asNumber(pagination?.page) || 1,
      limit: asNumber(pagination?.limit) || 20,
      total: asNumber(pagination?.total) || items.length,
      totalPages: asNumber(pagination?.totalPages) || 1,
    },
  };
}

function parseNumberMap(value: unknown): Record<string, number> {
  const record = asRecord(value);
  if (!record) return {};

  const output: Record<string, number> = {};
  Object.entries(record).forEach(([key, entry]) => {
    const parsed = asNumber(entry);
    if (parsed !== undefined) output[key] = parsed;
  });
  return output;
}

function parseReportsSummary(data: unknown): ReportsSummaryPayload {
  const root = asRecord(data);
  const range = asRecord(root?.range);
  const sales = asRecord(root?.sales);
  const orders = asRecord(root?.orders);
  const invoices = asRecord(root?.invoices);
  const expenses = asRecord(root?.expenses);
  const profitLoss = asRecord(root?.profitLoss);

  return {
    range: {
      period: asString(range?.period),
      from: asString(range?.from),
      to: asString(range?.to),
      tzOffsetMinutes: asNumber(range?.tzOffsetMinutes),
      weekStartsOn: asNumber(range?.weekStartsOn),
    },
    sales: {
      paidInvoices: asNumber(sales?.paidInvoices) ?? 0,
      grossSales: asNumber(sales?.grossSales) ?? 0,
      discountTotal: asNumber(sales?.discountTotal) ?? 0,
      taxTotal: asNumber(sales?.taxTotal) ?? 0,
      netSales: asNumber(sales?.netSales) ?? 0,
      paidTotal: asNumber(sales?.paidTotal) ?? 0,
      avgTicket: asNumber(sales?.avgTicket) ?? 0,
    },
    orders: {
      total: asNumber(orders?.total) ?? 0,
      byStatus: parseNumberMap(orders?.byStatus),
    },
    invoices: {
      total: asNumber(invoices?.total) ?? 0,
      byStatus: parseNumberMap(invoices?.byStatus),
    },
    expenses: {
      total: asNumber(expenses?.total) ?? 0,
      count: asNumber(expenses?.count) ?? 0,
    },
    profitLoss: {
      netResult: asNumber(profitLoss?.netResult) ?? 0,
      profit: asNumber(profitLoss?.profit) ?? 0,
      loss: asNumber(profitLoss?.loss) ?? 0,
      note: asString(profitLoss?.note),
    },
  };
}

function isNotFound(error: FetchBaseQueryError | undefined): boolean {
  if (!error) return false;
  return error.status === 404;
}

async function postWithFallback(
  fetchWithBQ: (arg: string | FetchArgs) => QueryResult | PromiseLike<QueryResult>,
  endpoints: string[],
  body?: unknown,
): Promise<QueryResult> {
  let lastError: FetchBaseQueryError | undefined;

  for (const endpoint of endpoints) {
    const result = (await fetchWithBQ({
      url: endpoint,
      method: "POST",
      body,
      credentials: "include",
    })) as QueryResult;

    if (!result.error) {
      return result;
    }

    lastError = result.error;

    if (!isNotFound(result.error)) {
      return result;
    }
  }

  return { error: lastError };
}

async function requestWithFallback(
  fetchWithBQ: (arg: string | FetchArgs) => QueryResult | PromiseLike<QueryResult>,
  method: "PUT" | "PATCH" | "DELETE",
  endpoints: string[],
  body?: unknown,
): Promise<QueryResult> {
  let lastError: FetchBaseQueryError | undefined;

  for (const endpoint of endpoints) {
    const result = (await fetchWithBQ({
      url: endpoint,
      method,
      body,
      credentials: "include",
    })) as QueryResult;

    if (!result.error) {
      return result;
    }

    lastError = result.error;
    if (!isNotFound(result.error)) {
      return result;
    }
  }

  return { error: lastError };
}

export const authApi = createApi({
  reducerPath: "authApi",
  tagTypes: ["Orders", "TenantProfile", "TenantStaff"],
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    login: builder.mutation<SessionPayload, LoginPayload>({
      async queryFn(payload, _api, _extraOptions, fetchWithBQ) {
        const result = await fetchWithBQ({
          url: "/auth/login",
          method: "POST",
          body: payload,
          credentials: "include",
        });

        if (result.error) {
          return { error: result.error };
        }

        return { data: parseSession(result.data) };
      },
    }),

    register: builder.mutation<SessionPayload, RegisterPayload>({
      async queryFn(payload, _api, _extraOptions, fetchWithBQ) {
        const registerBody = {
          name: payload.name,
          email: payload.email,
          password: payload.password,
          restaurantName: payload.restaurantName,
          restaurantSlug: slugify(payload.restaurantName),
          contactNumber: "9999999999",
        };

        const result = await postWithFallback(fetchWithBQ, ["/auth/register", "/auth/register-owner"], registerBody);

        if (result.error) {
          return { error: result.error };
        }

        return { data: parseSession(result.data) };
      },
    }),

    me: builder.query<SessionPayload, void>({
      async queryFn(_arg, _api, _extraOptions, fetchWithBQ) {
        const result = await fetchWithBQ({
          url: "/auth/me",
          method: "GET",
          credentials: "include",
        });

        if (result.error) {
          return { error: result.error };
        }

        return { data: parseSession(result.data) };
      },
      
    }),
    tentantProfile: builder.query<TenantProfilePayload, void>({
      async queryFn(_arg, _api, _extraOptions, fetchWithBQ) {
        const result = await fetchWithBQ({
          url: "/tenant/profile",
          method: "GET",
          credentials: "include",
        });

        if (result.error) {
          return { error: result.error };
        }

        return { data: parseTenantProfile(result.data) };
      },
      providesTags: [{ type: "TenantProfile", id: "CURRENT" }],
    }),

    updateTenantProfile: builder.mutation<TenantProfilePayload, UpdateTenantProfilePayload>({
      async queryFn(payload, _api, _extraOptions, fetchWithBQ) {
        const body = {
          name: payload.name?.trim() || undefined,
          contactNumber: payload.contactNumber?.trim() || undefined,
          gstNumber: payload.gstNumber?.trim() || undefined,
          address: payload.address
            ? {
                line1: payload.address.line1?.trim() || undefined,
                line2: payload.address.line2?.trim() || undefined,
                city: payload.address.city?.trim() || undefined,
                state: payload.address.state?.trim() || undefined,
                country: payload.address.country?.trim() || undefined,
                postalCode: payload.address.postalCode?.trim() || undefined,
              }
            : undefined,
        };

        let result = await requestWithFallback(fetchWithBQ, "PUT", ["/tenant/profile", "/tenant/profile/update"], body);
        if (result.error && isNotFound(result.error)) {
          result = await requestWithFallback(fetchWithBQ, "PATCH", ["/tenant/profile", "/tenant/profile/update"], body);
        }

        if (result.error) {
          return { error: result.error };
        }

        return { data: parseTenantProfile(result.data) };
      },
      invalidatesTags: [{ type: "TenantProfile", id: "CURRENT" }],
    }),

    staffRoles: builder.query<StaffRolesPayload, void>({
      async queryFn(_arg, _api, _extraOptions, fetchWithBQ) {
        const result = await fetchWithBQ({
          url: "/auth/staff-roles",
          method: "GET",
          credentials: "include",
        });

        if (result.error) {
          return { error: result.error };
        }

        return { data: parseStaffRoles(result.data) };
      },
    }),

    tenantStaff: builder.query<TenantStaffListPayload, void>({
      async queryFn(_arg, _api, _extraOptions, fetchWithBQ) {
        const result = await fetchWithBQ({
          url: "/tenant/staff",
          method: "GET",
          credentials: "include",
        });

        if (result.error) {
          return { error: result.error };
        }

        return { data: parseStaffList(result.data) };
      },
      providesTags: (result) => [
        { type: "TenantStaff", id: "LIST" },
        ...(result?.items.map((staff) => ({ type: "TenantStaff" as const, id: staff.membershipId })) ?? []),
      ],
    }),

    createTenantStaff: builder.mutation<TenantStaffMutationPayload, CreateTenantStaffPayload>({
      async queryFn(payload, _api, _extraOptions, fetchWithBQ) {
        const createBody = {
          name: payload.name.trim(),
          email: payload.email.trim(),
          password: payload.password,
          role: payload.role.trim().toUpperCase(),
        };

        const result = await postWithFallback(fetchWithBQ, ["/tenant/staff", "/tenant/staff/register"], createBody);
        if (result.error) {
          return { error: result.error };
        }

        return { data: parseStaffMutation(result.data, "staff created") };
      },
      invalidatesTags: [{ type: "TenantStaff", id: "LIST" }],
    }),

    updateTenantStaff: builder.mutation<TenantStaffMutationPayload, UpdateTenantStaffArgs>({
      async queryFn({ membershipId, userId, payload }, _api, _extraOptions, fetchWithBQ) {
        const body = {
          role: payload.role?.trim().toUpperCase(),
          isActive: typeof payload.isActive === "boolean" ? payload.isActive : undefined,
          name: payload.name?.trim() || undefined,
          email: payload.email?.trim() || undefined,
        };

        const endpointCandidates = [
          `/tenant/staff/${membershipId}`,
          `/tenant/staff/membership/${membershipId}`,
          ...(userId ? [`/tenant/staff/user/${userId}`] : []),
        ];

        let result = await requestWithFallback(fetchWithBQ, "PUT", endpointCandidates, body);
        if (result.error && isNotFound(result.error)) {
          result = await requestWithFallback(fetchWithBQ, "PATCH", endpointCandidates, body);
        }

        if (result.error) {
          return { error: result.error };
        }

        return { data: parseStaffMutation(result.data, "staff updated") };
      },
      invalidatesTags: (_result, _error, { membershipId }) => [
        { type: "TenantStaff", id: "LIST" },
        { type: "TenantStaff", id: membershipId },
      ],
    }),

    deleteTenantStaff: builder.mutation<{ message: string }, DeleteTenantStaffArgs>({
      async queryFn({ membershipId, userId }, _api, _extraOptions, fetchWithBQ) {
        const endpointCandidates = [
          `/tenant/staff/${membershipId}`,
          `/tenant/staff/membership/${membershipId}`,
          ...(userId ? [`/tenant/staff/user/${userId}`] : []),
        ];

        const result = await requestWithFallback(fetchWithBQ, "DELETE", endpointCandidates);
        if (result.error) {
          return { error: result.error };
        }

        const root = asRecord(result.data);
        return { data: { message: asString(root?.message) || "staff deleted" } };
      },
      invalidatesTags: (_result, _error, { membershipId }) => [
        { type: "TenantStaff", id: "LIST" },
        { type: "TenantStaff", id: membershipId },
      ],
    }),

    orders: builder.query<OrdersListPayload, OrdersQueryParams | void>({
      query: (params) => {
        const statusParam = params?.status;
        const status = Array.isArray(statusParam)
          ? statusParam.join(",")
          : statusParam || "PLACED,IN_PROGRESS";

        return {
          url: "/orders",
          method: "GET",
          credentials: "include",
          params: {
            tableId: params?.tableId,
            status,
            page: params?.page ?? 1,
          },
        };
      },
      transformResponse: (response: unknown) => parseOrdersList(response),
      providesTags: (result) => [
        { type: "Orders", id: "LIST" },
        ...(result?.items.map((order) => ({ type: "Orders" as const, id: order.id })) ?? []),
      ],
      async onCacheEntryAdded(_arg, { cacheDataLoaded, cacheEntryRemoved, dispatch, getState }) {
        if (typeof window === "undefined") return;

        await cacheDataLoaded;

        const state = getState() as RootState;
        const token = state.auth.token;
        const tenantSlug = state.auth.tenant?.slug;
        const socketBaseUrl = RAW_API_BASE_URL.replace(/\/+$/, "").replace(/\/api$/, "");

        const socket = io(socketBaseUrl, {
          withCredentials: true,
          transports: ["websocket", "polling"],
          auth: {
            token: token ? `Bearer ${token}` : undefined,
            tenantSlug,
          },
          query: tenantSlug ? { tenantSlug } : undefined,
        });

        const refreshOrders = () => {
          dispatch(authApi.util.invalidateTags([{ type: "Orders", id: "LIST" }]));
        };

        const events = [
          "order:created",
          "order:updated",
          "order:deleted",
          "orders:updated",
          "order.created",
          "order.updated",
          "order.deleted",
        ] as const;

        events.forEach((eventName) => {
          socket.on(eventName, refreshOrders);
        });

        socket.on("connect", () => {
          if (tenantSlug) {
            socket.emit("tenant:join", { tenantSlug });
          }
        });

        await cacheEntryRemoved;
        events.forEach((eventName) => {
          socket.off(eventName, refreshOrders);
        });
        socket.disconnect();
      },
    }),

    reportsSummary: builder.query<
      ReportsSummaryPayload,
      ReportsSummaryQueryParams | void
    >({
      query: (params) => ({
        url: "/reports/summary",
        method: "GET",
        credentials: "include",
        params: {
          period: params?.period || "today",
          from: params?.from || undefined,
          to: params?.to || undefined,
          tzOffsetMinutes: params?.tzOffsetMinutes,
          weekStartsOn: params?.weekStartsOn,
        },
      }),
      transformResponse: (response: unknown) => parseReportsSummary(response),
    }),

    refreshSession: builder.mutation<SessionPayload, void>({
      async queryFn(_arg, _api, _extraOptions, fetchWithBQ) {
        const result = await postWithFallback(fetchWithBQ, ["/auth/refresh", "/auth/refresh-token"]);

        if (result.error) {
          return { error: result.error };
        }

        return { data: parseSession(result.data) };
      },
    }),

    logout: builder.mutation<{ ok: true }, void>({
      async queryFn(_arg, _api, _extraOptions, fetchWithBQ) {
        const result = await fetchWithBQ({
          url: "/auth/logout",
          method: "POST",
          credentials: "include",
        });

        if (result.error) {
          return { error: result.error };
        }

        return { data: { ok: true } };
      },
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useMeQuery,
  useLazyMeQuery,
  useTentantProfileQuery,
  useLazyTentantProfileQuery,
  useUpdateTenantProfileMutation,
  useStaffRolesQuery,
  useLazyStaffRolesQuery,
  useTenantStaffQuery,
  useLazyTenantStaffQuery,
  useCreateTenantStaffMutation,
  useUpdateTenantStaffMutation,
  useDeleteTenantStaffMutation,
  useOrdersQuery,
  useLazyOrdersQuery,
  useReportsSummaryQuery,
  useLazyReportsSummaryQuery,
  useRefreshSessionMutation,
  useLogoutMutation,
} = authApi;

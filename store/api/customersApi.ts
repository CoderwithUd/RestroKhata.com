import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "@/store/api/baseQuery";
import type {
  CustomerRecord,
  CustomerResponse,
  CustomersListResponse,
  CustomersQueryParams,
} from "@/store/types/customers";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseCustomer(value: unknown): CustomerRecord | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(record.id) || asString(record._id) || asString(record.customerId);
  if (!id) return null;

  return {
    id,
    tenantId: asString(record.tenantId),
    name:
      asString(record.name) ||
      asString(record.fullName) ||
      asString(record.customerName),
    phone:
      asString(record.phone) ||
      asString(record.phoneRaw) ||
      asString(record.mobile) ||
      asString(record.customerPhone),
    phoneRaw: asString(record.phoneRaw) || asString(record.phone),
    phoneNormalized:
      asString(record.phoneNormalized) ||
      asString(record.phone_normalized) ||
      asString(record.normalizedPhone),
    email: asString(record.email),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
    raw: record,
  };
}

function parseCustomersList(data: unknown): CustomersListResponse {
  const root = asRecord(data);
  const nestedData = asRecord(root?.data);

  const rawItems = asArray(root?.items).length
    ? root?.items
    : asArray(root?.customers).length
      ? root?.customers
      : asArray(nestedData?.items).length
        ? nestedData?.items
        : asArray(nestedData?.customers);

  const items = asArray(rawItems)
    .map(parseCustomer)
    .filter((customer): customer is CustomerRecord => Boolean(customer));

  const pagination = asRecord(root?.pagination) || asRecord(nestedData?.pagination);

  return {
    items,
    pagination: {
      page: asNumber(pagination?.page) ?? 1,
      limit: asNumber(pagination?.limit) ?? items.length ?? 0,
      total: asNumber(pagination?.total) ?? items.length,
      totalPages: asNumber(pagination?.totalPages) ?? 1,
    },
  };
}

function parseCustomerResponse(data: unknown): CustomerResponse {
  const root = asRecord(data);
  const nestedData = asRecord(root?.data);
  const customer =
    parseCustomer(asRecord(root?.customer) ?? asRecord(nestedData?.customer) ?? nestedData ?? root) ??
    {
      id: "",
      raw: root,
    };

  return { customer };
}

export const customersApi = createApi({
  reducerPath: "customersApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Customers"],
  endpoints: (builder) => ({
    getCustomers: builder.query<CustomersListResponse, CustomersQueryParams | void>({
      query: (params) => ({
        url: "/customers",
        method: "GET",
        credentials: "include",
        params: {
          q: params?.q?.trim() || undefined,
          page: params?.page,
          limit: params?.limit,
        },
      }),
      transformResponse: (response: unknown) => parseCustomersList(response),
      providesTags: (result) => [
        { type: "Customers", id: "LIST" },
        ...(result?.items.map((customer) => ({ type: "Customers" as const, id: customer.id })) ?? []),
      ],
    }),

    getCustomerById: builder.query<CustomerResponse, string>({
      query: (customerId) => ({
        url: `/customers/${customerId}`,
        method: "GET",
        credentials: "include",
      }),
      transformResponse: (response: unknown) => parseCustomerResponse(response),
      providesTags: (_result, _error, customerId) => [{ type: "Customers", id: customerId }],
    }),
  }),
});

export const {
  useGetCustomersQuery,
  useLazyGetCustomersQuery,
  useGetCustomerByIdQuery,
  useLazyGetCustomerByIdQuery,
} = customersApi;

import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "@/store/api/baseQuery";
import type {
  CreateOrderPayload,
  DeleteOrderResponse,
  OrderItem,
  OrderRecord,
  OrderResponse,
  OrdersListResponse,
  OrdersQueryParams,
  UpdateOrderArgs,
} from "@/store/types/orders";

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
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function parseOrderItem(value: unknown): OrderItem | null {
  const r = asRecord(value);
  if (!r) return null;
  const itemId = asString(r.itemId) || asString(r.id);
  if (!itemId) return null;
  return {
    itemId,
    variantId: asString(r.variantId),
    name: asString(r.name) || "Item",
    variantName: asString(r.variantName),
    quantity: asNumber(r.quantity) ?? 1,
    unitPrice: asNumber(r.unitPrice) ?? 0,
    taxPercentage: asNumber(r.taxPercentage),
    options: asArray(r.options)
      .map((opt) => {
        const o = asRecord(opt);
        if (!o) return null;
        return {
          optionId: asString(o.optionId) || asString(o.id) || "",
          name: asString(o.name) || "",
          price: asNumber(o.price) ?? 0,
        };
      })
      .filter((o): o is NonNullable<typeof o> => Boolean(o)),
    note: asString(r.note),
    lineSubTotal: asNumber(r.lineSubTotal),
    lineTax: asNumber(r.lineTax),
    lineTotal: asNumber(r.lineTotal),
  };
}

function parseUserRef(value: unknown) {
  const r = asRecord(value);
  if (!r) return undefined;
  const userId = asString(r.userId) || asString(r.id);
  if (!userId) return undefined;
  return {
    userId,
    role: asString(r.role) || "",
    name: asString(r.name),
  };
}

function parseTableRef(value: unknown) {
  const r = asRecord(value);
  if (!r) return undefined;
  const id = asString(r.id) || asString(r._id);
  if (!id) return undefined;
  return {
    id,
    number: asNumber(r.number) ?? 0,
    name: asString(r.name) || `Table ${asNumber(r.number) ?? ""}`,
  };
}

function parseOrder(value: unknown): OrderRecord | null {
  const r = asRecord(value);
  if (!r) return null;
  const id = asString(r.id) || asString(r._id);
  if (!id) return null;
  return {
    id,
    tenantId: asString(r.tenantId),
    table: parseTableRef(r.table),
    tableId: asString(r.tableId) || parseTableRef(r.table)?.id,
    status: (asString(r.status) as OrderRecord["status"]) || "PLACED",
    note: asString(r.note),
    items: asArray(r.items)
      .map(parseOrderItem)
      .filter((i): i is NonNullable<typeof i> => Boolean(i)),
    subTotal: asNumber(r.subTotal) ?? asNumber(r.subtotal) ?? asNumber(r.sub_total),
    taxTotal: asNumber(r.taxTotal) ?? asNumber(r.tax) ?? asNumber(r.taxAmount),
    grandTotal: asNumber(r.grandTotal) ?? asNumber(r.total) ?? asNumber(r.totalAmount) ?? asNumber(r.amount),
    createdBy: parseUserRef(r.createdBy),
    updatedBy: parseUserRef(r.updatedBy),
    createdAt: asString(r.createdAt),
    updatedAt: asString(r.updatedAt),
    raw: r,
  };
}

function parseOrdersList(data: unknown): OrdersListResponse {
  const root = asRecord(data);
  if (!root) return { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };

  const raw = asArray(root.items).length ? root.items : asArray(root.orders);
  const items = asArray(raw)
    .map(parseOrder)
    .filter((o): o is OrderRecord => Boolean(o));

  const pg = asRecord(root.pagination);
  return {
    items,
    pagination: {
      page: asNumber(pg?.page) ?? 1,
      limit: asNumber(pg?.limit) ?? 20,
      total: asNumber(pg?.total) ?? items.length,
      totalPages: asNumber(pg?.totalPages) ?? 1,
    },
  };
}

function parseOrderResponse(data: unknown, fallback: string): OrderResponse {
  const root = asRecord(data);
  const order =
    parseOrder(asRecord(root?.order) ?? root) ??
    ({ id: "", status: "PLACED", items: [] } as OrderRecord);
  return {
    message: asString(root?.message) || fallback,
    order,
  };
}

export const ordersApi = createApi({
  reducerPath: "ordersApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Orders"],
  endpoints: (builder) => ({
    getOrders: builder.query<OrdersListResponse, OrdersQueryParams | void>({
      query: (params) => ({
        url: "/orders",
        method: "GET",
        credentials: "include",
        params: {
          tableId: params?.tableId || undefined,
          status: Array.isArray(params?.status)
            ? params.status.join(",")
            : (params?.status ?? undefined),
          page: params?.page ?? 1,
        },
      }),
      transformResponse: (response: unknown) => parseOrdersList(response),
      providesTags: (result) => [
        { type: "Orders", id: "LIST" },
        ...(result?.items.map((o) => ({ type: "Orders" as const, id: o.id })) ?? []),
      ],
    }),

    getOrderById: builder.query<OrderRecord | null, string>({
      query: (orderId) => ({
        url: `/orders/${orderId}`,
        method: "GET",
        credentials: "include",
      }),
      transformResponse: (response: unknown) => {
        const root = asRecord(response);
        return parseOrder(asRecord(root?.order) ?? root);
      },
      providesTags: (_result, _error, orderId) => [{ type: "Orders", id: orderId }],
    }),

    createOrder: builder.mutation<OrderResponse, CreateOrderPayload>({
      query: (payload) => ({
        url: "/orders",
        method: "POST",
        credentials: "include",
        body: payload,
      }),
      transformResponse: (response: unknown) => parseOrderResponse(response, "Order created"),
      invalidatesTags: [{ type: "Orders", id: "LIST" }],
    }),

    updateOrder: builder.mutation<OrderResponse, UpdateOrderArgs>({
      query: ({ orderId, payload }) => ({
        url: `/orders/${orderId}`,
        method: "PUT",
        credentials: "include",
        body: payload,
      }),
      transformResponse: (response: unknown) => parseOrderResponse(response, "Order updated"),
      invalidatesTags: (_result, _error, { orderId }) => [
        { type: "Orders", id: "LIST" },
        { type: "Orders", id: orderId },
      ],
    }),

    deleteOrder: builder.mutation<DeleteOrderResponse, string>({
      query: (orderId) => ({
        url: `/orders/${orderId}`,
        method: "DELETE",
        credentials: "include",
      }),
      transformResponse: (response: unknown) => {
        const root = asRecord(response);
        return { message: asString(root?.message) || "Order deleted" };
      },
      invalidatesTags: (_result, _error, orderId) => [
        { type: "Orders", id: "LIST" },
        { type: "Orders", id: orderId },
      ],
    }),
  }),
});

export const {
  useGetOrdersQuery,
  useGetOrderByIdQuery,
  useCreateOrderMutation,
  useUpdateOrderMutation,
  useDeleteOrderMutation,
} = ordersApi;

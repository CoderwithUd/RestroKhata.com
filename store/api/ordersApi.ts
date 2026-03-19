import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "@/store/api/baseQuery";
import type {
  CreateOrderPayload,
  DeleteOrderResponse,
  KitchenItemsQueryParams,
  KitchenItemsResponse,
  KitchenQueueItem,
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
  const lineId = asString(r.lineId) || asString(r.lineItemId) || asString(r.itemLineId);
  const itemId =
    asString(r.itemId) ||
    asString(r.menuItemId) ||
    asString(asRecord(r.item)?.id) ||
    asString(r.id);
  if (!itemId) return null;
  const rawStatus = asString(r.status) || asString(r.itemStatus) || asString(r.kitchenStatus);
  return {
    lineId,
    itemId,
    variantId: asString(r.variantId),
    name: asString(r.name) || asString(r.itemName) || asString(asRecord(r.item)?.name) || "Item",
    variantName: asString(r.variantName),
    quantity: asNumber(r.quantity) ?? 1,
    unitPrice: asNumber(r.unitPrice) ?? asNumber(r.price) ?? 0,
    status: (rawStatus as OrderItem["status"]) || undefined,
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
    createdAt: asString(r.createdAt) || asString(r.addedAt),
    updatedAt: asString(r.updatedAt),
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

function parseOrderItemsSummary(record: Record<string, unknown>, parsedItems: OrderItem[]): string | undefined {
  if (parsedItems.length) {
    return parsedItems
      .map((item) => (item.quantity > 1 ? `${item.name} x ${item.quantity}` : item.name))
      .join(", ");
  }
  return asString(record.itemsSummary) || asString(record.itemsText) || undefined;
}

function parseOrder(value: unknown): OrderRecord | null {
  const r = asRecord(value);
  if (!r) return null;
  const id = asString(r.id) || asString(r._id);
  if (!id) return null;
  const table = parseTableRef(r.table);
  const tableId = asString(r.tableId) || table?.id;
  const tableName =
    asString(r.tableName) ||
    table?.name ||
    (table?.number ? `Table ${table.number}` : undefined);
  const items = asArray(r.items)
    .map(parseOrderItem)
    .filter((i): i is NonNullable<typeof i> => Boolean(i));
  const status = asString(r.status) || "PLACED";

  return {
    id,
    tenantId: asString(r.tenantId),
    orderNumber: asString(r.orderNumber) || asString(r.displayId),
    table,
    tableId,
    tableName,
    sourceLabel: tableName ? `${tableName} - Dine-in` : "Order",
    itemsSummary: parseOrderItemsSummary(r, items),
    status: status as OrderRecord["status"],
    note: asString(r.note),
    items,
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
  const nestedData = asRecord(root.data);

  const raw =
    asArray(root.items).length
      ? root.items
      : asArray(root.orders).length
        ? root.orders
        : asArray(nestedData?.items).length
          ? nestedData?.items
          : asArray(nestedData?.orders);
  const items = asArray(raw)
    .map(parseOrder)
    .filter((o): o is OrderRecord => Boolean(o));

  const pg = asRecord(root.pagination) || asRecord(nestedData?.pagination);
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
  const nestedData = asRecord(root?.data);
  const nestedOrder = asRecord(nestedData?.order);
  const order =
    parseOrder(asRecord(root?.order) ?? nestedOrder ?? nestedData ?? root) ??
    ({ id: "", status: "PLACED", items: [] } as OrderRecord);
  return {
    message: asString(root?.message) || asString(nestedData?.message) || fallback,
    order,
  };
}

function parseKitchenQueueItem(value: unknown): KitchenQueueItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const nestedOrder = asRecord(record.order);
  const nestedTable = asRecord(record.table) || asRecord(nestedOrder?.table);
  const nestedItem =
    asRecord(record.item) ||
    asRecord(record.menuItem) ||
    asRecord(record.product) ||
    asRecord(record.menu);

  const lineId =
    asString(record.lineId) ||
    asString(record.lineItemId) ||
    asString(record.itemLineId) ||
    asString(record.id) ||
    asString(record._id);
  const orderId =
    asString(record.orderId) ||
    asString(nestedOrder?.id) ||
    asString(nestedOrder?._id);
  const itemIdCandidate =
    asString(record.itemId) ||
    asString(record.menuItemId) ||
    asString(record.productId) ||
    asString(record.menuId) ||
    asString(nestedItem?.id) ||
    asString(nestedItem?._id) ||
    asString(nestedItem?.itemId) ||
    asString(nestedItem?.menuItemId) ||
    asString(nestedItem?.productId) ||
    lineId;

  // Kitchen queue actions need orderId + lineId. itemId can be derived/fallback.
  if (!lineId || !orderId) return null;
  const itemId = itemIdCandidate || lineId;

  const table = parseTableRef(nestedTable);
  const addedAt =
    asString(record.addedAt) ||
    asString(record.createdAt) ||
    asString(record.itemAddedAt) ||
    asString(nestedItem?.addedAt) ||
    asString(nestedItem?.createdAt);
  const parsedAge = asNumber(record.ageMinutes);
  const ageMinutes =
    parsedAge ??
    (() => {
      if (!addedAt) return undefined;
      const ts = new Date(addedAt).getTime();
      if (!Number.isFinite(ts)) return undefined;
      return Math.max(0, Math.floor((Date.now() - ts) / 60000));
    })();

  return {
    lineId,
    orderId,
    orderNumber:
      asString(record.orderNumber) ||
      asString(nestedOrder?.orderNumber) ||
      asString(nestedOrder?.displayId),
    table,
    tableId:
      asString(record.tableId) ||
      table?.id,
    tableName:
      asString(record.tableName) ||
      table?.name ||
      (table?.number ? `Table ${table.number}` : undefined),
    itemId,
    variantId: asString(record.variantId),
    name:
      asString(record.name) ||
      asString(record.itemName) ||
      asString(record.menuItemName) ||
      asString(record.productName) ||
      asString(nestedItem?.name) ||
      asString(nestedItem?.title) ||
      "Item",
    variantName: asString(record.variantName),
    quantity: asNumber(record.quantity) ?? asNumber(record.qty) ?? 1,
    note: asString(record.note),
    kitchenStatus:
      (asString(record.kitchenStatus) as KitchenQueueItem["kitchenStatus"]) ||
      (asString(record.itemStatus) as KitchenQueueItem["kitchenStatus"]) ||
      (asString(record.lineStatus) as KitchenQueueItem["kitchenStatus"]) ||
      (asString(nestedItem?.kitchenStatus) as KitchenQueueItem["kitchenStatus"]) ||
      (asString(nestedItem?.itemStatus) as KitchenQueueItem["kitchenStatus"]) ||
      (asString(record.status) as KitchenQueueItem["kitchenStatus"]) ||
      "PLACED",
    addedAt,
    ageMinutes,
    priorityLabel: asString(record.priorityLabel),
    priorityScore: asNumber(record.priorityScore),
    raw: record,
  };
}

function parseKitchenItemsList(data: unknown): KitchenItemsResponse {
  const root = asRecord(data);
  if (!root) return { items: [], pagination: { page: 1, limit: 200, total: 0, totalPages: 1 } };
  const nestedData = asRecord(root.data);

  const rawItems =
    asArray(root.items).length
      ? root.items
      : asArray(root.lines).length
        ? root.lines
        : asArray(root.queue).length
          ? root.queue
          : asArray(nestedData?.items).length
            ? nestedData?.items
            : asArray(nestedData?.lines).length
              ? nestedData?.lines
              : asArray(nestedData?.queue).length
                ? nestedData?.queue
                : asArray(nestedData?.results).length
                  ? nestedData?.results
                  : asArray(root.results);

  const rawList = asArray(rawItems);
  const items = rawList
    .map(parseKitchenQueueItem)
    .filter((item): item is KitchenQueueItem => Boolean(item));

  const pg = asRecord(root.pagination) || asRecord(nestedData?.pagination);
  return {
    items,
    pagination: {
      page: asNumber(pg?.page) ?? 1,
      limit: asNumber(pg?.limit) ?? 200,
      total: asNumber(pg?.total) ?? asNumber(root.total) ?? asNumber(nestedData?.total) ?? items.length,
      totalPages: asNumber(pg?.totalPages) ?? asNumber(root.totalPages) ?? asNumber(nestedData?.totalPages) ?? 1,
    },
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
          limit: params?.limit ?? 20,
        },
      }),
      transformResponse: (response: unknown) => parseOrdersList(response),
      providesTags: (result) => [
        { type: "Orders", id: "LIST" },
        ...(result?.items.map((o) => ({ type: "Orders" as const, id: o.id })) ?? []),
      ],
    }),

    getKitchenOrderItems: builder.query<KitchenItemsResponse, KitchenItemsQueryParams | void>({
      query: (params) => ({
        url: "/orders/kitchen/items",
        method: "GET",
        credentials: "include",
        params: {
          status: Array.isArray(params?.status)
            ? params.status.join(",")
            : (params?.status ?? undefined),
          includeDone: params?.includeDone ?? false,
          tableId: params?.tableId || undefined,
          page: params?.page ?? 1,
          limit: params?.limit ?? 200,
        },
      }),
      transformResponse: (response: unknown) => parseKitchenItemsList(response),
      providesTags: (result) => [
        { type: "Orders", id: "KITCHEN_ITEMS" },
        ...(result?.items.map((item) => ({ type: "Orders" as const, id: item.orderId })) ?? []),
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
  useGetKitchenOrderItemsQuery,
  useGetOrderByIdQuery,
  useCreateOrderMutation,
  useUpdateOrderMutation,
  useDeleteOrderMutation,
} = ordersApi;

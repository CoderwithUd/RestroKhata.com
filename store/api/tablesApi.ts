import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "@/store/api/baseQuery";
import type {
  CreateTablePayload,
  CreateTableQrTokenArgs,
  CreateTableQrTokenResponse,
  CreateTableResponse,
  DeleteTableArgs,
  DeleteTableResponse,
  GetTableQrArgs,
  TableRecord,
  TablesListResponse,
  TableQrResponse,
  TablesQueryParams,
  UpdateTableArgs,
  UpdateTableResponse,
} from "@/store/types/tables";

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

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseTable(value: unknown): TableRecord | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id) || asString(record._id);
  if (!id) return null;

  const reservationRecord = asRecord(record.reservation);
  const advancePaymentRecord = asRecord(reservationRecord?.advancePayment);

  return {
    id,
    tenantId: asString(record.tenantId),
    number: asNumber(record.number) ?? 0,
    name: asString(record.name) || `Table ${asNumber(record.number) ?? ""}`,
    capacity: asNumber(record.capacity) ?? 0,
    isActive: asBoolean(record.isActive) ?? true,
    status: asString(record.status),
    customerId: asString(record.customerId),
    reservation: reservationRecord
      ? {
          customerName: asString(reservationRecord.customerName),
          customerPhone: asString(reservationRecord.customerPhone),
          partySize: asNumber(reservationRecord.partySize),
          reservedFor: asString(reservationRecord.reservedFor),
          note: asString(reservationRecord.note),
          advancePayment: advancePaymentRecord
            ? {
                required: asBoolean(advancePaymentRecord.required),
                amount: asNumber(advancePaymentRecord.amount),
                paidAmount: asNumber(advancePaymentRecord.paidAmount),
                method: asString(advancePaymentRecord.method),
                reference: asString(advancePaymentRecord.reference),
              }
            : undefined,
        }
      : undefined,
    qrPayload: asString(record.qrPayload),
    qrFormat: asString(record.qrFormat) as TableRecord["qrFormat"],
    qrCode: asString(record.qrCode),
    qrUpdatedAt: asString(record.qrUpdatedAt),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
  };
}

function parseTablesList(data: unknown): TablesListResponse {
  const root = asRecord(data);
  if (!root) return { items: [] };
  const nestedData = asRecord(root.data);
  const rawItems = asArray(root.items).length
    ? root.items
    : asArray(root.tables).length
      ? root.tables
      : asArray(nestedData?.items).length
        ? nestedData?.items
        : asArray(nestedData?.tables);

  return {
    items: asArray(rawItems)
      .map(parseTable)
      .filter((table): table is TableRecord => Boolean(table)),
  };
}

function parseTableResponse(data: unknown, fallback: string): CreateTableResponse {
  const root = asRecord(data);
  const nestedData = asRecord(root?.data);
  const table =
    parseTable(asRecord(root?.table) ?? asRecord(nestedData?.table) ?? nestedData ?? root) ||
    ({
      id: "",
      number: 0,
      name: fallback,
      capacity: 0,
      isActive: true,
    } as TableRecord);

  return {
    message: asString(root?.message) || asString(nestedData?.message) || fallback,
    table,
  };
}

export const tablesApi = createApi({
  reducerPath: "tablesApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Tables", "TableQr"],
  endpoints: (builder) => ({
    getTables: builder.query<TablesListResponse, TablesQueryParams | void>({
      query: (params) => ({
        url: "/tables",
        method: "GET",
        credentials: "include",
        params: {
          isActive: typeof params?.isActive === "boolean" ? params.isActive : undefined,
        },
      }),
      transformResponse: (response: unknown) => parseTablesList(response),
      providesTags: (result) => [
        { type: "Tables", id: "LIST" },
        ...(result?.items.map((table) => ({ type: "Tables" as const, id: table.id })) ?? []),
      ],
    }),

    createTable: builder.mutation<CreateTableResponse, CreateTablePayload>({
      query: (payload) => ({
        url: "/tables",
        method: "POST",
        credentials: "include",
        body: payload,
      }),
      transformResponse: (response: unknown) =>
        parseTableResponse(response, "Table created"),
      invalidatesTags: [{ type: "Tables", id: "LIST" }],
    }),

    getTableQr: builder.query<TableQrResponse, GetTableQrArgs>({
      query: ({ tableId, format, baseUrl }) => ({
        url: `/tables/${tableId}/qr`,
        method: "GET",
        credentials: "include",
        params: { format, baseUrl },
      }),
      providesTags: (_result, _error, { tableId }) => [{ type: "TableQr", id: tableId }],
    }),

    createTableQrToken: builder.mutation<CreateTableQrTokenResponse, CreateTableQrTokenArgs>({
      query: ({ tableId, ...payload }) => ({
        url: `/tables/${tableId}/qr-token`,
        method: "POST",
        credentials: "include",
        body: payload,
      }),
      invalidatesTags: (_result, _error, { tableId }) => [{ type: "TableQr", id: tableId }],
    }),

    updateTable: builder.mutation<UpdateTableResponse, UpdateTableArgs>({
      query: ({ tableId, ...payload }) => ({
        url: `/tables/${tableId}`,
        method: "PUT",
        credentials: "include",
        body: payload,
      }),
      transformResponse: (response: unknown) =>
        parseTableResponse(response, "Table updated") as UpdateTableResponse,
      invalidatesTags: (_result, _error, { tableId }) => [
        { type: "Tables", id: "LIST" },
        { type: "Tables", id: tableId },
        { type: "TableQr", id: tableId },
      ],
    }),

    deleteTable: builder.mutation<DeleteTableResponse, DeleteTableArgs>({
      query: ({ tableId }) => ({
        url: `/tables/${tableId}`,
        method: "DELETE",
        credentials: "include",
      }),
      invalidatesTags: (_result, _error, { tableId }) => [
        { type: "Tables", id: "LIST" },
        { type: "Tables", id: tableId },
        { type: "TableQr", id: tableId },
      ],
    }),
  }),
});

export const {
  useGetTablesQuery,
  useLazyGetTablesQuery,
  useCreateTableMutation,
  useGetTableQrQuery,
  useLazyGetTableQrQuery,
  useCreateTableQrTokenMutation,
  useUpdateTableMutation,
  useDeleteTableMutation,
} = tablesApi;

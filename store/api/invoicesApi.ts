import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "@/store/api/baseQuery";
import type {
  CreateInvoicePayload,
  DeleteInvoiceResponse,
  InvoiceRecord,
  InvoiceResponse,
  InvoicesListResponse,
  InvoicesQueryParams,
  PayInvoiceArgs,
  UpdateInvoiceArgs,
} from "@/store/types/invoices";
import type { OrderItem } from "@/store/types/orders";

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

function parseOrderItem(value: unknown): OrderItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const itemId = asString(record.itemId) || asString(record.id);
  if (!itemId) return null;

  return {
    itemId,
    variantId: asString(record.variantId),
    name: asString(record.name) || "Item",
    variantName: asString(record.variantName),
    quantity: asNumber(record.quantity) ?? 1,
    unitPrice: asNumber(record.unitPrice) ?? 0,
    taxPercentage: asNumber(record.taxPercentage),
    options: asArray(record.options)
      .map((entry) => {
        const opt = asRecord(entry);
        if (!opt) return null;
        return {
          optionId: asString(opt.optionId) || asString(opt.id) || "",
          name: asString(opt.name) || "",
          price: asNumber(opt.price) ?? 0,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    note: asString(record.note),
    lineSubTotal: asNumber(record.lineSubTotal),
    lineTax: asNumber(record.lineTax),
    lineTotal: asNumber(record.lineTotal),
  };
}

function parseInvoice(value: unknown): InvoiceRecord | null {
  const record = asRecord(value);
  if (!record) return null;

  const nestedOrder = asRecord(record.order);
  const nestedTable = asRecord(record.table) || asRecord(nestedOrder?.table);
  const id = asString(record.id) || asString(record._id) || asString(record.invoiceId);
  const orderId =
    asString(record.orderId) ||
    asString(nestedOrder?.id) ||
    asString(nestedOrder?._id);
  if (!id || !orderId) return null;

  const tableId =
    asString(nestedTable?.id) ||
    asString(nestedTable?._id) ||
    asString(record.tableId);
  const tableNumber = asNumber(nestedTable?.number) ?? asNumber(record.tableNumber) ?? 0;
  const tableName =
    asString(nestedTable?.name) ||
    asString(record.tableName) ||
    (tableNumber ? `Table ${tableNumber}` : undefined);

  const discountRecord = asRecord(record.discount);
  const paymentRecord = asRecord(record.payment);

  return {
    id,
    tenantId: asString(record.tenantId),
    orderId,
    table: tableId
      ? {
          id: tableId,
          number: tableNumber,
          name: tableName || `Table ${tableNumber || ""}`,
        }
      : undefined,
    status: asString(record.status) || "ISSUED",
    note: asString(record.note),
    items: asArray(record.items)
      .map(parseOrderItem)
      .filter((item): item is OrderItem => Boolean(item)),
    subTotal: asNumber(record.subTotal),
    taxTotal: asNumber(record.taxTotal),
    grandTotal: asNumber(record.grandTotal),
    discount: discountRecord
      ? {
          type: asString(discountRecord.type) || "FLAT",
          value: asNumber(discountRecord.value) ?? 0,
          amount: asNumber(discountRecord.amount) ?? 0,
        }
      : null,
    totalDue: asNumber(record.totalDue),
    balanceDue: asNumber(record.balanceDue),
    payment: paymentRecord
      ? {
          method: asString(paymentRecord.method) || "CASH",
          reference: asString(paymentRecord.reference),
          paidAmount: asNumber(paymentRecord.paidAmount) ?? 0,
          paidAt: asString(paymentRecord.paidAt),
        }
      : null,
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
  };
}

function parseInvoicesList(data: unknown): InvoicesListResponse {
  const root = asRecord(data);
  if (!root) {
    return { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
  }

  const raw = asArray(root.items).length ? root.items : asArray(root.invoices);
  const items = asArray(raw)
    .map(parseInvoice)
    .filter((invoice): invoice is InvoiceRecord => Boolean(invoice));
  const pagination = asRecord(root.pagination);

  return {
    items,
    pagination: {
      page: asNumber(pagination?.page) ?? 1,
      limit: asNumber(pagination?.limit) ?? 20,
      total: asNumber(pagination?.total) ?? items.length,
      totalPages: asNumber(pagination?.totalPages) ?? 1,
    },
  };
}

function parseInvoiceResponse(data: unknown, fallback: string): InvoiceResponse {
  const root = asRecord(data);
  const invoice = parseInvoice(asRecord(root?.invoice) ?? root) || {
    id: "",
    orderId: "",
    status: "ISSUED",
    items: [],
  };

  return {
    message: asString(root?.message) || fallback,
    invoice,
  };
}

export const invoicesApi = createApi({
  reducerPath: "invoicesApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Invoices"],
  endpoints: (builder) => ({
    getInvoices: builder.query<InvoicesListResponse, InvoicesQueryParams | void>({
      query: (params) => {
        const statusParam = params?.status;
        const normalizedStatus = Array.isArray(statusParam)
          ? statusParam
              .map((s) => asString(s))
              .filter((s): s is string => Boolean(s))
          : asString(statusParam)
            ? [asString(statusParam) as string]
            : [];

        // Some backend builds reject CSV status lists with 400.
        // For multi-status use-case, fetch all and filter client-side.
        const statusForApi =
          normalizedStatus.length === 1 ? normalizedStatus[0] : undefined;

        return {
          url: "/invoices",
          method: "GET",
          credentials: "include",
          params: {
            tableId: params?.tableId || undefined,
            orderId: params?.orderId || undefined,
            status: statusForApi,
            page: params?.page ?? 1,
          },
        };
      },
      transformResponse: (response: unknown) => parseInvoicesList(response),
      providesTags: (result) => [
        { type: "Invoices", id: "LIST" },
        ...(result?.items.map((invoice) => ({ type: "Invoices" as const, id: invoice.id })) ?? []),
      ],
    }),

    getInvoiceById: builder.query<InvoiceRecord | null, string>({
      query: (invoiceId) => ({
        url: `/invoices/${invoiceId}`,
        method: "GET",
        credentials: "include",
      }),
      transformResponse: (response: unknown) => {
        const root = asRecord(response);
        return parseInvoice(asRecord(root?.invoice) ?? root);
      },
      providesTags: (_result, _error, invoiceId) => [{ type: "Invoices", id: invoiceId }],
    }),

    createInvoice: builder.mutation<InvoiceResponse, CreateInvoicePayload>({
      query: (payload) => ({
        url: "/invoices",
        method: "POST",
        credentials: "include",
        body: payload,
      }),
      transformResponse: (response: unknown) => parseInvoiceResponse(response, "Invoice created"),
      invalidatesTags: [{ type: "Invoices", id: "LIST" }],
    }),

    updateInvoice: builder.mutation<InvoiceResponse, UpdateInvoiceArgs>({
      query: ({ invoiceId, payload }) => ({
        url: `/invoices/${invoiceId}`,
        method: "PUT",
        credentials: "include",
        body: payload,
      }),
      transformResponse: (response: unknown) => parseInvoiceResponse(response, "Invoice updated"),
      invalidatesTags: (_result, _error, { invoiceId }) => [
        { type: "Invoices", id: "LIST" },
        { type: "Invoices", id: invoiceId },
      ],
    }),

    payInvoice: builder.mutation<InvoiceResponse, PayInvoiceArgs>({
      query: ({ invoiceId, payload }) => ({
        url: `/invoices/${invoiceId}/pay`,
        method: "POST",
        credentials: "include",
        body: payload,
      }),
      transformResponse: (response: unknown) => parseInvoiceResponse(response, "Payment successful"),
      invalidatesTags: (_result, _error, { invoiceId }) => [
        { type: "Invoices", id: "LIST" },
        { type: "Invoices", id: invoiceId },
      ],
    }),

    deleteInvoice: builder.mutation<DeleteInvoiceResponse, string>({
      query: (invoiceId) => ({
        url: `/invoices/${invoiceId}`,
        method: "DELETE",
        credentials: "include",
      }),
      transformResponse: (response: unknown) => {
        const root = asRecord(response);
        return { message: asString(root?.message) || "Invoice deleted" };
      },
      invalidatesTags: (_result, _error, invoiceId) => [
        { type: "Invoices", id: "LIST" },
        { type: "Invoices", id: invoiceId },
      ],
    }),
  }),
});

export const {
  useGetInvoicesQuery,
  useGetInvoiceByIdQuery,
  useCreateInvoiceMutation,
  useUpdateInvoiceMutation,
  usePayInvoiceMutation,
  useDeleteInvoiceMutation,
} = invoicesApi;

import type { OrderItem } from "@/store/types/orders";

export type InvoiceStatus = "ISSUED" | "PAID" | "VOID" | "DRAFT" | string;
export type InvoiceDiscountType = "PERCENTAGE" | "FLAT" | string;

export type InvoiceTableRef = {
  id: string;
  number: number;
  name: string;
};

export type InvoiceDiscount = {
  type: InvoiceDiscountType;
  value: number;
  amount: number;
};

export type InvoicePayment = {
  method: string;
  reference?: string;
  paidAmount: number;
  paidAt?: string;
};

export type InvoiceRecord = {
  id: string;
  tenantId?: string;
  orderId: string;
  table?: InvoiceTableRef;
  status: InvoiceStatus;
  note?: string;
  items: OrderItem[];
  subTotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  discount?: InvoiceDiscount | null;
  totalDue?: number;
  balanceDue?: number;
  payment?: InvoicePayment | null;
  createdAt?: string;
  updatedAt?: string;
};

export type InvoicesPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type InvoicesListResponse = {
  items: InvoiceRecord[];
  pagination: InvoicesPagination;
};

export type InvoicesQueryParams = {
  status?: string | string[];
  tableId?: string;
  orderId?: string;
  page?: number;
  limit?: number;
};

export type CreateInvoicePayload = {
  orderId: string;
  note?: string;
  discountType?: InvoiceDiscountType;
  discountValue?: number;
};

export type UpdateInvoicePayload = {
  note?: string;
  discountType?: InvoiceDiscountType;
  discountValue?: number;
};

export type UpdateInvoiceArgs = {
  invoiceId: string;
  payload: UpdateInvoicePayload;
};

export type PayInvoicePayload = {
  method: string;
  reference?: string;
  paidAmount: number;
};

export type PayInvoiceArgs = {
  invoiceId: string;
  payload: PayInvoicePayload;
};

export type InvoiceResponse = {
  message: string;
  invoice: InvoiceRecord;
};

export type DeleteInvoiceResponse = {
  message: string;
};

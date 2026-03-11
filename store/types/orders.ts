// ─── Order Status ───────────────────────────────────────────────────────────
export type OrderStatus =
  | "PLACED"
  | "IN_PROGRESS"
  | "READY"
  | "SERVED"
  | "CANCELLED"
  | string;

// ─── Table ref (nested in order response) ───────────────────────────────────
export type OrderTableRef = {
  id: string;
  number: number;
  name: string;
};

// ─── Option nested in order item ─────────────────────────────────────────────
export type OrderItemOption = {
  optionId: string;
  name: string;
  price: number;
};

// ─── Full order item (response) ──────────────────────────────────────────────
export type OrderItem = {
  itemId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  taxPercentage?: number;
  options?: OrderItemOption[];
  note?: string;
  lineSubTotal?: number;
  lineTax?: number;
  lineTotal?: number;
};

// ─── Creator / updater ref ───────────────────────────────────────────────────
export type OrderUserRef = {
  userId: string;
  role: string;
  name?: string;
};

// ─── Full order record ───────────────────────────────────────────────────────
export type OrderRecord = {
  id: string;
  tenantId?: string;
  orderNumber?: string;
  table?: OrderTableRef;
  tableId?: string;
  tableName?: string;
  sourceLabel?: string;
  itemsSummary?: string;
  status: OrderStatus;
  note?: string;
  items: OrderItem[];
  subTotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  raw?: Record<string, unknown>;
  createdBy?: OrderUserRef;
  updatedBy?: OrderUserRef;
  createdAt?: string;
  updatedAt?: string;
};

// ─── Pagination ──────────────────────────────────────────────────────────────
export type OrdersPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

// ─── List response ───────────────────────────────────────────────────────────
export type OrdersListResponse = {
  items: OrderRecord[];
  pagination: OrdersPagination;
};

// Backward-compatible alias used by authApi.
export type OrdersListPayload = OrdersListResponse;

// ─── Single order response ───────────────────────────────────────────────────
export type OrderResponse = {
  message: string;
  order: OrderRecord;
};

// ─── Query params ─────────────────────────────────────────────────────────────
export type OrdersQueryParams = {
  tableId?: string;
  status?: string | string[];
  page?: number;
  limit?: number;
};

// ─── Create payload ──────────────────────────────────────────────────────────
export type OrderItemPayload = {
  itemId: string;
  variantId?: string;
  quantity: number;
  note?: string;
  optionIds?: string[];
};

export type CreateOrderPayload = {
  tableId: string;
  note?: string;
  items: OrderItemPayload[];
};

// ─── Update payload ───────────────────────────────────────────────────────────
export type UpdateOrderPayload = {
  status?: OrderStatus;
  note?: string;
  items?: OrderItemPayload[];
};

export type UpdateOrderArgs = {
  orderId: string;
  payload: UpdateOrderPayload;
};

// ─── Delete response ──────────────────────────────────────────────────────────
export type DeleteOrderResponse = {
  message: string;
};

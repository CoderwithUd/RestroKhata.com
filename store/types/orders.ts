// ─── Order Status ───────────────────────────────────────────────────────────
export type OrderStatus =
  | "PLACED"
  | "IN_PROGRESS"
  | "READY"
  | "SERVED"
  | "COMPLETED"
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
  lineId?: string;
  itemId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  status?: OrderStatus;
  kitchenStatus?: OrderStatus;
  taxPercentage?: number;
  options?: OrderItemOption[];
  note?: string;
  lineSubTotal?: number;
  lineTax?: number;
  lineTotal?: number;
  createdAt?: string;
  updatedAt?: string;
};

// ─── Creator / updater ref ───────────────────────────────────────────────────
export type OrderUserRef = {
  userId: string | null;
  role: string;
  name?: string;
};

export type OrderInvoiceRequest = {
  requestedAt?: string;
  source?: string;
  name?: string;
  phone?: string;
};

// ─── Full order record ───────────────────────────────────────────────────────
export type OrderRecord = {
  id: string;
  tenantId?: string;
  orderNumber?: string;
  table?: OrderTableRef;
  tableId?: string;
  tableName?: string;
  customerName?: string;
  customerPhone?: string;
  source?: "STAFF" | "QR" | string;
  sessionToken?: string;
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
  invoiceRequest?: OrderInvoiceRequest | null;
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

export type KitchenItemsQueryParams = {
  status?: string | string[];
  includeDone?: boolean;
  tableId?: string;
  page?: number;
  limit?: number;
};

export type KitchenQueueItem = {
  lineId: string;
  orderId: string;
  orderNumber?: string;
  source?: string;
  orderStatus?: OrderStatus;
  orderNote?: string;
  table?: OrderTableRef;
  tableId?: string;
  tableName?: string;
  customerName?: string;
  customerPhone?: string;
  itemId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  quantity: number;
  note?: string;
  kitchenStatus: OrderStatus;
  addedAt?: string;
  ageMinutes?: number;
  priorityLabel?: string;
  priorityScore?: number;
  raw?: Record<string, unknown>;
  item?: Record<string, unknown>;
};

export type KitchenItemsResponse = {
  items: KitchenQueueItem[];
  pagination: OrdersPagination;
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
  customerName?: string;
  customerPhone?: string;
  items: OrderItemPayload[];
  forceNew?: boolean;
  appendToOrderId?: string;
};

// ─── Update payload ───────────────────────────────────────────────────────────
export type UpdateOrderPayload = {
  status?: OrderStatus;
  note?: string;
  items?: OrderItemPayload[];
  itemStatusUpdates?: Array<{
    lineId: string;
    status: OrderStatus;
  }>;
};

export type UpdateOrderArgs = {
  orderId: string;
  payload: UpdateOrderPayload;
};

export type RemoveOrderItemPayload = {
  quantity?: number;
};

export type RemoveOrderItemArgs = {
  orderId: string;
  lineId: string;
  payload?: RemoveOrderItemPayload;
};

export type CancelOrderItemArgs = {
  orderId: string;
  lineId: string;
};

export type MoveOrderItemPayload = {
  targetOrderId?: string;
  targetTableId?: string;
  quantity?: number;
};

export type MoveOrderItemArgs = {
  orderId: string;
  lineId: string;
  payload: MoveOrderItemPayload;
};

// ─── Delete response ──────────────────────────────────────────────────────────
export type DeleteOrderResponse = {
  message: string;
};

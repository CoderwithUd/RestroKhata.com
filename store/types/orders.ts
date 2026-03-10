export type OrdersQueryParams = {
  tableId?: string;
  status?: string[];
  page?: number;
  limit?: number;
};

export type OrdersPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type OrderRecord = {
  id: string;
  orderNumber?: string;
  status?: string;
  tableId?: string;
  tableName?: string;
  sourceLabel?: string;
  itemsSummary?: string;
  raw: Record<string, unknown>;
};

export type OrdersListPayload = {
  items: OrderRecord[];
  pagination: OrdersPagination;
};

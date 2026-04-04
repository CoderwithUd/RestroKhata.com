export type CustomerRecord = {
  id: string;
  tenantId?: string;
  name?: string;
  phone?: string;
  phoneRaw?: string;
  phoneNormalized?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
  raw?: Record<string, unknown> | null;
};

export type CustomersQueryParams = {
  q?: string;
  page?: number;
  limit?: number;
};

export type CustomersListResponse = {
  items: CustomerRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type CustomerResponse = {
  customer: CustomerRecord;
};

export type TableQrFormat = "dataUrl" | "svg";
export type TableStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED" | "BILLING" | string;

export type TableRecord = {
  id: string;
  tenantId?: string;
  number: number;
  name: string;
  capacity: number;
  isActive: boolean;
  status?: TableStatus;
  customerId?: string;
  qrPayload?: string;
  qrFormat?: TableQrFormat;
  qrCode?: string;
  qrUpdatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TablesQueryParams = {
  isActive?: boolean;
};

export type TablesListResponse = {
  items: TableRecord[];
};

export type CreateTablePayload = {
  number: number;
  name: string;
  capacity: number;
  isActive?: boolean;
  status?: TableStatus;
  customerId?: string;
};

export type CreateTableResponse = {
  message: string;
  table: TableRecord;
};

export type UpdateTablePayload = {
  number?: number;
  name?: string;
  capacity?: number;
  isActive?: boolean;
  status?: TableStatus;
  customerId?: string;
};

export type UpdateTableArgs = UpdateTablePayload & {
  tableId: string;
};

export type UpdateTableResponse = {
  message: string;
  table: TableRecord;
};

export type DeleteTableArgs = {
  tableId: string;
};

export type DeleteTableResponse = {
  message: string;
};

export type TenantTableInfo = {
  id?: string;
  name?: string;
  slug?: string;
};

export type TableQrResponse = {
  table: Pick<TableRecord, "id" | "number" | "name">;
  tenant: TenantTableInfo;
  qrPayload: string;
  format: TableQrFormat;
  qr: string;
};

export type GetTableQrArgs = {
  tableId: string;
  format?: TableQrFormat;
  baseUrl?: string;
};

export type CreateTableQrTokenPayload = {
  expiresInHours?: number;
  format?: TableQrFormat;
  baseUrl?: string;
};

export type CreateTableQrTokenArgs = CreateTableQrTokenPayload & {
  tableId: string;
};

export type CreateTableQrTokenResponse = {
  token: string;
  expiresAt: string;
  qrPayload: string;
  format: TableQrFormat;
  qr: string;
};

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
  TableQrResponse,
  TablesListResponse,
  TablesQueryParams,
  UpdateTableArgs,
  UpdateTableResponse,
} from "@/store/types/tables";

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

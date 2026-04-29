import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "@/store/api/baseQuery";
import type {
  CreateMenuOptionGroupPayload,
  CreateMenuCategoryPayload,
  CreateMenuItemPayload,
  DeleteMenuCategoryArgs,
  DeleteMenuOptionGroupArgs,
  DeleteMenuItemArgs,
  DeleteMenuItemResponse,
  MenuAggregateCategory,
  MenuAggregateResponse,
  MenuCategoriesResponse,
  MenuCategoryMutationResponse,
  MenuCategoryRecord,
  MenuItemQueryParams,
  MenuItemRecord,
  MenuItemsListResponse,
  MenuItemsPagination,
  MenuMutationResponse,
  MenuOptionGroupMutationResponse,
  MenuOptionGroupRecord,
  MenuOptionGroupsResponse,
  MenuOptionRecord,
  MenuVariantPayload,
  MenuVariantRecord,
  UpdateMenuOptionGroupArgs,
  UpdateMenuCategoryArgs,
  UpdateMenuItemArgs,
  UpdateMenuItemPayload,
} from "@/store/types/menu";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
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

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "active", "available"].includes(normalized)) return true;
    if (["false", "0", "no", "inactive", "unavailable"].includes(normalized)) return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
}

function parseVariant(value: unknown): MenuVariantRecord | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(record.id) || asString(record._id) || asString(record.variantId);
  if (!id) return null;

  return {
    id,
    name: asString(record.name) || "Regular",
    price: asNumber(record.price) ?? 0,
    isAvailable: asBoolean(record.isAvailable) ?? true,
    sortOrder: asNumber(record.sortOrder),
    raw: record,
  };
}

function parseCategory(value: unknown): MenuCategoryRecord | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(record.id) || asString(record._id) || asString(record.categoryId);
  if (!id) return null;

  const children = asArray(record.children)
    .map(parseCategory)
    .filter((category): category is MenuCategoryRecord => Boolean(category));

  return {
    id,
    name: asString(record.name) || "Untitled Category",
    parentId: asString(record.parentId) ?? null,
    sortOrder: asNumber(record.sortOrder),
    children,
    raw: record,
  };
}

function parseItem(value: unknown): MenuItemRecord | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(record.id) || asString(record._id) || asString(record.itemId);
  if (!id) return null;

  const categoryRecord = asRecord(record.category);
  const categoryId =
    asString(record.categoryId) ||
    asString(categoryRecord?.id) ||
    asString(categoryRecord?._id) ||
    asString((record.rawCategory as Record<string, unknown> | undefined)?.id);
  const categoryName = asString(categoryRecord?.name) || asString(record.categoryName);

  const variants = asArray(record.variants).map(parseVariant).filter((variant): variant is MenuVariantRecord => Boolean(variant));
  const optionGroupIds = [
    ...asArray(record.optionGroupIds)
      .map((entry) => asString(entry))
      .filter((entry): entry is string => Boolean(entry)),
    ...asArray(record.optionGroups)
      .map((entry) => asRecord(entry))
      .map((entry) => asString(entry?.id) || asString(entry?._id))
      .filter((entry): entry is string => Boolean(entry)),
  ];
  const fallbackPrice = asNumber(record.price) ?? 0;
  const price = variants.length ? variants[0].price : fallbackPrice;

  const isAvailable =
    asBoolean(record.isAvailable) ??
    asBoolean(record.available) ??
    (variants.length ? variants.some((variant) => variant.isAvailable) : true);

  return {
    id,
    name: asString(record.name) || "Untitled Item",
    description: asString(record.description),
    image: asString(record.image),
    images: asArray(record.images).map(asString).filter((img): img is string => Boolean(img)),
    sku: asString(record.sku),
    basePrice: asNumber(record.basePrice),
    foodType: asString(record.foodType),
    prepTime: asNumber(record.prepTime),
    tags: asArray(record.tags).map(asString).filter((t): t is string => Boolean(t)),
    stock: asNumber(record.stock),
    isFeatured: asBoolean(record.isFeatured),
    isDeleted: asBoolean(record.isDeleted),
    taxPercentage: asNumber(record.taxPercentage),
    sortOrder: asNumber(record.sortOrder),
    categoryId,
    categoryName,
    category:
      categoryId && categoryName
        ? {
            id: categoryId,
            name: categoryName,
            parentId: asString(categoryRecord?.parentId) ?? null,
          }
        : null,
    variants,
    optionGroupIds: Array.from(new Set(optionGroupIds)),
    isAvailable,
    price,
    raw: record,
  };
}

function parseOption(value: unknown): MenuOptionRecord | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(record.id) || asString(record._id) || asString(record.optionId);
  if (!id) return null;

  return {
    id,
    name: asString(record.name) || "Option",
    price: asNumber(record.price),
    isAvailable: asBoolean(record.isAvailable),
    sortOrder: asNumber(record.sortOrder),
    raw: record,
  };
}

function parseOptionGroup(value: unknown): MenuOptionGroupRecord | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(record.id) || asString(record._id) || asString(record.groupId);
  if (!id) return null;

  return {
    id,
    name: asString(record.name) || "Option Group",
    minSelect: asNumber(record.minSelect),
    maxSelect: asNumber(record.maxSelect),
    sortOrder: asNumber(record.sortOrder),
    options: asArray(record.options).map(parseOption).filter((option): option is MenuOptionRecord => Boolean(option)),
    raw: record,
  };
}

function parsePagination(value: unknown, fallbackTotal: number): MenuItemsPagination {
  const record = asRecord(value);

  return {
    page: asNumber(record?.page) || 1,
    limit: asNumber(record?.limit) || Math.max(fallbackTotal, 1),
    total: asNumber(record?.total) || fallbackTotal,
    totalPages: asNumber(record?.totalPages) || 1,
  };
}

function parseItemsList(data: unknown): MenuItemsListResponse {
  const root = asRecord(data);

  if (Array.isArray(data)) {
    const items = data.map(parseItem).filter((item): item is MenuItemRecord => Boolean(item));
    return {
      items,
      pagination: parsePagination(undefined, items.length),
    };
  }

  if (!root) {
    return {
      items: [],
      pagination: parsePagination(undefined, 0),
    };
  }

  const nestedData = asRecord(root.data);
  const rawItems =
    asArray(root.items).length
      ? root.items
      : asArray(root.results).length
        ? root.results
        : asArray(root.menu).length
          ? root.menu
          : asArray(nestedData?.items).length
            ? nestedData?.items
            : Array.isArray(nestedData)
              ? nestedData
              : [];

  const items = asArray(rawItems).map(parseItem).filter((item): item is MenuItemRecord => Boolean(item));

  return {
    items,
    pagination: parsePagination(root.pagination || nestedData?.pagination, items.length),
  };
}

function parseCategories(data: unknown): MenuCategoriesResponse {
  if (Array.isArray(data)) {
    return {
      items: data.map(parseCategory).filter((category): category is MenuCategoryRecord => Boolean(category)),
    };
  }

  const root = asRecord(data);
  if (!root) {
    return { items: [] };
  }

  const nestedData = asRecord(root.data);
  const rawItems =
    asArray(root.items).length
      ? root.items
      : asArray(root.categories).length
        ? root.categories
        : asArray(nestedData?.items).length
          ? nestedData?.items
          : asArray(nestedData?.categories).length
            ? nestedData?.categories
            : [];

  return {
    items: asArray(rawItems).map(parseCategory).filter((category): category is MenuCategoryRecord => Boolean(category)),
  };
}

function parseAggregateCategory(value: unknown): MenuAggregateCategory | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(record.id) || asString(record._id) || asString(record.categoryId);
  if (!id) return null;

  const items = asArray(record.items).map(parseItem).filter((item): item is MenuItemRecord => Boolean(item));
  const children = asArray(record.children)
    .map(parseAggregateCategory)
    .filter((category): category is MenuAggregateCategory => Boolean(category));

  return {
    id,
    name: asString(record.name) || "Untitled Category",
    items,
    children,
    raw: record,
  };
}

function parseAggregate(data: unknown): MenuAggregateResponse {
  const root = asRecord(data);

  if (Array.isArray(data)) {
    return {
      categories: data
        .map(parseAggregateCategory)
        .filter((category): category is MenuAggregateCategory => Boolean(category)),
    };
  }

  if (!root) {
    return { categories: [] };
  }

  const nestedData = asRecord(root.data);
  const rawCategories =
    asArray(root.categories).length
      ? root.categories
      : asArray(root.items).length
        ? root.items
        : asArray(nestedData?.categories).length
          ? nestedData?.categories
          : asArray(nestedData?.items).length
            ? nestedData?.items
            : [];

  return {
    categories: asArray(rawCategories)
      .map(parseAggregateCategory)
      .filter((category): category is MenuAggregateCategory => Boolean(category)),
  };
}

function parseItemMutation(data: unknown, fallbackMessage: string): MenuMutationResponse {
  const root = asRecord(data);
  if (!root) {
    return { message: fallbackMessage };
  }

  return {
    message: asString(root.message) || fallbackMessage,
    item: parseItem(root.item) || parseItem(root.data) || parseItem(root.menu) || parseItem(root) || undefined,
  };
}

function parseOptionGroups(data: unknown): MenuOptionGroupsResponse {
  if (Array.isArray(data)) {
    return {
      items: data.map(parseOptionGroup).filter((group): group is MenuOptionGroupRecord => Boolean(group)),
    };
  }

  const root = asRecord(data);
  if (!root) {
    return { items: [] };
  }

  const nestedData = asRecord(root.data);
  const rawItems =
    asArray(root.items).length
      ? root.items
      : asArray(root.optionGroups).length
        ? root.optionGroups
        : asArray(nestedData?.items).length
          ? nestedData?.items
          : asArray(nestedData?.optionGroups).length
            ? nestedData?.optionGroups
            : [];

  return {
    items: asArray(rawItems).map(parseOptionGroup).filter((group): group is MenuOptionGroupRecord => Boolean(group)),
  };
}

function parseCategoryMutation(data: unknown, fallbackMessage: string): MenuCategoryMutationResponse {
  const root = asRecord(data);
  if (!root) {
    return { message: fallbackMessage };
  }

  return {
    message: asString(root.message) || fallbackMessage,
    category: parseCategory(root.category) || parseCategory(root.data) || parseCategory(root) || undefined,
  };
}

function parseOptionGroupMutation(data: unknown, fallbackMessage: string): MenuOptionGroupMutationResponse {
  const root = asRecord(data);
  if (!root) {
    return { message: fallbackMessage };
  }

  const nestedData = asRecord(root.data);

  return {
    message: asString(root.message) || fallbackMessage,
    optionGroup:
      parseOptionGroup(root.optionGroup) ||
      parseOptionGroup(root.group) ||
      parseOptionGroup(nestedData?.optionGroup) ||
      parseOptionGroup(nestedData?.group) ||
      parseOptionGroup(nestedData) ||
      parseOptionGroup(root) ||
      undefined,
  };
}

function normalizeVariantsForPayload(variants: MenuVariantPayload[]): MenuVariantPayload[] {
  return variants
    .map((variant, index) => ({
      name: variant.name?.trim() || `Variant ${index + 1}`,
      price: Number.isFinite(variant.price) ? Math.max(0, variant.price) : 0,
      isAvailable: typeof variant.isAvailable === "boolean" ? variant.isAvailable : true,
      sortOrder: Number.isFinite(variant.sortOrder) ? variant.sortOrder : index,
    }))
    .filter((variant) => variant.name);
}

function normalizeItemPayload(payload: CreateMenuItemPayload): CreateMenuItemPayload {
  return {
    ...payload,
    name: payload.name.trim(),
    description: payload.description?.trim() || undefined,
    image: payload.image?.trim() || undefined,
    sortOrder: Number.isFinite(payload.sortOrder) ? payload.sortOrder : 0,
    taxPercentage: Number.isFinite(payload.taxPercentage) ? payload.taxPercentage : 0,
    variants: normalizeVariantsForPayload(payload.variants),
    optionGroupIds: payload.optionGroupIds?.filter((id) => Boolean(id?.trim())) || [],
  };
}

function normalizeUpdateItemPayload(payload: UpdateMenuItemPayload): UpdateMenuItemPayload {
  const normalized: UpdateMenuItemPayload = { ...payload };
  if (normalized.name !== undefined) normalized.name = normalized.name.trim();
  if (normalized.description !== undefined) normalized.description = normalized.description.trim() || undefined;
  if (normalized.image !== undefined) normalized.image = normalized.image.trim() || undefined;
  if (normalized.variants) normalized.variants = normalizeVariantsForPayload(normalized.variants);
  if (normalized.optionGroupIds) normalized.optionGroupIds = normalized.optionGroupIds.filter((id) => Boolean(id?.trim()));
  return normalized;
}

function normalizeOptionGroupPayload(payload: CreateMenuOptionGroupPayload): CreateMenuOptionGroupPayload {
  const maxBase =
    Number.isFinite(payload.maxSelect) && (payload.maxSelect as number) >= 0
      ? (payload.maxSelect as number)
      : Number.isFinite(payload.minSelect) && (payload.minSelect as number) >= 0
        ? (payload.minSelect as number)
        : 0;
  const minSelect = Number.isFinite(payload.minSelect) ? Math.max(0, payload.minSelect as number) : 0;
  const maxSelect = Math.max(minSelect, maxBase);

  return {
    name: payload.name.trim(),
    minSelect,
    maxSelect,
    sortOrder: Number.isFinite(payload.sortOrder) ? payload.sortOrder : 0,
  };
}

export const menuApi = createApi({
  reducerPath: "menuApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["MenuItems", "MenuCategories", "MenuAggregate", "MenuOptionGroups"],
  endpoints: (builder) => ({
    getMenuCategories: builder.query<MenuCategoriesResponse, { flat?: boolean } | void>({
      query: (params) => ({
        url: "/menu/categories",
        method: "GET",
        credentials: "include",
        params: {
          flat: typeof params?.flat === "boolean" ? String(params.flat) : undefined,
        },
      }),
      transformResponse: (response: unknown) => parseCategories(response),
      providesTags: (result) => [
        { type: "MenuCategories", id: "LIST" },
        ...(result?.items.map((category) => ({ type: "MenuCategories" as const, id: category.id })) ?? []),
      ],
    }),

    createMenuCategory: builder.mutation<MenuCategoryMutationResponse, CreateMenuCategoryPayload>({
      query: (payload) => ({
        url: "/menu/categories",
        method: "POST",
        credentials: "include",
        body: {
          name: payload.name.trim(),
          parentId: payload.parentId || null,
          sortOrder: Number.isFinite(payload.sortOrder) ? payload.sortOrder : 0,
        },
      }),
      transformResponse: (response: unknown) => parseCategoryMutation(response, "Category created"),
      invalidatesTags: [{ type: "MenuCategories", id: "LIST" }, { type: "MenuAggregate", id: "TREE" }],
    }),

    updateMenuCategory: builder.mutation<MenuCategoryMutationResponse, UpdateMenuCategoryArgs>({
      query: ({ categoryId, payload }) => ({
        url: `/menu/categories/${categoryId}`,
        method: "PUT",
        credentials: "include",
        body: {
          name: payload.name.trim(),
          parentId: payload.parentId || null,
          sortOrder: Number.isFinite(payload.sortOrder) ? payload.sortOrder : 0,
        },
      }),
      transformResponse: (response: unknown) => parseCategoryMutation(response, "Category updated"),
      invalidatesTags: (_result, _error, { categoryId }) => [
        { type: "MenuCategories", id: "LIST" },
        { type: "MenuCategories", id: categoryId },
        { type: "MenuAggregate", id: "TREE" },
      ],
    }),

    deleteMenuCategory: builder.mutation<DeleteMenuItemResponse, DeleteMenuCategoryArgs>({
      query: ({ categoryId }) => ({
        url: `/menu/categories/${categoryId}`,
        method: "DELETE",
        credentials: "include",
      }),
      transformResponse: (response: unknown) => {
        const root = asRecord(response);
        return { message: asString(root?.message) || "Category deleted" };
      },
      invalidatesTags: (_result, _error, { categoryId }) => [
        { type: "MenuCategories", id: "LIST" },
        { type: "MenuCategories", id: categoryId },
        { type: "MenuItems", id: "LIST" },
        { type: "MenuAggregate", id: "TREE" },
      ],
    }),

    getMenuOptionGroups: builder.query<MenuOptionGroupsResponse, void>({
      query: () => ({
        url: "/menu/option-groups",
        method: "GET",
        credentials: "include",
      }),
      transformResponse: (response: unknown) => parseOptionGroups(response),
      providesTags: (result) => [
        { type: "MenuOptionGroups", id: "LIST" },
        ...(result?.items.map((group) => ({ type: "MenuOptionGroups" as const, id: group.id })) ?? []),
      ],
    }),

    createMenuOptionGroup: builder.mutation<MenuOptionGroupMutationResponse, CreateMenuOptionGroupPayload>({
      query: (payload) => ({
        url: "/menu/option-groups",
        method: "POST",
        credentials: "include",
        body: normalizeOptionGroupPayload(payload),
      }),
      transformResponse: (response: unknown) => parseOptionGroupMutation(response, "Option group created"),
      invalidatesTags: [{ type: "MenuOptionGroups", id: "LIST" }, { type: "MenuAggregate", id: "TREE" }],
    }),

    updateMenuOptionGroup: builder.mutation<MenuOptionGroupMutationResponse, UpdateMenuOptionGroupArgs>({
      query: ({ groupId, payload }) => ({
        url: `/menu/option-groups/${groupId}`,
        method: "PUT",
        credentials: "include",
        body: normalizeOptionGroupPayload(payload),
      }),
      transformResponse: (response: unknown) => parseOptionGroupMutation(response, "Option group updated"),
      invalidatesTags: (_result, _error, { groupId }) => [
        { type: "MenuOptionGroups", id: "LIST" },
        { type: "MenuOptionGroups", id: groupId },
        { type: "MenuAggregate", id: "TREE" },
      ],
    }),

    deleteMenuOptionGroup: builder.mutation<DeleteMenuItemResponse, DeleteMenuOptionGroupArgs>({
      query: ({ groupId }) => ({
        url: `/menu/option-groups/${groupId}`,
        method: "DELETE",
        credentials: "include",
      }),
      transformResponse: (response: unknown) => {
        const root = asRecord(response);
        return { message: asString(root?.message) || "Option group deleted" };
      },
      invalidatesTags: (_result, _error, { groupId }) => [
        { type: "MenuOptionGroups", id: "LIST" },
        { type: "MenuOptionGroups", id: groupId },
        { type: "MenuItems", id: "LIST" },
        { type: "MenuAggregate", id: "TREE" },
      ],
    }),

    getMenuItems: builder.query<MenuItemsListResponse, MenuItemQueryParams | void>({
      query: (params) => ({
        url: "/menu/items",
        method: "GET",
        credentials: "include",
        params: {
          categoryId: params?.categoryId || undefined,
          isAvailable: typeof params?.isAvailable === "boolean" ? String(params.isAvailable) : undefined,
          q: params?.q || undefined,
          page: params?.page,
          limit: params?.limit,
        },
      }),
      transformResponse: (response: unknown) => parseItemsList(response),
      providesTags: (result) => [
        { type: "MenuItems", id: "LIST" },
        ...(result?.items.map((item) => ({ type: "MenuItems" as const, id: item.id })) ?? []),
      ],
    }),

    createMenuItem: builder.mutation<MenuMutationResponse, CreateMenuItemPayload>({
      query: (payload) => ({
        url: "/menu/items",
        method: "POST",
        credentials: "include",
        body: normalizeItemPayload(payload),
      }),
      transformResponse: (response: unknown) => parseItemMutation(response, "Menu item created"),
      invalidatesTags: [
        { type: "MenuItems", id: "LIST" },
        { type: "MenuAggregate", id: "TREE" },
      ],
    }),

    updateMenuItem: builder.mutation<MenuMutationResponse, UpdateMenuItemArgs>({
      query: ({ itemId, payload }) => ({
        url: `/menu/items/${itemId}`,
        method: "PATCH",
        credentials: "include",
        body: normalizeUpdateItemPayload(payload),
      }),
      transformResponse: (response: unknown) => parseItemMutation(response, "Menu item updated"),
      invalidatesTags: (_result, _error, { itemId }) => [
        { type: "MenuItems", id: "LIST" },
        { type: "MenuItems", id: itemId },
        { type: "MenuAggregate", id: "TREE" },
      ],
    }),

    deleteMenuItem: builder.mutation<DeleteMenuItemResponse, DeleteMenuItemArgs>({
      query: ({ itemId }) => ({
        url: `/menu/items/${itemId}`,
        method: "DELETE",
        credentials: "include",
      }),
      transformResponse: (response: unknown) => {
        const root = asRecord(response);
        return { message: asString(root?.message) || "Menu item deleted" };
      },
      invalidatesTags: (_result, _error, { itemId }) => [
        { type: "MenuItems", id: "LIST" },
        { type: "MenuItems", id: itemId },
        { type: "MenuAggregate", id: "TREE" },
      ],
    }),

    getMenuAggregate: builder.query<MenuAggregateResponse, { isAvailable?: boolean } | void>({
      query: (params) => ({
        url: "/menu/menu",
        method: "GET",
        credentials: "include",
        params: {
          isAvailable: typeof params?.isAvailable === "boolean" ? String(params.isAvailable) : undefined,
        },
      }),
      transformResponse: (response: unknown) => parseAggregate(response),
      providesTags: [{ type: "MenuAggregate", id: "TREE" }],
    }),
  }),
});

export const {
  useGetMenuCategoriesQuery,
  useCreateMenuCategoryMutation,
  useUpdateMenuCategoryMutation,
  useDeleteMenuCategoryMutation,
  useGetMenuOptionGroupsQuery,
  useCreateMenuOptionGroupMutation,
  useUpdateMenuOptionGroupMutation,
  useDeleteMenuOptionGroupMutation,
  useGetMenuItemsQuery,
  useCreateMenuItemMutation,
  useUpdateMenuItemMutation,
  useDeleteMenuItemMutation,
  useGetMenuAggregateQuery,
} = menuApi;

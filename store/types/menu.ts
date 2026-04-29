export type MenuCategoryRecord = {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  children?: MenuCategoryRecord[];
  raw: Record<string, unknown>;
};

export type MenuOptionRecord = {
  id: string;
  name: string;
  price?: number;
  isAvailable?: boolean;
  sortOrder?: number;
  raw: Record<string, unknown>;
};

export type MenuOptionGroupRecord = {
  id: string;
  name: string;
  minSelect?: number;
  maxSelect?: number;
  sortOrder?: number;
  options: MenuOptionRecord[];
  raw: Record<string, unknown>;
};

export type MenuVariantRecord = {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  sortOrder?: number;
  raw: Record<string, unknown>;
};

export type MenuItemRecord = {
  id: string;
  name: string;
  description?: string;
  image?: string;
  images?: string[];
  sku?: string;
  basePrice?: number;
  foodType?: string;
  prepTime?: number;
  tags?: string[];
  stock?: number;
  isFeatured?: boolean;
  isDeleted?: boolean;
  taxPercentage?: number;
  sortOrder?: number;
  categoryId?: string;
  categoryName?: string;
  fulfillmentType?: string;
  category?: {
    id: string;
    name: string;
    parentId?: string | null;
  } | null;
  variants: MenuVariantRecord[];
  optionGroupIds?: string[];
  isAvailable: boolean;
  price: number;
  raw: Record<string, unknown>;
};

export type MenuItemsPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type MenuItemsListResponse = {
  items: MenuItemRecord[];
  pagination: MenuItemsPagination;
};

export type MenuCategoriesResponse = {
  items: MenuCategoryRecord[];
};

export type MenuOptionGroupsResponse = {
  items: MenuOptionGroupRecord[];
};

export type CreateMenuOptionGroupPayload = {
  name: string;
  minSelect?: number;
  maxSelect?: number;
  sortOrder?: number;
};

export type UpdateMenuOptionGroupArgs = {
  groupId: string;
  payload: CreateMenuOptionGroupPayload;
};

export type DeleteMenuOptionGroupArgs = {
  groupId: string;
};

export type MenuAggregateCategory = {
  id: string;
  name: string;
  items: MenuItemRecord[];
  children: MenuAggregateCategory[];
  raw: Record<string, unknown>;
};

export type MenuAggregateResponse = {
  categories: MenuAggregateCategory[];
};

export type MenuVariantPayload = {
  name: string;
  price: number;
  isAvailable?: boolean;
  sortOrder?: number;
};

export type CreateMenuItemPayload = {
  categoryId: string;
  name: string;
  description?: string;
  image?: string;
  images?: string[];
  sku?: string;
  basePrice?: number;
  foodType?: string;
  prepTime?: number;
  tags?: string[];
  stock?: number;
  isFeatured?: boolean;
  taxPercentage?: number;
  sortOrder?: number;
  variants: MenuVariantPayload[];
  optionGroupIds?: string[];
  fulfillmentType?: string;
};

export type UpdateMenuItemPayload = {
  categoryId?: string;
  name?: string;
  description?: string;
  image?: string;
  images?: string[];
  sku?: string;
  basePrice?: number;
  foodType?: string;
  prepTime?: number;
  tags?: string[];
  stock?: number;
  isFeatured?: boolean;
  isDeleted?: boolean;
  taxPercentage?: number;
  sortOrder?: number;
  variants?: MenuVariantPayload[];
  optionGroupIds?: string[];
  fulfillmentType?: string;
  isAvailable?: boolean;
};

export type UpdateMenuItemArgs = {
  itemId: string;
  payload: UpdateMenuItemPayload;
};

export type DeleteMenuItemArgs = {
  itemId: string;
};

export type CreateMenuCategoryPayload = {
  name: string;
  parentId?: string | null;
  sortOrder?: number;
};

export type UpdateMenuCategoryArgs = {
  categoryId: string;
  payload: CreateMenuCategoryPayload;
};

export type DeleteMenuCategoryArgs = {
  categoryId: string;
};

export type MenuItemQueryParams = {
  categoryId?: string;
  isAvailable?: boolean;
  q?: string;
  page?: number;
  limit?: number;
};

export type MenuMutationResponse = {
  message: string;
  item?: MenuItemRecord;
};

export type MenuCategoryMutationResponse = {
  message: string;
  category?: MenuCategoryRecord;
};

export type MenuOptionGroupMutationResponse = {
  message: string;
  optionGroup?: MenuOptionGroupRecord;
};

export type DeleteMenuItemResponse = {
  message: string;
};

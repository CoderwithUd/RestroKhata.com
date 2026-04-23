"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/confirm-provider";
import { getErrorMessage } from "@/lib/error";
import { showError, showSuccess } from "@/lib/feedback";
import {
  useCreateMenuOptionGroupMutation,
  useCreateMenuCategoryMutation,
  useCreateMenuItemMutation,
  useDeleteMenuCategoryMutation,
  useDeleteMenuOptionGroupMutation,
  useDeleteMenuItemMutation,
  useGetMenuCategoriesQuery,
  useGetMenuItemsQuery,
  useGetMenuOptionGroupsQuery,
  useUpdateMenuOptionGroupMutation,
  useUpdateMenuCategoryMutation,
  useUpdateMenuItemMutation,
} from "@/store/api/menuApi";
import type {
  CreateMenuItemPayload,
  MenuCategoryRecord,
  MenuItemRecord,
  MenuOptionGroupRecord,
  UpdateMenuItemPayload,
} from "@/store/types/menu";

type Props = { tenantName?: string; tenantSlug?: string };

type VariantForm = {
  key: string;
  name: string;
  price: string;
  isAvailable: boolean;
};

type ItemForm = {
  name: string;
  mainCategoryId: string;
  subCategoryId: string;
  description: string;
  image: string;
  taxPercentage: string;
  variants: VariantForm[];
  optionGroupIds: string[];
  fulfillmentType: string;
};

type OptionGroupForm = {
  name: string;
  minSelect: string;
  maxSelect: string;
  sortOrder: string;
};

type QuickMenuAction = "item" | "category" | "subCategory" | "optional";
type MenuPanelTab = "itemList" | "category" | "subCategory" | "optionGroup";
type ListViewMode = "grid" | "table";

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;
const RECENT_PARENT_CATEGORY_STORAGE_KEY = "restrokhata:recent-main-categories";
const MAX_RECENT_PARENT_CATEGORIES = 8;
const MENU_ACTIVE_PANEL_STORAGE_KEY = "restrokhata:menu-active-panel";
const MENU_LIST_VIEW_STORAGE_KEY = "restrokhata:menu-list-view";
const LAST_ITEM_VARIANTS_STORAGE_KEY = "restrokhata:last-item-variants";
const VARIANT_NAME_PRESETS = ["Regular", "Half", "Full", "Large"];
const FULFILLMENTTYPE_NAME = ["KITCHEN", "BAR", "COUNTER", "DIRECT"];

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function flattenCategories(
  categories: MenuCategoryRecord[],
): MenuCategoryRecord[] {
  const output: MenuCategoryRecord[] = [];
  const visit = (nodes: MenuCategoryRecord[]) => {
    nodes.forEach((node) => {
      output.push(node);
      if (node.children?.length) visit(node.children);
    });
  };
  visit(categories);
  return output;
}

function createVariant(index: number): VariantForm {
  return {
    key: `variant-${Date.now()}-${Math.random().toString(16).slice(2)}-${index}`,
    name: index === 0 ? "Regular" : "",
    price: "",
    isAvailable: true,
  };
}

function createVariantFromTemplate(
  template: Omit<VariantForm, "key">,
  index: number,
): VariantForm {
  return {
    key: `variant-${Date.now()}-${Math.random().toString(16).slice(2)}-${index}`,
    name: template.name,
    price: template.price,
    isAvailable: template.isAvailable,
  };
}

function createEmptyForm(): ItemForm {
  return {
    name: "",
    mainCategoryId: "",
    subCategoryId: "",
    description: "",
    image: "",
    taxPercentage: "5",
    variants: [createVariant(0)],
    optionGroupIds: [],
    fulfillmentType: "",
  };
}

function createEmptyOptionGroupForm(): OptionGroupForm {
  return {
    name: "",
    minSelect: "0",
    maxSelect: "1",
    sortOrder: "0",
  };
}

function resolveSelectedCategoryId(form: ItemForm): string {
  return form.subCategoryId || form.mainCategoryId;
}

function resolveItemCategorySelection(
  categoryId: string | undefined,
  categoriesById: Map<string, MenuCategoryRecord>,
): Pick<ItemForm, "mainCategoryId" | "subCategoryId"> {
  if (!categoryId) {
    return { mainCategoryId: "", subCategoryId: "" };
  }

  const selected = categoriesById.get(categoryId);
  if (!selected) {
    return { mainCategoryId: categoryId, subCategoryId: "" };
  }

  if (selected.parentId && categoriesById.has(selected.parentId)) {
    return { mainCategoryId: selected.parentId, subCategoryId: selected.id };
  }

  return { mainCategoryId: selected.id, subCategoryId: "" };
}

function getPrimaryPrice(item: MenuItemRecord): number {
  return item.variants[0]?.price ?? item.price ?? 0;
}

function ensureVariants(item: MenuItemRecord): VariantForm[] {
  if (item.variants.length) {
    return item.variants.map((variant, index) => ({
      key: `existing-${variant.id}-${index}`,
      name: variant.name,
      price: String(variant.price),
      isAvailable: variant.isAvailable,
    }));
  }

  return [
    {
      key: `fallback-${item.id}`,
      name: "Regular",
      price: String(getPrimaryPrice(item)),
      isAvailable: item.isAvailable,
    },
  ];
}

function validateForm(form: ItemForm): string | null {
  if (!form.name.trim()) return "Item name is required";
  if (!form.mainCategoryId) return "Please select main category";
  if (!form.variants.length) return "At least one variant is required";

  for (let i = 0; i < form.variants.length; i += 1) {
    const variant = form.variants[i];
    if (!variant.name.trim()) return `Variant ${i + 1} name is required`;
    if (!variant.price.trim() || toNumber(variant.price, -1) < 0)
      return `Variant ${i + 1} price is invalid`;
  }

  const invalidGroup = form.optionGroupIds.find(
    (id) => !OBJECT_ID_REGEX.test(id),
  );
  if (invalidGroup) return `Invalid option group id: ${invalidGroup}`;

  return null;
}

function toVariantsPayload(variants: VariantForm[]) {
  return variants.map((variant, index) => ({
    name: variant.name.trim() || `Variant ${index + 1}`,
    price: Math.max(0, toNumber(variant.price, 0)),
    isAvailable: variant.isAvailable,
    sortOrder: index,
  }));
}

function toCreatePayload(form: ItemForm): CreateMenuItemPayload {
  return {
    categoryId: resolveSelectedCategoryId(form),
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    image: form.image.trim() || undefined,
    taxPercentage: Math.min(100, Math.max(0, toNumber(form.taxPercentage, 0))),
    sortOrder: 0,
    optionGroupIds: form.optionGroupIds,
    variants: toVariantsPayload(form.variants),
    fulfillmentType: form.fulfillmentType,
  };
}

function toUpdatePayload(
  item: MenuItemRecord,
  form: ItemForm,
): UpdateMenuItemPayload {
  return {
    categoryId: resolveSelectedCategoryId(form),
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    image: form.image.trim() || undefined,
    taxPercentage: Math.min(
      100,
      Math.max(0, toNumber(form.taxPercentage, item.taxPercentage ?? 0)),
    ),
    sortOrder: item.sortOrder ?? 0,
    optionGroupIds: form.optionGroupIds,
    variants: toVariantsPayload(form.variants),
       fulfillmentType: form.fulfillmentType, 
  };
}

function toOptionGroupPayload(form: OptionGroupForm) {
  const minSelect = Math.max(0, Math.floor(toNumber(form.minSelect, 0)));
  const maxSelect = Math.max(
    minSelect,
    Math.floor(toNumber(form.maxSelect, minSelect)),
  );
  const sortOrder = Math.max(0, Math.floor(toNumber(form.sortOrder, 0)));

  return {
    name: form.name.trim(),
    minSelect,
    maxSelect,
    sortOrder,
  };
}

function validateOptionGroupForm(form: OptionGroupForm): string | null {
  if (!form.name.trim()) return "Option group name is required";
  const minSelect = Math.floor(toNumber(form.minSelect, -1));
  const maxSelect = Math.floor(toNumber(form.maxSelect, -1));
  if (minSelect < 0) return "Min select should be 0 or more";
  if (maxSelect < 0) return "Max select should be 0 or more";
  if (maxSelect < minSelect) return "Max select should be >= min select";
  return null;
}

function VariantFields({
  idPrefix,
  variants,
  onChange,
  onAdd,
  onRemove,
  presets,
}: {
  idPrefix: string;
  variants: VariantForm[];
  onChange: (
    key: string,
    field: keyof Omit<VariantForm, "key">,
    value: string | boolean,
  ) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  presets?: string[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Variants
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="w-full rounded-lg border border-[#dfd2bb] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 sm:w-auto"
        >
          + Add Variant
        </button>
      </div>

      {variants.map((variant, index) => (
        <div
          key={variant.key}
          className="rounded-xl border border-[#eadfc9] bg-[#fffaf0] p-2.5"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">
              Variant {index + 1}
            </p>
            {variants.length > 1 ? (
              <button
                type="button"
                onClick={() => onRemove(variant.key)}
                className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700"
              >
                Remove
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor={`${idPrefix}-variant-name-${variant.key}`}
                className="text-xs font-medium text-slate-700"
              >
                Variant Name
              </label>
              <input
                id={`${idPrefix}-variant-name-${variant.key}`}
                value={variant.name}
                onChange={(event) =>
                  onChange(variant.key, "name", event.target.value)
                }
                className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                placeholder="Small / Large"
              />
              {presets?.length ? (
                <div className="flex flex-wrap gap-1 pt-1">
                  {presets.map((preset) => (
                    <button
                      key={`${idPrefix}-${variant.key}-${preset}`}
                      type="button"
                      onClick={() => onChange(variant.key, "name", preset)}
                      className="rounded-full border border-[#d8c8ad] bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-[#faf2e4]"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="space-y-1">
              <label
                htmlFor={`${idPrefix}-variant-price-${variant.key}`}
                className="text-xs font-medium text-slate-700"
              >
                Price (INR)
              </label>
              <input
                id={`${idPrefix}-variant-price-${variant.key}`}
                type="number"
                min={0}
                
                value={variant.price}
                onChange={(event) =>
                  onChange(variant.key, "price", event.target.value)
                }
                className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                placeholder="120"
              />
            </div>
          </div>
          <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={variant.isAvailable}
              onChange={(event) =>
                onChange(variant.key, "isAvailable", event.target.checked)
              }
              className="h-4 w-4 rounded border-slate-300 text-amber-500"
            />
            Variant available for order
          </label>
        </div>
      ))}
    </div>
  );
}

function OptionGroupFields({
  groups,
  selected,
  onToggle,
}: {
  groups: MenuOptionGroupRecord[];
  selected: string[];
  onToggle: (groupId: string, checked: boolean) => void;
}) {
  const selectedNames = groups
    .filter((group) => selected.includes(group.id))
    .map((group) => group.name);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Option Groups (optional)
      </p>
      {groups.length ? (
        <div className="grid gap-2">
          {groups.map((group) => (
            <label
              key={group.id}
              className="rounded-lg border border-[#eadfc9] bg-[#fffaf0] p-2.5 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <span>
                  <span className="block font-semibold text-slate-800">
                    {group.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {group.options.length} options - Min {group.minSelect ?? 0}{" "}
                    / Max {group.maxSelect ?? group.options.length}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={selected.includes(group.id)}
                  onChange={(event) => onToggle(group.id, event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-500"
                />
              </div>
            </label>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-[#e0d6c4] bg-[#fffcf7] px-3 py-2 text-xs text-slate-500">
          No option groups found.
        </p>
      )}
      {selectedNames.length ? (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
          Selected groups: {selectedNames.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function FulfillmentTypeField({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`${idPrefix}-fulfillment-type`}
          className="text-xs font-medium text-slate-700"
        >
          Fulfillment Type
        </label>
        <span className="text-[11px] text-slate-500">Tap one option</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FULFILLMENTTYPE_NAME.map((type) => {
          const active = value === type;
          return (
            <button
              key={`${idPrefix}-${type}`}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(type)}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "border-amber-300 bg-amber-100 text-amber-800"
                  : "border-[#ddd4c1] bg-white text-slate-700 hover:bg-[#faf2e4]"
              }`}
            >
              {type}
            </button>
          );
        })}
      </div>
      <div className="rounded-lg border border-[#e8dcc4] bg-[#fffaf0] px-3 py-2 text-[11px] text-slate-600">
        Selected: {value || "None"}
      </div>
    </div>
  );
}

export function MenuWorkspace({ tenantSlug }: Props) {
  const confirm = useConfirm();
  const { data: categoriesPayload } = useGetMenuCategoriesQuery({ flat: true });
  const { data: optionGroupsPayload, error: optionGroupsError } =
    useGetMenuOptionGroupsQuery();
  const { data: itemsPayload } = useGetMenuItemsQuery({ page: 1, limit: 100 });
  const [createCategory, { isLoading: isCreatingCategory }] =
    useCreateMenuCategoryMutation();
  const [updateCategory, { isLoading: isUpdatingCategory }] =
    useUpdateMenuCategoryMutation();
  const [deleteCategory, { isLoading: isDeletingCategory }] =
    useDeleteMenuCategoryMutation();
  const [createOptionGroup, { isLoading: isCreatingOptionGroup }] =
    useCreateMenuOptionGroupMutation();
  const [updateOptionGroup, { isLoading: isUpdatingOptionGroup }] =
    useUpdateMenuOptionGroupMutation();
  const [deleteOptionGroup, { isLoading: isDeletingOptionGroup }] =
    useDeleteMenuOptionGroupMutation();
  const [createMenuItem, { isLoading: isCreatingItem }] =
    useCreateMenuItemMutation();
  const [updateMenuItem, { isLoading: isUpdatingItem }] =
    useUpdateMenuItemMutation();
  const [deleteMenuItem, { isLoading: isDeletingItem }] =
    useDeleteMenuItemMutation();

  const [itemForm, setItemForm] = useState<ItemForm>(() => createEmptyForm());
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState<"main" | "sub">("main");
  const [categoryParentId, setCategoryParentId] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [groupForm, setGroupForm] = useState<OptionGroupForm>(() =>
    createEmptyOptionGroupForm(),
  );
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupForm, setEditingGroupForm] = useState<OptionGroupForm>(
    () => createEmptyOptionGroupForm(),
  );
  const [editingItem, setEditingItem] = useState<MenuItemRecord | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(() => createEmptyForm());
  const [searchText, setSearchText] = useState("");
  const [mainCategoryFilter, setMainCategoryFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<
    "all" | "available" | "unavailable"
  >("all");
  const [quickMenuAction, setQuickMenuAction] =
    useState<QuickMenuAction | null>(null);
  const [isMenuPreviewOpen, setIsMenuPreviewOpen] = useState(false);
  const [activeMenuPanel, setActiveMenuPanel] = useState<MenuPanelTab>(() => {
    if (typeof window === "undefined") return "itemList";
    const saved = window.localStorage.getItem(MENU_ACTIVE_PANEL_STORAGE_KEY);
    if (
      saved === "itemList" ||
      saved === "category" ||
      saved === "subCategory" ||
      saved === "optionGroup"
    ) {
      return saved;
    }
    return "itemList";
  });
  const [listViewMode, setListViewMode] = useState<ListViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    const saved = window.localStorage.getItem(MENU_LIST_VIEW_STORAGE_KEY);
    return saved === "table" ? "table" : "grid";
  });
  const [lastUsedCreateVariants, setLastUsedCreateVariants] = useState<
    Omit<VariantForm, "key">[]
  >(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(LAST_ITEM_VARIANTS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (variant): variant is Omit<VariantForm, "key"> =>
            !!variant &&
            typeof variant.name === "string" &&
            typeof variant.price === "string" &&
            typeof variant.isAvailable === "boolean",
        )
        .slice(0, 5);
    } catch {
      return [];
    }
  });
  const [recentParentCategoryIds, setRecentParentCategoryIds] = useState<
    string[]
  >(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(
        RECENT_PARENT_CATEGORY_STORAGE_KEY,
      );
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
        .slice(0, MAX_RECENT_PARENT_CATEGORIES);
    } catch {
      return [];
    }
  });
  const menuPreviewHref = tenantSlug
    ? `/qr?tenantSlug=${encodeURIComponent(tenantSlug)}`
    : "";

  const categories = useMemo(
    () =>
      flattenCategories(categoriesPayload?.items || []).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [categoriesPayload?.items],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const mainCategories = useMemo(
    () =>
      categories
        .filter(
          (category) =>
            !category.parentId || !categoriesById.has(category.parentId),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories, categoriesById],
  );
  const quickPickMainCategories = useMemo(() => {
    if (!mainCategories.length) return [];
    const byId = new Map(
      mainCategories.map((category) => [category.id, category]),
    );
    const ordered: MenuCategoryRecord[] = [];
    recentParentCategoryIds.forEach((id) => {
      const found = byId.get(id);
      if (found) ordered.push(found);
    });
    mainCategories.forEach((category) => {
      if (!recentParentCategoryIds.includes(category.id))
        ordered.push(category);
    });
    return ordered;
  }, [mainCategories, recentParentCategoryIds]);
  const subCategoriesByMainId = useMemo(() => {
    const bucket = new Map<string, MenuCategoryRecord[]>();
    categories.forEach((category) => {
      if (!category.parentId || !categoriesById.has(category.parentId)) return;
      const list = bucket.get(category.parentId) || [];
      list.push(category);
      bucket.set(category.parentId, list);
    });

    bucket.forEach((list) => {
      list.sort((a, b) => a.name.localeCompare(b.name));
    });
    return bucket;
  }, [categories, categoriesById]);
  const subCategories = useMemo(
    () =>
      categories
        .filter(
          (category) =>
            !!category.parentId && categoriesById.has(category.parentId),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories, categoriesById],
  );

  const itemSubCategories = useMemo(
    () =>
      itemForm.mainCategoryId
        ? subCategoriesByMainId.get(itemForm.mainCategoryId) || []
        : [],
    [itemForm.mainCategoryId, subCategoriesByMainId],
  );
  const editSubCategories = useMemo(
    () =>
      editForm.mainCategoryId
        ? subCategoriesByMainId.get(editForm.mainCategoryId) || []
        : [],
    [editForm.mainCategoryId, subCategoriesByMainId],
  );
  const optionGroups = useMemo(
    () =>
      (optionGroupsPayload?.items || [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [optionGroupsPayload?.items],
  );
  const items = useMemo(
    () =>
      (itemsPayload?.items || [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [itemsPayload?.items],
  );
  const itemCountByCategoryId = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      if (!item.categoryId) return;
      counts.set(item.categoryId, (counts.get(item.categoryId) || 0) + 1);
    });
    return counts;
  }, [items]);

  const formatCategoryLabel = (category: MenuCategoryRecord): string => {
    if (!category.parentId) return category.name;
    const parent = categoriesById.get(category.parentId);
    return parent ? `${parent.name} > ${category.name}` : category.name;
  };
  const selectedCategoryLabel = (categoryId: string): string => {
    const category = categoriesById.get(categoryId);
    return category ? formatCategoryLabel(category) : categoryId;
  };

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return items.filter((item) => {
      const category = item.categoryId
        ? categoriesById.get(item.categoryId)
        : null;
      const itemMainCategoryId = !item.categoryId
        ? ""
        : !category
          ? item.categoryId
          : category.parentId && categoriesById.has(category.parentId)
            ? category.parentId
            : category.id;

      if (
        mainCategoryFilter !== "all" &&
        itemMainCategoryId !== mainCategoryFilter
      )
        return false;
      if (availabilityFilter === "available" && !item.isAvailable) return false;
      if (availabilityFilter === "unavailable" && item.isAvailable)
        return false;
      if (!q) return true;
      const variantsText = item.variants
        .map((variant) => variant.name)
        .join(" ");
      return `${item.name} ${item.categoryName || ""} ${item.description || ""} ${variantsText}`
        .toLowerCase()
        .includes(q);
    });
  }, [
    availabilityFilter,
    categoriesById,
    items,
    mainCategoryFilter,
    searchText,
  ]);

  const filteredMainCategories = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return mainCategories;
    return mainCategories.filter((category) =>
      `${category.name}`.toLowerCase().includes(q),
    );
  }, [mainCategories, searchText]);

  const filteredSubCategories = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return subCategories;
    return subCategories.filter((category) => {
      const parentName =
        category.parentId && categoriesById.get(category.parentId)?.name;
      return `${category.name} ${parentName || ""}`.toLowerCase().includes(q);
    });
  }, [categoriesById, searchText, subCategories]);

  const filteredOptionGroups = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return optionGroups;
    return optionGroups.filter((group) =>
      `${group.name} ${group.options.map((option) => option.name).join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [optionGroups, searchText]);

  const editingCategory = useMemo(
    () =>
      editingCategoryId ? categoriesById.get(editingCategoryId) || null : null,
    [categoriesById, editingCategoryId],
  );

  const totalItems = items.length;
  const availableItems = items.filter((item) => item.isAvailable).length;
  const unavailableItems = totalItems - availableItems;
  const avgPrice = totalItems
    ? items.reduce((sum, item) => sum + getPrimaryPrice(item), 0) / totalItems
    : 0;

  useEffect(() => {
    try {
      window.localStorage.setItem(
        RECENT_PARENT_CATEGORY_STORAGE_KEY,
        JSON.stringify(recentParentCategoryIds),
      );
    } catch {
      // Ignore local storage write issues.
    }
  }, [recentParentCategoryIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        MENU_ACTIVE_PANEL_STORAGE_KEY,
        activeMenuPanel,
      );
    } catch {
      // Ignore local storage write issues.
    }
  }, [activeMenuPanel]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MENU_LIST_VIEW_STORAGE_KEY, listViewMode);
    } catch {
      // Ignore local storage write issues.
    }
  }, [listViewMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LAST_ITEM_VARIANTS_STORAGE_KEY,
        JSON.stringify(lastUsedCreateVariants),
      );
    } catch {
      // Ignore local storage write issues.
    }
  }, [lastUsedCreateVariants]);

  function rememberRecentParentCategory(categoryId: string) {
    if (!categoryId) return;
    setRecentParentCategoryIds((prev) => {
      const next = [categoryId, ...prev.filter((id) => id !== categoryId)];
      return next.slice(0, MAX_RECENT_PARENT_CATEGORIES);
    });
  }

  function chooseParentCategory(categoryId: string) {
    setCategoryParentId(categoryId);
    rememberRecentParentCategory(categoryId);
  }

  function changeActiveMenuPanel(panel: MenuPanelTab) {
    setActiveMenuPanel(panel);
  }

  function triggerAddAction(action: QuickMenuAction) {
    if (action === "item") changeActiveMenuPanel("itemList");
    if (action === "category") changeActiveMenuPanel("category");
    if (action === "subCategory") changeActiveMenuPanel("subCategory");
    if (action === "optional") changeActiveMenuPanel("optionGroup");
    if (action === "optional") cancelEditOptionGroup();
    if (action === "category" || action === "subCategory") {
      setEditingCategoryId(null);
      setEditingCategoryName("");
      setCategoryName("");
    }
    if (action === "item") {
      setEditingItem(null);
    }
    openQuickMenuAction(action);
  }

  function openAddForActivePanel() {
    if (activeMenuPanel === "itemList") {
      triggerAddAction("item");
      return;
    }
    if (activeMenuPanel === "category") {
      triggerAddAction("category");
      return;
    }
    if (activeMenuPanel === "subCategory") {
      triggerAddAction("subCategory");
      return;
    }
    triggerAddAction("optional");
  }

  function openOptionGroupEditor(group: MenuOptionGroupRecord) {
    startEditOptionGroup(group);
    setQuickMenuAction("optional");
  }

  function openCategoryEditor(category: MenuCategoryRecord) {
    const isSub =
      !!category.parentId && categoriesById.has(category.parentId || "");
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
    setCategoryName(category.name);
    setCategoryType(isSub ? "sub" : "main");
    setCategoryParentId(isSub ? category.parentId || "" : "");
    changeActiveMenuPanel(isSub ? "subCategory" : "category");
    setQuickMenuAction(isSub ? "subCategory" : "category");
  }

  function openQuickMenuAction(action: QuickMenuAction) {
    if (action === "item") {
      const templateVariants = lastUsedCreateVariants.length
        ? lastUsedCreateVariants.map((variant, index) =>
            createVariantFromTemplate(variant, index),
          )
        : [createVariant(0)];
      setItemForm((prev) => ({
        ...createEmptyForm(),
        mainCategoryId: prev.mainCategoryId,
        subCategoryId: prev.subCategoryId,
        taxPercentage: prev.taxPercentage || "5",
        optionGroupIds: prev.optionGroupIds,
        variants: templateVariants,
      }));
    }
    if (action === "category") {
      setCategoryType("main");
      setCategoryParentId("");
    }
    if (action === "subCategory") {
      setCategoryType("sub");
    }
    if (action === "optional") {
      setGroupForm(createEmptyOptionGroupForm());
    }
    setQuickMenuAction(action);
  }

  function closeQuickMenuAction() {
    setQuickMenuAction(null);
    setEditingItem(null);
    setEditingCategoryId(null);
    setEditingCategoryName("");
  }

  function updateVariant(
    mode: "create" | "edit",
    key: string,
    field: keyof Omit<VariantForm, "key">,
    value: string | boolean,
  ) {
    const updateList = (list: VariantForm[]) =>
      list.map((variant) =>
        variant.key === key ? { ...variant, [field]: value } : variant,
      );
    if (mode === "create")
      setItemForm((prev) => ({ ...prev, variants: updateList(prev.variants) }));
    if (mode === "edit")
      setEditForm((prev) => ({ ...prev, variants: updateList(prev.variants) }));
  }

  function addVariant(mode: "create" | "edit") {
    if (mode === "create")
      setItemForm((prev) => ({
        ...prev,
        variants: [
          ...prev.variants,
          lastUsedCreateVariants[prev.variants.length]
            ? createVariantFromTemplate(
                lastUsedCreateVariants[prev.variants.length],
                prev.variants.length,
              )
            : createVariant(prev.variants.length),
        ],
      }));
    if (mode === "edit")
      setEditForm((prev) => ({
        ...prev,
        variants: [...prev.variants, createVariant(prev.variants.length)],
      }));
  }

  function removeVariant(mode: "create" | "edit", key: string) {
    const removeFrom = (list: VariantForm[]) =>
      list.length > 1 ? list.filter((variant) => variant.key !== key) : list;
    if (mode === "create")
      setItemForm((prev) => ({ ...prev, variants: removeFrom(prev.variants) }));
    if (mode === "edit")
      setEditForm((prev) => ({ ...prev, variants: removeFrom(prev.variants) }));
  }

  function toggleGroup(
    mode: "create" | "edit",
    groupId: string,
    checked: boolean,
  ) {
    const update = (list: string[]) =>
      checked
        ? Array.from(new Set([...list, groupId]))
        : list.filter((id) => id !== groupId);
    if (mode === "create")
      setItemForm((prev) => ({
        ...prev,
        optionGroupIds: update(prev.optionGroupIds),
      }));
    if (mode === "edit")
      setEditForm((prev) => ({
        ...prev,
        optionGroupIds: update(prev.optionGroupIds),
      }));
  }

  function changeMainCategory(mode: "create" | "edit", mainCategoryId: string) {
    const update = (prev: ItemForm): ItemForm => {
      const validSubIds = new Set(
        (subCategoriesByMainId.get(mainCategoryId) || []).map(
          (category) => category.id,
        ),
      );
      return {
        ...prev,
        mainCategoryId,
        subCategoryId: validSubIds.has(prev.subCategoryId)
          ? prev.subCategoryId
          : "",
      };
    };

    if (mode === "create") setItemForm(update);
    if (mode === "edit") setEditForm(update);
  }

  function changeSubCategory(mode: "create" | "edit", subCategoryId: string) {
    if (mode === "create") setItemForm((prev) => ({ ...prev, subCategoryId }));
    if (mode === "edit") setEditForm((prev) => ({ ...prev, subCategoryId }));
  }

  function changeMainCategoryFilter(mainCategoryId: string) {
    setMainCategoryFilter(mainCategoryId);
  }

  async function submitCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryName.trim()) {
      showError("Category name is required");
      return;
    }
    if (categoryType === "sub" && !categoryParentId) {
      showError("Sub category ke liye main category select karo");
      return;
    }

    try {
      const parentId = categoryType === "sub" ? categoryParentId : null;
      const siblingCount = parentId
        ? subCategoriesByMainId.get(parentId)?.length || 0
        : mainCategories.length;
      const response = await createCategory({
        name: categoryName.trim(),
        parentId,
        sortOrder: siblingCount + 1,
      }).unwrap();
      setCategoryName("");
      if (categoryType === "sub") {
        setCategoryParentId("");
      }
      showSuccess(response.message || "Category created");
      closeQuickMenuAction();
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  async function submitCategoryEdit(category: MenuCategoryRecord) {
    if (!editingCategoryName.trim()) {
      showError("Category name is required");
      return;
    }

    try {
      const response = await updateCategory({
        categoryId: category.id,
        payload: {
          name: editingCategoryName.trim(),
          parentId: category.parentId ?? null,
          sortOrder: category.sortOrder ?? 0,
        },
      }).unwrap();
      setEditingCategoryId(null);
      setEditingCategoryName("");
      setCategoryName("");
      showSuccess(response.message || "Category updated");
      closeQuickMenuAction();
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  async function removeCategory(category: MenuCategoryRecord) {
    const subCategoryCount =
      subCategoriesByMainId.get(category.id)?.length || 0;
    const itemCount = itemCountByCategoryId.get(category.id) || 0;
    const detailParts = [
      subCategoryCount ? `${subCategoryCount} sub categories` : "",
      itemCount ? `${itemCount} items` : "",
    ].filter(Boolean);
    const detailText = detailParts.length
      ? ` Current usage: ${detailParts.join(", ")}.`
      : "";

    const approved = await confirm({
      title: "Delete Category",
      message: `Delete category "${category.name}"?${detailText} Backend only allows delete when no child categories or items exist.`,
      confirmText: "Delete Category",
      cancelText: "Keep Category",
      tone: "danger",
    });
    if (!approved) return;

    try {
      const response = await deleteCategory({
        categoryId: category.id,
      }).unwrap();
      if (editingCategoryId === category.id) {
        setEditingCategoryId(null);
        setEditingCategoryName("");
      }
      if (categoryParentId === category.id) setCategoryParentId("");
      if (mainCategoryFilter === category.id) setMainCategoryFilter("all");
      showSuccess(response.message || "Category deleted");
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  async function submitCreateOptionGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateOptionGroupForm(groupForm);
    if (validationError) {
      showError(validationError);
      return;
    }

    try {
      const response = await createOptionGroup(
        toOptionGroupPayload(groupForm),
      ).unwrap();
      setGroupForm(createEmptyOptionGroupForm());
      showSuccess(response.message || "Option group created");
      closeQuickMenuAction();
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  function startEditOptionGroup(group: MenuOptionGroupRecord) {
    setEditingGroupId(group.id);
    setEditingGroupForm({
      name: group.name,
      minSelect: String(group.minSelect ?? 0),
      maxSelect: String(group.maxSelect ?? Math.max(1, group.options.length)),
      sortOrder: String(group.sortOrder ?? 0),
    });
  }

  function cancelEditOptionGroup() {
    setEditingGroupId(null);
    setEditingGroupForm(createEmptyOptionGroupForm());
  }

  async function submitUpdateOptionGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingGroupId) return;

    const validationError = validateOptionGroupForm(editingGroupForm);
    if (validationError) {
      showError(validationError);
      return;
    }

    try {
      const response = await updateOptionGroup({
        groupId: editingGroupId,
        payload: toOptionGroupPayload(editingGroupForm),
      }).unwrap();
      cancelEditOptionGroup();
      showSuccess(response.message || "Option group updated");
      closeQuickMenuAction();
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  async function removeOptionGroup(group: MenuOptionGroupRecord) {
    const approved = await confirm({
      title: "Delete Option Group",
      message: `Delete option group "${group.name}"? Menu items linked with this group may lose option mapping.`,
      confirmText: "Delete Group",
      cancelText: "Keep Group",
      tone: "danger",
    });
    if (!approved) return;

    try {
      const response = await deleteOptionGroup({ groupId: group.id }).unwrap();
      if (editingGroupId === group.id) cancelEditOptionGroup();
      showSuccess(response.message || "Option group deleted");
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  async function submitCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateForm(itemForm);
    if (validationError) {
      showError(validationError);
      return;
    }

    try {
      const response = await createMenuItem(toCreatePayload(itemForm)).unwrap();
      const rememberedVariants = itemForm.variants
        .map((variant) => ({
          name: variant.name,
          price: variant.price,
          isAvailable: variant.isAvailable,
        }))
        .filter((variant) => variant.name.trim().length > 0);
      if (rememberedVariants.length) {
        setLastUsedCreateVariants(rememberedVariants.slice(0, 5));
      }
      setItemForm({
        ...createEmptyForm(),
        mainCategoryId: itemForm.mainCategoryId,
        subCategoryId: itemForm.subCategoryId,
        taxPercentage: itemForm.taxPercentage,
        optionGroupIds: itemForm.optionGroupIds,
        variants: rememberedVariants.length
          ? rememberedVariants.map((variant, index) =>
              createVariantFromTemplate(variant, index),
            )
          : [createVariant(0)],
      });
      showSuccess(response.message || "Menu item created");
      closeQuickMenuAction();
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  function openEdit(item: MenuItemRecord) {
    const categorySelection = resolveItemCategorySelection(
      item.categoryId,
      categoriesById,
    );
    setEditingItem(item);
    setEditForm({
      name: item.name,
      mainCategoryId: categorySelection.mainCategoryId,
      subCategoryId: categorySelection.subCategoryId,
      description: item.description || "",
      image: item.image || "",
      taxPercentage: String(item.taxPercentage ?? 0),
      variants: ensureVariants(item),
      optionGroupIds: item.optionGroupIds || [],
      fulfillmentType:item.fulfillmentType || "KITCHEN",
    });
    changeActiveMenuPanel("itemList");
    setQuickMenuAction("item");
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem) return;

    const validationError = validateForm(editForm);
    if (validationError) {
      showError(validationError);
      return;
    }

    try {
      const response = await updateMenuItem({
        itemId: editingItem.id,
        payload: toUpdatePayload(editingItem, editForm),
      }).unwrap();
      setEditingItem(null);
      showSuccess(response.message || "Menu item updated");
      closeQuickMenuAction();
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  async function toggleAvailability(item: MenuItemRecord) {
    if (!item.categoryId) {
      showError("Category missing for this item. Edit item once.");
      return;
    }

    const payload: UpdateMenuItemPayload = {
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      image: item.image,
      taxPercentage: item.taxPercentage ?? 0,
      sortOrder: item.sortOrder ?? 0,
      optionGroupIds: item.optionGroupIds || [],
      variants: (item.variants.length
        ? item.variants
        : [
            {
              id: "temp",
              name: "Regular",
              price: item.price,
              isAvailable: item.isAvailable,
              raw: {},
            },
          ]
      ).map((variant, index) => ({
        name: variant.name,
        price: variant.price,
        isAvailable: !item.isAvailable,
        sortOrder: variant.sortOrder ?? index,
      })),
    };

    try {
      await updateMenuItem({ itemId: item.id, payload }).unwrap();
      showSuccess(
        `${item.name} marked ${item.isAvailable ? "unavailable" : "available"}`,
      );
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  async function removeItem(item: MenuItemRecord) {
    const approved = await confirm({
      title: "Delete Menu Item",
      message: `Delete ${item.name}? This will remove the item from your menu.`,
      confirmText: "Delete Item",
      cancelText: "Keep Item",
      tone: "danger",
    });
    if (!approved) return;

    try {
      const response = await deleteMenuItem({ itemId: item.id }).unwrap();
      if (editingItem?.id === item.id) setEditingItem(null);
      showSuccess(response.message || "Menu item deleted");
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  return (
    <>
      <section className="mt-1 rounded-2xl border border-[#eadfc9] bg-[linear-gradient(125deg,#fff9ed_0%,#fff5e8_55%,#ffeccc_100%)] p-2.5 shadow-sm sm:p-3">
        <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => changeActiveMenuPanel("itemList")}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors sm:px-3 sm:py-2 sm:text-xs ${
              activeMenuPanel === "itemList"
                ? "border-[#e7bf7b] bg-[#d5963c] text-white"
                : "border-[#d6c39e] bg-[#f6ead4] text-[#6f5332] hover:bg-[#edd9b8]"
            }`}
          >
            Item List
          </button>

          <button
            type="button"
            onClick={() => changeActiveMenuPanel("category")}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors sm:px-3 sm:py-2 sm:text-xs ${
              activeMenuPanel === "category"
                ? "border-[#e7bf7b] bg-[#d5963c] text-white"
                : "border-[#d6c39e] bg-[#f6ead4] text-[#6f5332] hover:bg-[#edd9b8]"
            }`}
          >
            Category
          </button>

          <button
            type="button"
            onClick={() => changeActiveMenuPanel("subCategory")}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors sm:px-3 sm:py-2 sm:text-xs ${
              activeMenuPanel === "subCategory"
                ? "border-[#e7bf7b] bg-[#d5963c] text-white"
                : "border-[#d6c39e] bg-[#f6ead4] text-[#6f5332] hover:bg-[#edd9b8]"
            }`}
          >
            Sub Cat
          </button>

          <button
            type="button"
            onClick={() => changeActiveMenuPanel("optionGroup")}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors sm:px-3 sm:py-2 sm:text-xs ${
              activeMenuPanel === "optionGroup"
                ? "border-[#e7bf7b] bg-[#d5963c] text-white"
                : "border-[#d6c39e] bg-[#f6ead4] text-[#6f5332] hover:bg-[#edd9b8]"
            }`}
          >
            Option Group
          </button>
        </div>
      </section>

      <section className="mt-3 grid gap-3 sm:mt-4 sm:gap-4">
        <article className="hidden rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
          <div className="rounded-t-2xl bg-[linear-gradient(130deg,#e5f0ea_0%,#f8e4bb_45%,#f7c87b_100%)] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
              Menu Control
            </p>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">
              Easy Menu Setup
            </h3>
            <p className="mt-1 text-xs text-slate-700">
              Simple flow: Main Category to Sub Category (optional), then Item
              Variants and Optional Groups.
            </p>
          </div>

          <form
            onSubmit={submitCreateCategory}
            className="space-y-2 border-b border-[#eee7d8] p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Category Create & Edit
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setCategoryType("main");
                  setCategoryParentId("");
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  categoryType === "main"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                Main Category
              </button>
              <button
                type="button"
                onClick={() => setCategoryType("sub")}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  categoryType === "sub"
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                Sub Category
              </button>
            </div>
            <label
              htmlFor="menu-category-name"
              className="text-xs font-medium text-slate-700"
            >
              Category Name
            </label>
            <div className="flex gap-2">
              <input
                id="menu-category-name"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                className="h-10 flex-1 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                placeholder="e.g. Beverages"
              />
              <button
                type="submit"
                disabled={isCreatingCategory}
                className="rounded-lg border border-[#dfd2bb] bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-60"
              >
                {isCreatingCategory
                  ? "..."
                  : `Add ${categoryType === "main" ? "Main" : "Sub"}`}
              </button>
            </div>
            {categoryType === "sub" ? (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-slate-600">
                  Quick Category Pick
                </p>
                <div className="flex gap-1.5 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {quickPickMainCategories.map((category) => {
                    const selected = categoryParentId === category.id;
                    return (
                      <button
                        key={`quick-chip-${category.id}`}
                        type="button"
                        onClick={() => chooseParentCategory(category.id)}
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          selected
                            ? "border-amber-300 bg-amber-100 text-amber-800"
                            : "border-[#dfd2bb] bg-white text-slate-700 hover:bg-[#faf2e4]"
                        }`}
                      >
                        {category.name}
                      </button>
                    );
                  })}
                </div>
                <label
                  htmlFor="menu-category-parent"
                  className="text-xs font-medium text-slate-700"
                >
                  Main Category
                </label>
                <select
                  id="menu-category-parent"
                  value={categoryParentId}
                  onChange={(event) => chooseParentCategory(event.target.value)}
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
                >
                  <option value="">Select main category</option>
                  {mainCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <p className="text-[11px] text-slate-500">
              Menu API standard: category me `name`, `parentId`, `sortOrder`
              jata hai.
            </p>

            <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-[#eadfc9] bg-[#fffaf0] p-2">
              {mainCategories.length ? (
                mainCategories.map((mainCategory) => {
                  const subCategories =
                    subCategoriesByMainId.get(mainCategory.id) || [];
                  return (
                    <div
                      key={mainCategory.id}
                      className="space-y-1 rounded-md border border-[#eadfc9] bg-white p-2"
                    >
                      {editingCategoryId === mainCategory.id ? (
                        <div className="space-y-1.5">
                          <input
                            value={editingCategoryName}
                            onChange={(event) =>
                              setEditingCategoryName(event.target.value)
                            }
                            placeholder="Category name"
                            className="h-8 w-full rounded-md border border-[#ddd4c1] px-2 text-xs"
                          />
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => submitCategoryEdit(mainCategory)}
                              disabled={isUpdatingCategory}
                              className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 disabled:opacity-60"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategoryId(null);
                                setEditingCategoryName("");
                              }}
                              className="rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-800">
                              {mainCategory.name}
                            </p>
                            <p className="truncate text-[10px] text-slate-500">
                              Main Category
                            </p>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategoryId(mainCategory.id);
                                setEditingCategoryName(mainCategory.name);
                              }}
                              className="rounded-md border border-[#dfd2bb] bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCategory(mainCategory)}
                              disabled={isDeletingCategory}
                              className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                            >
                              {isDeletingCategory ? "..." : "Delete"}
                            </button>
                          </div>
                        </div>
                      )}
                      {subCategories.length ? (
                        <div className="space-y-1 pl-2">
                          {subCategories.map((subCategory) => (
                            <div
                              key={subCategory.id}
                              className="rounded-md border border-[#f0e7d8] bg-[#fffcf7] p-2"
                            >
                              {editingCategoryId === subCategory.id ? (
                                <div className="space-y-1.5">
                                  <input
                                    value={editingCategoryName}
                                    onChange={(event) =>
                                      setEditingCategoryName(event.target.value)
                                    }
                                    placeholder="Sub category name"
                                    className="h-8 w-full rounded-md border border-[#ddd4c1] px-2 text-xs"
                                  />
                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        submitCategoryEdit(subCategory)
                                      }
                                      disabled={isUpdatingCategory}
                                      className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 disabled:opacity-60"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCategoryId(null);
                                        setEditingCategoryName("");
                                      }}
                                      className="rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-slate-700">
                                      {subCategory.name}
                                    </p>
                                    <p className="truncate text-[10px] text-slate-500">
                                      Sub Category
                                    </p>
                                  </div>
                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCategoryId(subCategory.id);
                                        setEditingCategoryName(
                                          subCategory.name,
                                        );
                                      }}
                                      className="rounded-md border border-[#dfd2bb] bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeCategory(subCategory)
                                      }
                                      disabled={isDeletingCategory}
                                      className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                                    >
                                      {isDeletingCategory ? "..." : "Delete"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="px-1 py-2 text-xs text-slate-500">
                  No categories found.
                </p>
              )}
            </div>
          </form>

          <form
            onSubmit={
              editingGroupId ? submitUpdateOptionGroup : submitCreateOptionGroup
            }
            className="space-y-2 border-b border-[#eee7d8] p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Option Groups (POST/PUT/DELETE)
            </p>
            <label
              htmlFor="menu-group-name"
              className="text-xs font-medium text-slate-700"
            >
              Group Name
            </label>
            <input
              id="menu-group-name"
              value={editingGroupId ? editingGroupForm.name : groupForm.name}
              onChange={(event) =>
                editingGroupId
                  ? setEditingGroupForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  : setGroupForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
              }
              className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="e.g. Spice Level"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <label
                  htmlFor="menu-group-min"
                  className="text-xs font-medium text-slate-700"
                >
                  Min Select
                </label>
                <input
                  id="menu-group-min"
                  type="number"
                  min={0}
                  value={
                    editingGroupId
                      ? editingGroupForm.minSelect
                      : groupForm.minSelect
                  }
                  onChange={(event) =>
                    editingGroupId
                      ? setEditingGroupForm((prev) => ({
                          ...prev,
                          minSelect: event.target.value,
                        }))
                      : setGroupForm((prev) => ({
                          ...prev,
                          minSelect: event.target.value,
                        }))
                  }
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="menu-group-max"
                  className="text-xs font-medium text-slate-700"
                >
                  Max Select
                </label>
                <input
                  id="menu-group-max"
                  type="number"
                  min={0}
                  value={
                    editingGroupId
                      ? editingGroupForm.maxSelect
                      : groupForm.maxSelect
                  }
                  onChange={(event) =>
                    editingGroupId
                      ? setEditingGroupForm((prev) => ({
                          ...prev,
                          maxSelect: event.target.value,
                        }))
                      : setGroupForm((prev) => ({
                          ...prev,
                          maxSelect: event.target.value,
                        }))
                  }
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="menu-group-order"
                  className="text-xs font-medium text-slate-700"
                >
                  Sort Order
                </label>
                <input
                  id="menu-group-order"
                  type="number"
                  min={0}
                  value={
                    editingGroupId
                      ? editingGroupForm.sortOrder
                      : groupForm.sortOrder
                  }
                  onChange={(event) =>
                    editingGroupId
                      ? setEditingGroupForm((prev) => ({
                          ...prev,
                          sortOrder: event.target.value,
                        }))
                      : setGroupForm((prev) => ({
                          ...prev,
                          sortOrder: event.target.value,
                        }))
                  }
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isCreatingOptionGroup || isUpdatingOptionGroup}
                className="rounded-lg border border-[#dfd2bb] bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
              >
                {isCreatingOptionGroup || isUpdatingOptionGroup
                  ? "Saving..."
                  : editingGroupId
                    ? "Update Group (PUT)"
                    : "Create Group (POST)"}
              </button>
              {editingGroupId ? (
                <button
                  type="button"
                  onClick={cancelEditOptionGroup}
                  className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>
            <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-lg border border-[#eadfc9] bg-[#fffaf0] p-2">
              {optionGroups.length ? (
                optionGroups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center justify-between rounded-md border border-[#eadfc9] bg-white p-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {group.name}
                      </p>
                      <p className="truncate text-[10px] text-slate-500">
                        Min {group.minSelect ?? 0} / Max {group.maxSelect ?? 0}{" "}
                        - {group.options.length} options
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEditOptionGroup(group)}
                        className="rounded-md border border-[#dfd2bb] bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeOptionGroup(group)}
                        disabled={isDeletingOptionGroup}
                        className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="px-1 py-2 text-xs text-slate-500">
                  No option groups found.
                </p>
              )}
            </div>
          </form>

          <form onSubmit={submitCreateItem} className="space-y-3 p-4">
            <label
              htmlFor="menu-item-name"
              className="text-xs font-medium text-slate-700"
            >
              Item Name
            </label>
            <input
              id="menu-item-name"
              value={itemForm.name}
              onChange={(event) =>
                setItemForm((prev) => ({ ...prev, name: event.target.value }))
              }
              className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="e.g. Cold Coffee"
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="menu-item-main-category"
                  className="text-xs font-medium text-slate-700"
                >
                  Main Category
                </label>
                <select
                  id="menu-item-main-category"
                  value={itemForm.mainCategoryId}
                  onChange={(event) =>
                    changeMainCategory("create", event.target.value)
                  }
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
                >
                  <option value="">Select main category</option>
                  {mainCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="menu-item-sub-category"
                  className="text-xs font-medium text-slate-700"
                >
                  Sub Category (optional)
                </label>
                <select
                  id="menu-item-sub-category"
                  value={itemForm.subCategoryId}
                  onChange={(event) =>
                    changeSubCategory("create", event.target.value)
                  }
                  disabled={!itemForm.mainCategoryId}
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="">
                    {itemForm.mainCategoryId
                      ? "No sub category"
                      : "Select main category first"}
                  </option>
                  {itemSubCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
              Final category:{" "}
              {resolveSelectedCategoryId(itemForm)
                ? selectedCategoryLabel(resolveSelectedCategoryId(itemForm))
                : "Not selected"}
            </p>

            <VariantFields
              idPrefix="create"
              variants={itemForm.variants}
              onChange={(key, field, value) =>
                updateVariant("create", key, field, value)
              }
              onAdd={() => addVariant("create")}
              onRemove={(key) => removeVariant("create", key)}
              presets={VARIANT_NAME_PRESETS}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="menu-item-tax"
                  className="text-xs font-medium text-slate-700"
                >
                  Tax Percentage (%)
                </label>
                <input
                  id="menu-item-tax"
                  type="number"
                  min={0}
                  max={100}
                  
                  value={itemForm.taxPercentage}
                  onChange={(event) =>
                    setItemForm((prev) => ({
                      ...prev,
                      taxPercentage: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                  placeholder="5"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="menu-item-image"
                  className="text-xs font-medium text-slate-700"
                >
                  Image URL (optional)
                </label>
                <input
                  id="menu-item-image"
                  value={itemForm.image}
                  onChange={(event) =>
                    setItemForm((prev) => ({
                      ...prev,
                      image: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                  placeholder="https://..."
                />
              </div>
            </div>

            <label
              htmlFor="menu-item-description"
              className="text-xs font-medium text-slate-700"
            >
              Description (optional)
            </label>
            <textarea
              id="menu-item-description"
              value={itemForm.description}
              onChange={(event) =>
                setItemForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
              rows={3}
              className="w-full rounded-lg border border-[#ddd4c1] bg-white px-3 py-2 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="Short description"
            />

            <FulfillmentTypeField
              idPrefix="menu-item"
              value={itemForm.fulfillmentType}
              onChange={(value) =>
                setItemForm((prev) => ({ ...prev, fulfillmentType: value }))
              }
            />

            <OptionGroupFields
              groups={optionGroups}
              selected={itemForm.optionGroupIds}
              onToggle={(groupId, checked) =>
                toggleGroup("create", groupId, checked)
              }
            />

            <button
              type="submit"
              disabled={isCreatingItem}
              className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 disabled:opacity-60"
            >
              {isCreatingItem ? "Adding..." : "Add Menu Item"}
            </button>

            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-lg border border-[#ebdfc8] bg-white p-2">
                <p className="text-slate-500">Total</p>
                <p className="mt-1 text-base font-semibold">{totalItems}</p>
              </div>
              <div className="rounded-lg border border-[#ebdfc8] bg-white p-2">
                <p className="text-slate-500">Available</p>
                <p className="mt-1 text-base font-semibold">{availableItems}</p>
              </div>
              <div className="rounded-lg border border-[#ebdfc8] bg-white p-2">
                <p className="text-slate-500">Hidden</p>
                <p className="mt-1 text-base font-semibold">
                  {unavailableItems}
                </p>
              </div>
              <div className="rounded-lg border border-[#ebdfc8] bg-white p-2">
                <p className="text-slate-500">Avg Price</p>
                <p className="mt-1 text-sm font-semibold">
                  {formatMoney(avgPrice)}
                </p>
              </div>
            </div>
          </form>
        </article>

        <article className="min-w-0 rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
          <div className="border-b border-[#eee7d8] px-2.5 py-2.5 sm:px-4 sm:py-3">
            <div className="mt-2.5 rounded-xl border border-[#eadfc9] bg-[#fffaf1] p-2.5 sm:mt-3 sm:p-3">
              <div className="flex items-center gap-2">
                <div className="flex shrink-0 flex-col items-center leading-none">
                  <span className="text-lg font-bold text-slate-700">
                    {activeMenuPanel === "itemList"
                      ? filteredItems.length
                      : activeMenuPanel === "category"
                        ? filteredMainCategories.length
                        : activeMenuPanel === "subCategory"
                          ? filteredSubCategories.length
                          : filteredOptionGroups.length}
                  </span>
                  <span className="text-[10px] font-medium text-slate-700">
                    {activeMenuPanel === "itemList"
                      ? "items"
                      : activeMenuPanel === "category"
                        ? "cats"
                        : activeMenuPanel === "subCategory"
                          ? "subs"
                          : "groups"}
                  </span>
                </div>

                <input
                  id="menu-search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search..."
                  className="h-10 min-w-0 flex-1 rounded-xl border border-[#dcccaf] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                />

                <div className="flex shrink-0 items-center rounded-lg border border-[#dccfb8] bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setListViewMode("grid")}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                      listViewMode === "grid"
                        ? "bg-[#f6ead4] text-[#7a5a34]"
                        : "text-slate-600"
                    }`}
                  >
                    ?
                  </button>
                  <button
                    type="button"
                    onClick={() => setListViewMode("table")}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                      listViewMode === "table"
                        ? "bg-[#f6ead4] text-[#7a5a34]"
                        : "text-slate-600"
                    }`}
                  >
                    ?
                  </button>
                </div>
              </div>
              {activeMenuPanel === "itemList" ? (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-10 md:items-center">
                  <div className="md:col-span-7">
                    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap no-scrollbar">
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Category
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          changeMainCategoryFilter("all");
                          setAvailabilityFilter("all");
                        }}
                        className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                          mainCategoryFilter === "all"
                            ? "border-amber-300 bg-amber-100 text-amber-800"
                            : "border-[#ddcfb7] bg-white text-slate-700"
                        }`}
                      >
                        All
                      </button>
                      {mainCategories.map((category) => (
                        <button
                          key={`main-filter-chip-${category.id}`}
                          type="button"
                          onClick={() => changeMainCategoryFilter(category.id)}
                          className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                            mainCategoryFilter === category.id
                              ? "border-amber-300 bg-amber-100 text-amber-800"
                              : "border-[#ddcfb7] bg-white text-slate-700"
                          }`}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-3">
                    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap no-scrollbar">
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Availability
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAvailabilityFilter((prev) =>
                            prev === "available" ? "all" : "available",
                          )
                        }
                        className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                          availabilityFilter === "available"
                            ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                            : "border-[#ddcfb7] bg-white text-slate-700"
                        }`}
                      >
                        Available
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setAvailabilityFilter((prev) =>
                            prev === "unavailable" ? "all" : "unavailable",
                          )
                        }
                        className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                          availabilityFilter === "unavailable"
                            ? "border-slate-300 bg-slate-100 text-slate-700"
                            : "border-[#ddcfb7] bg-white text-slate-700"
                        }`}
                      >
                        Hidden
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={openAddForActivePanel}
                className="mt-4 w-full rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 shadow-sm transition-all hover:border-amber-400 hover:bg-amber-100 hover:shadow-md active:scale-[0.98]"
              >
                + Create{" "}
                {activeMenuPanel === "itemList"
                  ? "Item"
                  : activeMenuPanel === "category"
                    ? "Category"
                    : activeMenuPanel === "subCategory"
                      ? "Sub Category"
                      : "Option Group"}
              </button>
            </div>
          </div>

          {optionGroupsError ? (
            <p className="mx-2.5 mt-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 sm:mx-4 sm:mt-3">
              Option groups load issue: {getErrorMessage(optionGroupsError)}
            </p>
          ) : null}

          <div className="p-2.5 sm:p-4">
            {activeMenuPanel === "itemList" ? (
              filteredItems.length ? (
                listViewMode === "grid" ? (
                  <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                    {filteredItems.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-2xl border border-[#eadfc9] bg-[linear-gradient(160deg,#fffcf6_0%,#fff7e8_100%)] p-2.5 shadow-sm sm:p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-slate-900">
                              {item.name}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {item.categoryId
                                ? selectedCategoryLabel(item.categoryId)
                                : "Uncategorized"}
                            </p>
                          </div>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${item.isAvailable ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-slate-100 text-slate-600"}`}
                          >
                            {item.isAvailable ? "Available" : "Hidden"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-amber-700">
                          {formatMoney(getPrimaryPrice(item))}
                        </p>
                        <p className="mt-2 min-h-9 text-xs text-slate-600">
                          {item.description || "No description"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.variants.map((variant, index) => (
                            <span
                              key={`${item.id}-${variant.id}-${index}`}
                              className={`rounded-full border px-2 py-0.5 text-[10px] ${variant.isAvailable ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-300 bg-slate-100 text-slate-500"}`}
                            >
                              {variant.name}: {formatMoney(variant.price)}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="rounded-lg border border-[#dfd2bb] bg-white px-2 py-2 text-xs font-semibold text-slate-700"
                          >
                            Update
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleAvailability(item)}
                            disabled={isUpdatingItem}
                            className={`rounded-lg border px-2 py-2 text-xs font-semibold disabled:opacity-60 ${item.isAvailable ? "border-slate-300 bg-slate-100 text-slate-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                          >
                            {item.isAvailable ? "Hide" : "Show"}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(item)}
                            disabled={isDeletingItem}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60"
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="no-scrollbar w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-[#eadfc9]">
                    <table className="min-w-[720px] divide-y divide-[#efe4d3] text-left text-xs sm:min-w-full">
                      <thead className="bg-[#fff8ec]">
                        <tr className="text-slate-700">
                          <th className="px-2.5 py-2 font-semibold sm:px-3">
                            Item
                          </th>
                          <th className="px-2.5 py-2 font-semibold sm:px-3">
                            Category
                          </th>
                          <th className="px-2.5 py-2 font-semibold sm:px-3">
                            Variants
                          </th>
                          <th className="px-2.5 py-2 font-semibold sm:px-3">
                            Price
                          </th>
                          <th className="px-2.5 py-2 font-semibold sm:px-3">
                            Status
                          </th>
                          <th className="px-2.5 py-2 font-semibold text-right sm:px-3">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f1e7d9] bg-white">
                        {filteredItems.map((item) => (
                          <tr key={`item-row-${item.id}`}>
                            <td className="px-2.5 py-2 font-semibold text-slate-900 sm:px-3">
                              {item.name}
                            </td>
                            <td className="px-2.5 py-2 text-slate-700 sm:px-3">
                              {item.categoryId
                                ? selectedCategoryLabel(item.categoryId)
                                : "Uncategorized"}
                            </td>
                            <td className="px-2.5 py-2 text-slate-700 sm:px-3">
                              {item.variants.length
                                ? item.variants.map((variant, index) => (
                                    <span
                                      key={`${item.id}-table-variant-${variant.id || index}`}
                                      className="mr-1 inline-block rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800"
                                    >
                                      {variant.name}:{" "}
                                      {formatMoney(variant.price)}
                                    </span>
                                  ))
                                : `Regular: ${formatMoney(getPrimaryPrice(item))}`}
                            </td>
                            <td className="px-2.5 py-2 font-semibold text-amber-700 sm:px-3">
                              {formatMoney(getPrimaryPrice(item))}
                            </td>
                            <td className="px-2.5 py-2 text-slate-700 sm:px-3">
                              {item.isAvailable ? "Available" : "Hidden"}
                            </td>
                            <td className="px-2.5 py-2 sm:px-3">
                              <div className="flex justify-end gap-1 sm:gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEdit(item)}
                                  className="rounded-md border border-[#dfd2bb] bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                                >
                                  Update
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleAvailability(item)}
                                  disabled={isUpdatingItem}
                                  className="rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-60"
                                >
                                  {item.isAvailable ? "Hide" : "Show"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeItem(item)}
                                  disabled={isDeletingItem}
                                  className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-dashed border-[#e0d6c4] bg-[#fffcf7] px-3 py-8 text-center text-sm text-slate-600 sm:px-4 sm:py-10">
                  No menu items found. Create category and item from Menu
                  Control.
                </div>
              )
            ) : null}

            {activeMenuPanel === "category" ? (
              filteredMainCategories.length ? (
                listViewMode === "grid" ? (
                  <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                    {filteredMainCategories.map((category) => {
                      const subCount =
                        subCategoriesByMainId.get(category.id)?.length || 0;
                      const totalItemsInTree =
                        (itemCountByCategoryId.get(category.id) || 0) +
                        (subCategoriesByMainId.get(category.id) || []).reduce(
                          (sum, subCategory) =>
                            sum +
                            (itemCountByCategoryId.get(subCategory.id) || 0),
                          0,
                        );
                      return (
                        <article
                          key={`main-grid-${category.id}`}
                          className="rounded-2xl border border-[#eadfc9] bg-[linear-gradient(160deg,#fffcf6_0%,#fff7e8_100%)] p-2.5 shadow-sm sm:p-3"
                        >
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {category.name}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-600">
                            {subCount} sub categories - {totalItemsInTree} items
                          </p>
                          <div className="mt-3 flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => openCategoryEditor(category)}
                              className="rounded-md border border-[#dfd2bb] bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                            >
                              Update
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCategory(category)}
                              disabled={isDeletingCategory}
                              className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                            >
                              Delete
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="no-scrollbar w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-[#eadfc9]">
                    <table className="min-w-[620px] divide-y divide-[#efe4d3] text-left text-xs sm:min-w-full">
                      <thead className="bg-[#fff8ec]">
                        <tr className="text-slate-700">
                          <th className="px-3 py-2 font-semibold">Category</th>
                          <th className="px-3 py-2 font-semibold">Sub Count</th>
                          <th className="px-3 py-2 font-semibold">
                            Item Count
                          </th>
                          <th className="px-3 py-2 font-semibold text-right">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f1e7d9] bg-white">
                        {filteredMainCategories.map((category) => {
                          const subCount =
                            subCategoriesByMainId.get(category.id)?.length || 0;
                          const totalItemsInTree =
                            (itemCountByCategoryId.get(category.id) || 0) +
                            (
                              subCategoriesByMainId.get(category.id) || []
                            ).reduce(
                              (sum, subCategory) =>
                                sum +
                                (itemCountByCategoryId.get(subCategory.id) ||
                                  0),
                              0,
                            );
                          return (
                            <tr key={`main-table-${category.id}`}>
                              <td className="px-3 py-2 font-semibold text-slate-900">
                                {category.name}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {subCount}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {totalItemsInTree}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openCategoryEditor(category)}
                                    className="rounded-md border border-[#dfd2bb] bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                                  >
                                    Update
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeCategory(category)}
                                    disabled={isDeletingCategory}
                                    className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-dashed border-[#e0d6c4] bg-[#fffcf7] px-3 py-8 text-center text-sm text-slate-600 sm:px-4 sm:py-10">
                  No categories found.
                </div>
              )
            ) : null}

            {activeMenuPanel === "subCategory" ? (
              filteredSubCategories.length ? (
                listViewMode === "grid" ? (
                  <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                    {filteredSubCategories.map((category) => (
                      <article
                        key={`sub-grid-${category.id}`}
                        className="rounded-2xl border border-[#eadfc9] bg-[linear-gradient(160deg,#fffcf6_0%,#fff7e8_100%)] p-2.5 shadow-sm sm:p-3"
                      >
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {category.name}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-600">
                          Parent:{" "}
                          {(category.parentId &&
                            categoriesById.get(category.parentId)?.name) ||
                            "Unknown"}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Items: {itemCountByCategoryId.get(category.id) || 0}
                        </p>
                        <div className="mt-3 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => openCategoryEditor(category)}
                            className="rounded-md border border-[#dfd2bb] bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                          >
                            Update
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCategory(category)}
                            disabled={isDeletingCategory}
                            className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="no-scrollbar w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-[#eadfc9]">
                    <table className="min-w-[620px] divide-y divide-[#efe4d3] text-left text-xs sm:min-w-full">
                      <thead className="bg-[#fff8ec]">
                        <tr className="text-slate-700">
                          <th className="px-3 py-2 font-semibold">
                            Sub Category
                          </th>
                          <th className="px-3 py-2 font-semibold">
                            Main Category
                          </th>
                          <th className="px-3 py-2 font-semibold">Items</th>
                          <th className="px-3 py-2 font-semibold text-right">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f1e7d9] bg-white">
                        {filteredSubCategories.map((category) => (
                          <tr key={`sub-table-${category.id}`}>
                            <td className="px-3 py-2 font-semibold text-slate-900">
                              {category.name}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {(category.parentId &&
                                categoriesById.get(category.parentId)?.name) ||
                                "Unknown"}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {itemCountByCategoryId.get(category.id) || 0}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openCategoryEditor(category)}
                                  className="rounded-md border border-[#dfd2bb] bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                                >
                                  Update
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeCategory(category)}
                                  disabled={isDeletingCategory}
                                  className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-dashed border-[#e0d6c4] bg-[#fffcf7] px-3 py-8 text-center text-sm text-slate-600 sm:px-4 sm:py-10">
                  No sub categories found.
                </div>
              )
            ) : null}

            {activeMenuPanel === "optionGroup" ? (
              filteredOptionGroups.length ? (
                listViewMode === "grid" ? (
                  <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                    {filteredOptionGroups.map((group) => (
                      <article
                        key={`group-grid-${group.id}`}
                        className="rounded-2xl border border-[#eadfc9] bg-[linear-gradient(160deg,#fffcf6_0%,#fff7e8_100%)] p-2.5 shadow-sm sm:p-3"
                      >
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {group.name}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-600">
                          Min {group.minSelect ?? 0} / Max{" "}
                          {group.maxSelect ?? 0}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Options: {group.options.length}
                        </p>
                        <div className="mt-3 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => openOptionGroupEditor(group)}
                            className="rounded-md border border-[#dfd2bb] bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                          >
                            Update
                          </button>
                          <button
                            type="button"
                            onClick={() => removeOptionGroup(group)}
                            disabled={isDeletingOptionGroup}
                            className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="no-scrollbar w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-[#eadfc9]">
                    <table className="min-w-[620px] divide-y divide-[#efe4d3] text-left text-xs sm:min-w-full">
                      <thead className="bg-[#fff8ec]">
                        <tr className="text-slate-700">
                          <th className="px-3 py-2 font-semibold">
                            Option Group
                          </th>
                          <th className="px-3 py-2 font-semibold">Min/Max</th>
                          <th className="px-3 py-2 font-semibold">Options</th>
                          <th className="px-3 py-2 font-semibold text-right">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f1e7d9] bg-white">
                        {filteredOptionGroups.map((group) => (
                          <tr key={`group-table-${group.id}`}>
                            <td className="px-3 py-2 font-semibold text-slate-900">
                              {group.name}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {group.minSelect ?? 0} / {group.maxSelect ?? 0}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {group.options.length}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openOptionGroupEditor(group)}
                                  className="rounded-md border border-[#dfd2bb] bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                                >
                                  Update
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeOptionGroup(group)}
                                  disabled={isDeletingOptionGroup}
                                  className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-dashed border-[#e0d6c4] bg-[#fffcf7] px-3 py-8 text-center text-sm text-slate-600 sm:px-4 sm:py-10">
                  No option groups found.
                </div>
              )
            ) : null}
          </div>
        </article>
      </section>

      {menuPreviewHref ? (
        <button
          type="button"
          onClick={() => setIsMenuPreviewOpen(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-[#e2cfab] bg-[#c08544] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-amber-800/20 transition-colors hover:bg-[#a86f37] sm:right-4 sm:text-sm lg:bottom-[calc(env(safe-area-inset-bottom)+1.25rem)]"
        >
          Preview Menu
        </button>
      ) : null}

      {isMenuPreviewOpen && menuPreviewHref ? (
        <div className="fixed inset-0 z-40 p-2 sm:p-4">
          <button
            type="button"
            aria-label="Close menu preview"
            className="absolute inset-0 bg-slate-900/45"
            onClick={() => setIsMenuPreviewOpen(false)}
          />
          <div className="relative z-10 mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#eee7d8] bg-[#fff8ec] px-3 py-2.5 sm:px-4">
              <p className="text-sm font-semibold text-slate-800">
                QR Menu Preview
              </p>
              <button
                type="button"
                onClick={() => setIsMenuPreviewOpen(false)}
                className="h-8 w-8 rounded-full border border-[#e0d8c9] bg-white text-lg leading-none text-slate-700"
                aria-label="Close preview"
              >
                X
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-[#f6f4ef]">
              <iframe
                src={menuPreviewHref}
                title="Public QR Menu Preview"
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </div>
      ) : null}

      {quickMenuAction ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-6">
          <button
            type="button"
            aria-label="Close quick menu panel"
            className="absolute inset-0 bg-slate-900/35"
            onClick={closeQuickMenuAction}
          />
          <aside className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[#e6dfd1] bg-[#fffdf9] p-3 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-center justify-between sm:mb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Quick Add
                </p>
                <h4 className="text-lg font-semibold text-slate-900">
                  {quickMenuAction === "item"
                    ? "Add Menu Item"
                    : quickMenuAction === "category"
                      ? "Add Category"
                      : quickMenuAction === "subCategory"
                        ? "Add Sub Category"
                        : editingGroupId
                          ? "Update Optional Group"
                          : "Add Optional Group"}
                </h4>
              </div>
              <button
                type="button"
                onClick={closeQuickMenuAction}
                className="h-8 w-8 rounded-full border border-[#e0d8c9] bg-white text-lg leading-none text-slate-700"
                aria-label="Close popup"
              >
                X
              </button>
            </div>

            {quickMenuAction === "item" ? (
              <form
                onSubmit={editingItem ? submitEdit : submitCreateItem}
                className="space-y-3"
              >
                <label
                  htmlFor="quick-menu-item-name"
                  className="text-xs font-medium text-slate-700"
                >
                  Item Name
                </label>
                <input
                  id="quick-menu-item-name"
                  value={editingItem ? editForm.name : itemForm.name}
                  onChange={(event) =>
                    editingItem
                      ? setEditForm((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      : setItemForm((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                  }
                  className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                  placeholder="e.g. Paneer Tikka"
                />

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="quick-menu-item-main-category"
                      className="text-xs font-medium text-slate-700"
                    >
                      Main Category
                    </label>
                    <select
                      id="quick-menu-item-main-category"
                      value={
                        editingItem
                          ? editForm.mainCategoryId
                          : itemForm.mainCategoryId
                      }
                      onChange={(event) =>
                        changeMainCategory(
                          editingItem ? "edit" : "create",
                          event.target.value,
                        )
                      }
                      className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm"
                    >
                      <option value="">Select main category</option>
                      {mainCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="quick-menu-item-sub-category"
                      className="text-xs font-medium text-slate-700"
                    >
                      Sub Category
                    </label>
                    <select
                      id="quick-menu-item-sub-category"
                      value={
                        editingItem
                          ? editForm.subCategoryId
                          : itemForm.subCategoryId
                      }
                      onChange={(event) =>
                        changeSubCategory(
                          editingItem ? "edit" : "create",
                          event.target.value,
                        )
                      }
                      disabled={
                        editingItem
                          ? !editForm.mainCategoryId
                          : !itemForm.mainCategoryId
                      }
                      className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      <option value="">
                        {(
                          editingItem
                            ? editForm.mainCategoryId
                            : itemForm.mainCategoryId
                        )
                          ? "No sub category"
                          : "Select main category first"}
                      </option>
                      {(editingItem
                        ? editSubCategories
                        : itemSubCategories
                      ).map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <VariantFields
                  idPrefix="quick-create"
                  variants={editingItem ? editForm.variants : itemForm.variants}
                  onChange={(key, field, value) =>
                    updateVariant(
                      editingItem ? "edit" : "create",
                      key,
                      field,
                      value,
                    )
                  }
                  onAdd={() => addVariant(editingItem ? "edit" : "create")}
                  onRemove={(key) =>
                    removeVariant(editingItem ? "edit" : "create", key)
                  }
                  presets={VARIANT_NAME_PRESETS}
                />

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="quick-menu-item-tax"
                      className="text-xs font-medium text-slate-700"
                    >
                      Tax Percentage (%)
                    </label>
                    <input
                      id="quick-menu-item-tax"
                      type="number"
                      min={0}
                      max={100}
                      
                      value={
                        editingItem
                          ? editForm.taxPercentage
                          : itemForm.taxPercentage
                      }
                      onChange={(event) =>
                        editingItem
                          ? setEditForm((prev) => ({
                              ...prev,
                              taxPercentage: event.target.value,
                            }))
                          : setItemForm((prev) => ({
                              ...prev,
                              taxPercentage: event.target.value,
                            }))
                      }
                      className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="quick-menu-item-description"
                      className="text-xs font-medium text-slate-700"
                    >
                      Description
                    </label>
                    <input
                      id="quick-menu-item-description"
                      value={
                        editingItem
                          ? editForm.description
                          : itemForm.description
                      }
                      onChange={(event) =>
                        editingItem
                          ? setEditForm((prev) => ({
                              ...prev,
                              description: event.target.value,
                            }))
                          : setItemForm((prev) => ({
                              ...prev,
                              description: event.target.value,
                            }))
                      }
                      className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                      placeholder="Short description"
                    />
                  </div>
                </div>

                <FulfillmentTypeField
                  idPrefix="quick-menu-item"
                  value={
                    editingItem
                      ? editForm.fulfillmentType
                      : itemForm.fulfillmentType
                  }
                  onChange={(value) =>
                    editingItem
                      ? setEditForm((prev) => ({
                          ...prev,
                          fulfillmentType: value,
                        }))
                      : setItemForm((prev) => ({
                          ...prev,
                          fulfillmentType: value,
                        }))
                  }
                />

                <OptionGroupFields
                  groups={optionGroups}
                  selected={
                    editingItem
                      ? editForm.optionGroupIds
                      : itemForm.optionGroupIds
                  }
                  onToggle={(groupId, checked) =>
                    toggleGroup(
                      editingItem ? "edit" : "create",
                      groupId,
                      checked,
                    )
                  }
                />

                <button
                  type="submit"
                  disabled={editingItem ? isUpdatingItem : isCreatingItem}
                  className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 disabled:opacity-60"
                >
                  {editingItem
                    ? isUpdatingItem
                      ? "Updating..."
                      : "Update Menu Item"
                    : isCreatingItem
                      ? "Adding..."
                      : "Add Menu Item"}
                </button>
              </form>
            ) : null}

            {(quickMenuAction === "category" ||
              quickMenuAction === "subCategory") && (
              <form
                onSubmit={(event) => {
                  if (editingCategory && editingCategoryId) {
                    event.preventDefault();
                    submitCategoryEdit(editingCategory);
                    return;
                  }
                  submitCreateCategory(event);
                }}
                className="space-y-3"
              >
                <label
                  htmlFor="quick-menu-category-name"
                  className="text-xs font-medium text-slate-700"
                >
                  Category Name
                </label>
                <input
                  id="quick-menu-category-name"
                  value={editingCategoryId ? editingCategoryName : categoryName}
                  onChange={(event) =>
                    editingCategoryId
                      ? setEditingCategoryName(event.target.value)
                      : setCategoryName(event.target.value)
                  }
                  className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                  placeholder={
                    quickMenuAction === "category"
                      ? "e.g. Beverages"
                      : "e.g. Cold Drinks"
                  }
                />

                {quickMenuAction === "subCategory" ? (
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-slate-600">
                      Quick Category Pick
                    </p>
                    <div className="flex gap-1.5 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {quickPickMainCategories.map((category) => {
                        const selected = categoryParentId === category.id;
                        return (
                          <button
                            key={`quick-modal-chip-${category.id}`}
                            type="button"
                            onClick={() => chooseParentCategory(category.id)}
                            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                              selected
                                ? "border-amber-300 bg-amber-100 text-amber-800"
                                : "border-[#dfd2bb] bg-white text-slate-700 hover:bg-[#faf2e4]"
                            }`}
                          >
                            {category.name}
                          </button>
                        );
                      })}
                    </div>
                    <label
                      htmlFor="quick-menu-parent-category"
                      className="text-xs font-medium text-slate-700"
                    >
                      Main Category
                    </label>
                    <select
                      id="quick-menu-parent-category"
                      value={categoryParentId}
                      onChange={(event) =>
                        chooseParentCategory(event.target.value)
                      }
                      className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm"
                    >
                      <option value="">Select main category</option>
                      {mainCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={isCreatingCategory || isUpdatingCategory}
                  className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 disabled:opacity-60"
                >
                  {isCreatingCategory || isUpdatingCategory
                    ? "Saving..."
                    : editingCategoryId
                      ? "Update Category"
                      : quickMenuAction === "category"
                        ? "Add Main Category"
                        : "Add Sub Category"}
                </button>
              </form>
            )}

            {quickMenuAction === "optional" ? (
              <div className="space-y-3">
                <form
                  onSubmit={
                    editingGroupId
                      ? submitUpdateOptionGroup
                      : submitCreateOptionGroup
                  }
                  className="space-y-2"
                >
                  <label
                    htmlFor="quick-menu-group-name"
                    className="text-xs font-medium text-slate-700"
                  >
                    Group Name
                  </label>
                  <input
                    id="quick-menu-group-name"
                    value={
                      editingGroupId ? editingGroupForm.name : groupForm.name
                    }
                    onChange={(event) =>
                      editingGroupId
                        ? setEditingGroupForm((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }))
                        : setGroupForm((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }))
                    }
                    className="h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                    placeholder="e.g. Extra Cheese"
                  />

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="number"
                      min={0}
                      value={
                        editingGroupId
                          ? editingGroupForm.minSelect
                          : groupForm.minSelect
                      }
                      onChange={(event) =>
                        editingGroupId
                          ? setEditingGroupForm((prev) => ({
                              ...prev,
                              minSelect: event.target.value,
                            }))
                          : setGroupForm((prev) => ({
                              ...prev,
                              minSelect: event.target.value,
                            }))
                      }
                      className="h-11 rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm"
                      placeholder="Min"
                    />
                    <input
                      type="number"
                      min={0}
                      value={
                        editingGroupId
                          ? editingGroupForm.maxSelect
                          : groupForm.maxSelect
                      }
                      onChange={(event) =>
                        editingGroupId
                          ? setEditingGroupForm((prev) => ({
                              ...prev,
                              maxSelect: event.target.value,
                            }))
                          : setGroupForm((prev) => ({
                              ...prev,
                              maxSelect: event.target.value,
                            }))
                      }
                      className="h-11 rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm"
                      placeholder="Max"
                    />
                    <input
                      type="number"
                      min={0}
                      value={
                        editingGroupId
                          ? editingGroupForm.sortOrder
                          : groupForm.sortOrder
                      }
                      onChange={(event) =>
                        editingGroupId
                          ? setEditingGroupForm((prev) => ({
                              ...prev,
                              sortOrder: event.target.value,
                            }))
                          : setGroupForm((prev) => ({
                              ...prev,
                              sortOrder: event.target.value,
                            }))
                      }
                      className="h-11 rounded-xl border border-[#ddd4c1] bg-white px-3 text-sm"
                      placeholder="Order"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={isCreatingOptionGroup || isUpdatingOptionGroup}
                      className="rounded-xl bg-[#c08544] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 disabled:opacity-60"
                    >
                      {isCreatingOptionGroup || isUpdatingOptionGroup
                        ? "Saving..."
                        : editingGroupId
                          ? "Update Group"
                          : "Create Group"}
                    </button>
                  </div>
                </form>

                <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-[#eadfc9] bg-[#fffaf0] p-2">
                  {optionGroups.length ? (
                    optionGroups.map((group) => (
                      <div
                        key={group.id}
                        className="flex items-center justify-between rounded-md border border-[#eadfc9] bg-white p-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-800">
                            {group.name}
                          </p>
                          <p className="truncate text-[10px] text-slate-500">
                            Min {group.minSelect ?? 0} / Max{" "}
                            {group.maxSelect ?? 0}
                          </p>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEditOptionGroup(group)}
                            className="rounded-md border border-[#dfd2bb] bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeOptionGroup(group)}
                            disabled={isDeletingOptionGroup}
                            className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="px-1 py-2 text-xs text-slate-500">
                      No option groups found.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}

      {editingItem && quickMenuAction !== "item" ? (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setEditingItem(null)}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-[#e6dfd1] bg-[#fffdf9] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-[#eee7d8] pb-3">
              <h4 className="text-base font-semibold">
                Edit {editingItem.name}
              </h4>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1 text-xs font-semibold"
              >
                Close
              </button>
            </div>

            <form className="space-y-3" onSubmit={submitEdit}>
              <label
                htmlFor="edit-menu-item-name"
                className="text-xs font-medium text-slate-700"
              >
                Item Name
              </label>
              <input
                id="edit-menu-item-name"
                value={editForm.name}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, name: event.target.value }))
                }
                className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label
                    htmlFor="edit-menu-item-main-category"
                    className="text-xs font-medium text-slate-700"
                  >
                    Main Category
                  </label>
                  <select
                    id="edit-menu-item-main-category"
                    value={editForm.mainCategoryId}
                    onChange={(event) =>
                      changeMainCategory("edit", event.target.value)
                    }
                    className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
                  >
                    <option value="">Select main category</option>
                    {mainCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="edit-menu-item-sub-category"
                    className="text-xs font-medium text-slate-700"
                  >
                    Sub Category (optional)
                  </label>
                  <select
                    id="edit-menu-item-sub-category"
                    value={editForm.subCategoryId}
                    onChange={(event) =>
                      changeSubCategory("edit", event.target.value)
                    }
                    disabled={!editForm.mainCategoryId}
                    className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="">
                      {editForm.mainCategoryId
                        ? "No sub category"
                        : "Select main category first"}
                    </option>
                    {editSubCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
                Final category:{" "}
                {resolveSelectedCategoryId(editForm)
                  ? selectedCategoryLabel(resolveSelectedCategoryId(editForm))
                  : "Not selected"}
              </p>

              <VariantFields
                idPrefix="edit"
                variants={editForm.variants}
                onChange={(key, field, value) =>
                  updateVariant("edit", key, field, value)
                }
                onAdd={() => addVariant("edit")}
                onRemove={(key) => removeVariant("edit", key)}
                presets={VARIANT_NAME_PRESETS}
              />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label
                    htmlFor="edit-menu-item-tax"
                    className="text-xs font-medium text-slate-700"
                  >
                    Tax Percentage (%)
                  </label>
                  <input
                    id="edit-menu-item-tax"
                    type="number"
                    min={0}
                    max={100}
                    
                    value={editForm.taxPercentage}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        taxPercentage: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="edit-menu-item-image"
                    className="text-xs font-medium text-slate-700"
                  >
                    Image URL
                  </label>
                  <input
                    id="edit-menu-item-image"
                    value={editForm.image}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        image: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                  />
                </div>
              </div>

              <label
                htmlFor="edit-menu-item-description"
                className="text-xs font-medium text-slate-700"
              >
                Description
              </label>
              <textarea
                id="edit-menu-item-description"
                value={editForm.description}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                rows={3}
                className="w-full rounded-lg border border-[#ddd4c1] bg-white px-3 py-2 text-sm outline-none ring-amber-200 focus:ring-2"
              />

              <OptionGroupFields
                groups={optionGroups}
                selected={editForm.optionGroupIds}
                onToggle={(groupId, checked) =>
                  toggleGroup("edit", groupId, checked)
                }
              />
              </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}

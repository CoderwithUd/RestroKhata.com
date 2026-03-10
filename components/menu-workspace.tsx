"use client";

import { FormEvent, useMemo, useState } from "react";
import { getErrorMessage } from "@/lib/error";
import {
  useCreateMenuOptionGroupMutation,
  useCreateMenuCategoryMutation,
  useCreateMenuItemMutation,
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

type Props = { tenantName?: string };

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
};

type OptionGroupForm = {
  name: string;
  minSelect: string;
  maxSelect: string;
  sortOrder: string;
};

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

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

function flattenCategories(categories: MenuCategoryRecord[]): MenuCategoryRecord[] {
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
    if (!variant.price.trim() || toNumber(variant.price, -1) < 0) return `Variant ${i + 1} price is invalid`;
  }

  const invalidGroup = form.optionGroupIds.find((id) => !OBJECT_ID_REGEX.test(id));
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
  };
}

function toUpdatePayload(item: MenuItemRecord, form: ItemForm): UpdateMenuItemPayload {
  return {
    categoryId: resolveSelectedCategoryId(form),
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    image: form.image.trim() || undefined,
    taxPercentage: Math.min(100, Math.max(0, toNumber(form.taxPercentage, item.taxPercentage ?? 0))),
    sortOrder: item.sortOrder ?? 0,
    optionGroupIds: form.optionGroupIds,
    variants: toVariantsPayload(form.variants),
  };
}

function toOptionGroupPayload(form: OptionGroupForm) {
  const minSelect = Math.max(0, Math.floor(toNumber(form.minSelect, 0)));
  const maxSelect = Math.max(minSelect, Math.floor(toNumber(form.maxSelect, minSelect)));
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
}: {
  idPrefix: string;
  variants: VariantForm[];
  onChange: (key: string, field: keyof Omit<VariantForm, "key">, value: string | boolean) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Variants</p>
        <button type="button" onClick={onAdd} className="rounded-lg border border-[#dfd2bb] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">
          + Add Variant
        </button>
      </div>

      {variants.map((variant, index) => (
        <div key={variant.key} className="rounded-xl border border-[#eadfc9] bg-[#fffaf0] p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">Variant {index + 1}</p>
            {variants.length > 1 ? (
              <button type="button" onClick={() => onRemove(variant.key)} className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">
                Remove
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${idPrefix}-variant-name-${variant.key}`} className="text-xs font-medium text-slate-700">Variant Name</label>
              <input
                id={`${idPrefix}-variant-name-${variant.key}`}
                value={variant.name}
                onChange={(event) => onChange(variant.key, "name", event.target.value)}
                className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                placeholder="Small / Large"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${idPrefix}-variant-price-${variant.key}`} className="text-xs font-medium text-slate-700">Price (INR)</label>
              <input
                id={`${idPrefix}-variant-price-${variant.key}`}
                type="number"
                min={0}
                step="0.01"
                value={variant.price}
                onChange={(event) => onChange(variant.key, "price", event.target.value)}
                className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
                placeholder="120"
              />
            </div>
          </div>
          <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={variant.isAvailable} onChange={(event) => onChange(variant.key, "isAvailable", event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-amber-500" />
            Variant available for order
          </label>
        </div>
      ))}
    </div>
  );
}

function OptionGroupFields({ groups, selected, onToggle }: { groups: MenuOptionGroupRecord[]; selected: string[]; onToggle: (groupId: string, checked: boolean) => void }) {
  const selectedNames = groups.filter((group) => selected.includes(group.id)).map((group) => group.name);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Option Groups (optional)</p>
      {groups.length ? (
        <div className="grid gap-2">
          {groups.map((group) => (
            <label key={group.id} className="rounded-lg border border-[#eadfc9] bg-[#fffaf0] p-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <span>
                  <span className="block font-semibold text-slate-800">{group.name}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {group.options.length} options - Min {group.minSelect ?? 0} / Max {group.maxSelect ?? group.options.length}
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
        <p className="rounded-lg border border-dashed border-[#e0d6c4] bg-[#fffcf7] px-3 py-2 text-xs text-slate-500">No option groups found.</p>
      )}
      {selectedNames.length ? <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">Selected groups: {selectedNames.join(", ")}</p> : null}
    </div>
  );
}

export function MenuWorkspace({ tenantName }: Props) {
  const { data: categoriesPayload } = useGetMenuCategoriesQuery({ flat: true });
  const { data: optionGroupsPayload, error: optionGroupsError } = useGetMenuOptionGroupsQuery();
  const { data: itemsPayload, isLoading, isFetching, refetch } = useGetMenuItemsQuery({ page: 1, limit: 100 });
  const [createCategory, { isLoading: isCreatingCategory }] = useCreateMenuCategoryMutation();
  const [updateCategory, { isLoading: isUpdatingCategory }] = useUpdateMenuCategoryMutation();
  const [createOptionGroup, { isLoading: isCreatingOptionGroup }] = useCreateMenuOptionGroupMutation();
  const [updateOptionGroup, { isLoading: isUpdatingOptionGroup }] = useUpdateMenuOptionGroupMutation();
  const [deleteOptionGroup, { isLoading: isDeletingOptionGroup }] = useDeleteMenuOptionGroupMutation();
  const [createMenuItem, { isLoading: isCreatingItem }] = useCreateMenuItemMutation();
  const [updateMenuItem, { isLoading: isUpdatingItem }] = useUpdateMenuItemMutation();
  const [deleteMenuItem, { isLoading: isDeletingItem }] = useDeleteMenuItemMutation();

  const [itemForm, setItemForm] = useState<ItemForm>(() => createEmptyForm());
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState<"main" | "sub">("main");
  const [categoryParentId, setCategoryParentId] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [groupForm, setGroupForm] = useState<OptionGroupForm>(() => createEmptyOptionGroupForm());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupForm, setEditingGroupForm] = useState<OptionGroupForm>(() => createEmptyOptionGroupForm());
  const [editingItem, setEditingItem] = useState<MenuItemRecord | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(() => createEmptyForm());
  const [searchText, setSearchText] = useState("");
  const [mainCategoryFilter, setMainCategoryFilter] = useState("all");
  const [subCategoryFilter, setSubCategoryFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "available" | "unavailable">("all");
  const [groupUsageFilter, setGroupUsageFilter] = useState<"all" | "withGroups" | "withoutGroups">("all");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const categories = useMemo(() => flattenCategories(categoriesPayload?.items || []).sort((a, b) => a.name.localeCompare(b.name)), [categoriesPayload?.items]);
  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const mainCategories = useMemo(
    () =>
      categories
        .filter((category) => !category.parentId || !categoriesById.has(category.parentId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories, categoriesById],
  );
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

  const itemSubCategories = useMemo(
    () => (itemForm.mainCategoryId ? subCategoriesByMainId.get(itemForm.mainCategoryId) || [] : []),
    [itemForm.mainCategoryId, subCategoriesByMainId],
  );
  const editSubCategories = useMemo(
    () => (editForm.mainCategoryId ? subCategoriesByMainId.get(editForm.mainCategoryId) || [] : []),
    [editForm.mainCategoryId, subCategoriesByMainId],
  );
  const optionGroups = useMemo(() => (optionGroupsPayload?.items || []).slice().sort((a, b) => a.name.localeCompare(b.name)), [optionGroupsPayload?.items]);
  const items = useMemo(() => (itemsPayload?.items || []).slice().sort((a, b) => a.name.localeCompare(b.name)), [itemsPayload?.items]);

  const formatCategoryLabel = (category: MenuCategoryRecord): string => {
    if (!category.parentId) return category.name;
    const parent = categoriesById.get(category.parentId);
    return parent ? `${parent.name} > ${category.name}` : category.name;
  };
  const selectedCategoryLabel = (categoryId: string): string => {
    const category = categoriesById.get(categoryId);
    return category ? formatCategoryLabel(category) : categoryId;
  };
  const filterSubCategories = useMemo(
    () => (mainCategoryFilter !== "all" ? subCategoriesByMainId.get(mainCategoryFilter) || [] : []),
    [mainCategoryFilter, subCategoriesByMainId],
  );

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return items.filter((item) => {
      const category = item.categoryId ? categoriesById.get(item.categoryId) : null;
      const itemMainCategoryId = !item.categoryId
        ? ""
        : !category
          ? item.categoryId
          : category.parentId && categoriesById.has(category.parentId)
            ? category.parentId
            : category.id;

      if (mainCategoryFilter !== "all" && itemMainCategoryId !== mainCategoryFilter) return false;
      if (subCategoryFilter !== "all" && item.categoryId !== subCategoryFilter) return false;
      if (availabilityFilter === "available" && !item.isAvailable) return false;
      if (availabilityFilter === "unavailable" && item.isAvailable) return false;
      if (groupUsageFilter === "withGroups" && !(item.optionGroupIds?.length || 0)) return false;
      if (groupUsageFilter === "withoutGroups" && (item.optionGroupIds?.length || 0)) return false;
      if (!q) return true;
      const variantsText = item.variants.map((variant) => variant.name).join(" ");
      return `${item.name} ${item.categoryName || ""} ${item.description || ""} ${variantsText}`.toLowerCase().includes(q);
    });
  }, [availabilityFilter, categoriesById, groupUsageFilter, items, mainCategoryFilter, searchText, subCategoryFilter]);

  const totalItems = items.length;
  const availableItems = items.filter((item) => item.isAvailable).length;
  const unavailableItems = totalItems - availableItems;
  const avgPrice = totalItems ? items.reduce((sum, item) => sum + getPrimaryPrice(item), 0) / totalItems : 0;

  function updateVariant(mode: "create" | "edit", key: string, field: keyof Omit<VariantForm, "key">, value: string | boolean) {
    const updateList = (list: VariantForm[]) => list.map((variant) => (variant.key === key ? { ...variant, [field]: value } : variant));
    if (mode === "create") setItemForm((prev) => ({ ...prev, variants: updateList(prev.variants) }));
    if (mode === "edit") setEditForm((prev) => ({ ...prev, variants: updateList(prev.variants) }));
  }

  function addVariant(mode: "create" | "edit") {
    if (mode === "create") setItemForm((prev) => ({ ...prev, variants: [...prev.variants, createVariant(prev.variants.length)] }));
    if (mode === "edit") setEditForm((prev) => ({ ...prev, variants: [...prev.variants, createVariant(prev.variants.length)] }));
  }

  function removeVariant(mode: "create" | "edit", key: string) {
    const removeFrom = (list: VariantForm[]) => (list.length > 1 ? list.filter((variant) => variant.key !== key) : list);
    if (mode === "create") setItemForm((prev) => ({ ...prev, variants: removeFrom(prev.variants) }));
    if (mode === "edit") setEditForm((prev) => ({ ...prev, variants: removeFrom(prev.variants) }));
  }

  function toggleGroup(mode: "create" | "edit", groupId: string, checked: boolean) {
    const update = (list: string[]) => (checked ? Array.from(new Set([...list, groupId])) : list.filter((id) => id !== groupId));
    if (mode === "create") setItemForm((prev) => ({ ...prev, optionGroupIds: update(prev.optionGroupIds) }));
    if (mode === "edit") setEditForm((prev) => ({ ...prev, optionGroupIds: update(prev.optionGroupIds) }));
  }

  function changeMainCategory(mode: "create" | "edit", mainCategoryId: string) {
    const update = (prev: ItemForm): ItemForm => {
      const validSubIds = new Set((subCategoriesByMainId.get(mainCategoryId) || []).map((category) => category.id));
      return {
        ...prev,
        mainCategoryId,
        subCategoryId: validSubIds.has(prev.subCategoryId) ? prev.subCategoryId : "",
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
    if (mainCategoryId === "all") {
      setSubCategoryFilter("all");
      return;
    }
    const validSubIds = new Set((subCategoriesByMainId.get(mainCategoryId) || []).map((category) => category.id));
    setSubCategoryFilter((prev) => (prev !== "all" && !validSubIds.has(prev) ? "all" : prev));
  }

  async function submitCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");
    if (!categoryName.trim()) return setError("Category name is required");
    if (categoryType === "sub" && !categoryParentId) return setError("Sub category ke liye main category select karo");

    try {
      const parentId = categoryType === "sub" ? categoryParentId : null;
      const siblingCount = parentId ? (subCategoriesByMainId.get(parentId)?.length || 0) : mainCategories.length;
      const response = await createCategory({
        name: categoryName.trim(),
        parentId,
        sortOrder: siblingCount + 1,
      }).unwrap();
      setCategoryName("");
      if (categoryType === "sub") {
        setCategoryParentId("");
      }
      setNotice(response.message || "Category created");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function submitCategoryEdit(category: MenuCategoryRecord) {
    setNotice("");
    setError("");
    if (!editingCategoryName.trim()) return setError("Category name is required");

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
      setNotice(response.message || "Category updated");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function submitCreateOptionGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    const validationError = validateOptionGroupForm(groupForm);
    if (validationError) return setError(validationError);

    try {
      const response = await createOptionGroup(toOptionGroupPayload(groupForm)).unwrap();
      setGroupForm(createEmptyOptionGroupForm());
      setNotice(response.message || "Option group created");
    } catch (e) {
      setError(getErrorMessage(e));
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
    setNotice("");
    setError("");

    const validationError = validateOptionGroupForm(editingGroupForm);
    if (validationError) return setError(validationError);

    try {
      const response = await updateOptionGroup({
        groupId: editingGroupId,
        payload: toOptionGroupPayload(editingGroupForm),
      }).unwrap();
      cancelEditOptionGroup();
      setNotice(response.message || "Option group updated");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function removeOptionGroup(group: MenuOptionGroupRecord) {
    if (!window.confirm(`Delete option group "${group.name}"?`)) return;
    setNotice("");
    setError("");

    try {
      const response = await deleteOptionGroup({ groupId: group.id }).unwrap();
      if (editingGroupId === group.id) cancelEditOptionGroup();
      setNotice(response.message || "Option group deleted");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function submitCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    const validationError = validateForm(itemForm);
    if (validationError) return setError(validationError);

    try {
      const response = await createMenuItem(toCreatePayload(itemForm)).unwrap();
      setItemForm(createEmptyForm());
      setNotice(response.message || "Menu item created");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  function openEdit(item: MenuItemRecord) {
    const categorySelection = resolveItemCategorySelection(item.categoryId, categoriesById);
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
    });
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem) return;

    setNotice("");
    setError("");

    const validationError = validateForm(editForm);
    if (validationError) return setError(validationError);

    try {
      const response = await updateMenuItem({ itemId: editingItem.id, payload: toUpdatePayload(editingItem, editForm) }).unwrap();
      setEditingItem(null);
      setNotice(response.message || "Menu item updated");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function toggleAvailability(item: MenuItemRecord) {
    if (!item.categoryId) return setError("Category missing for this item. Edit item once.");

    setNotice("");
    setError("");

    const payload: UpdateMenuItemPayload = {
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      image: item.image,
      taxPercentage: item.taxPercentage ?? 0,
      sortOrder: item.sortOrder ?? 0,
      optionGroupIds: item.optionGroupIds || [],
      variants: (item.variants.length ? item.variants : [{ id: "temp", name: "Regular", price: item.price, isAvailable: item.isAvailable, raw: {} }]).map((variant, index) => ({
        name: variant.name,
        price: variant.price,
        isAvailable: !item.isAvailable,
        sortOrder: variant.sortOrder ?? index,
      })),
    };

    try {
      await updateMenuItem({ itemId: item.id, payload }).unwrap();
      setNotice(`${item.name} marked ${item.isAvailable ? "unavailable" : "available"}`);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function removeItem(item: MenuItemRecord) {
    if (!window.confirm(`Delete ${item.name}?`)) return;

    setNotice("");
    setError("");

    try {
      const response = await deleteMenuItem({ itemId: item.id }).unwrap();
      if (editingItem?.id === item.id) setEditingItem(null);
      setNotice(response.message || "Menu item deleted");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <>
      <section className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_1.95fr]">
        <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
          <div className="rounded-t-2xl bg-[linear-gradient(130deg,#e5f0ea_0%,#f8e4bb_45%,#f7c87b_100%)] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Menu Control</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">Easy Menu Setup</h3>
            <p className="mt-1 text-xs text-slate-700">Simple flow: Main Category to Sub Category (optional), then Item Variants and Optional Groups.</p>
          </div>

          <form onSubmit={submitCreateCategory} className="space-y-2 border-b border-[#eee7d8] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category Create & Edit</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setCategoryType("main");
                  setCategoryParentId("");
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  categoryType === "main" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                Main Category
              </button>
              <button
                type="button"
                onClick={() => setCategoryType("sub")}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  categoryType === "sub" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                Sub Category
              </button>
            </div>
            <label htmlFor="menu-category-name" className="text-xs font-medium text-slate-700">Category Name</label>
            <div className="flex gap-2">
              <input id="menu-category-name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} className="h-10 flex-1 rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2" placeholder="e.g. Beverages" />
              <button type="submit" disabled={isCreatingCategory} className="rounded-lg border border-[#dfd2bb] bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-60">{isCreatingCategory ? "..." : `Add ${categoryType === "main" ? "Main" : "Sub"}`}</button>
            </div>
            {categoryType === "sub" ? (
              <div className="space-y-1">
                <label htmlFor="menu-category-parent" className="text-xs font-medium text-slate-700">Main Category</label>
                <select
                  id="menu-category-parent"
                  value={categoryParentId}
                  onChange={(event) => setCategoryParentId(event.target.value)}
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
            <p className="text-[11px] text-slate-500">Menu API standard: category me `name`, `parentId`, `sortOrder` jata hai.</p>

            <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-[#eadfc9] bg-[#fffaf0] p-2">
              {mainCategories.length ? mainCategories.map((mainCategory) => {
                const subCategories = subCategoriesByMainId.get(mainCategory.id) || [];
                return (
                  <div key={mainCategory.id} className="space-y-1 rounded-md border border-[#eadfc9] bg-white p-2">
                    {editingCategoryId === mainCategory.id ? (
                      <div className="space-y-1.5">
                        <input value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)} placeholder="Category name" className="h-8 w-full rounded-md border border-[#ddd4c1] px-2 text-xs" />
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => submitCategoryEdit(mainCategory)} disabled={isUpdatingCategory} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 disabled:opacity-60">Save</button>
                          <button type="button" onClick={() => { setEditingCategoryId(null); setEditingCategoryName(""); }} className="rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-800">{mainCategory.name}</p>
                          <p className="truncate text-[10px] text-slate-500">Main Category</p>
                        </div>
                        <button type="button" onClick={() => { setEditingCategoryId(mainCategory.id); setEditingCategoryName(mainCategory.name); }} className="rounded-md border border-[#dfd2bb] bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">Edit</button>
                      </div>
                    )}
                    {subCategories.length ? (
                      <div className="space-y-1 pl-2">
                        {subCategories.map((subCategory) => (
                          <div key={subCategory.id} className="rounded-md border border-[#f0e7d8] bg-[#fffcf7] p-2">
                            {editingCategoryId === subCategory.id ? (
                              <div className="space-y-1.5">
                                <input value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)} placeholder="Sub category name" className="h-8 w-full rounded-md border border-[#ddd4c1] px-2 text-xs" />
                                <div className="flex gap-1.5">
                                  <button type="button" onClick={() => submitCategoryEdit(subCategory)} disabled={isUpdatingCategory} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 disabled:opacity-60">Save</button>
                                  <button type="button" onClick={() => { setEditingCategoryId(null); setEditingCategoryName(""); }} className="rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-slate-700">{subCategory.name}</p>
                                  <p className="truncate text-[10px] text-slate-500">Sub Category</p>
                                </div>
                                <button type="button" onClick={() => { setEditingCategoryId(subCategory.id); setEditingCategoryName(subCategory.name); }} className="rounded-md border border-[#dfd2bb] bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">Edit</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              }) : <p className="px-1 py-2 text-xs text-slate-500">No categories found.</p>}
            </div>
          </form>

          <form onSubmit={editingGroupId ? submitUpdateOptionGroup : submitCreateOptionGroup} className="space-y-2 border-b border-[#eee7d8] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Option Groups (POST/PUT/DELETE)</p>
            <label htmlFor="menu-group-name" className="text-xs font-medium text-slate-700">Group Name</label>
            <input
              id="menu-group-name"
              value={editingGroupId ? editingGroupForm.name : groupForm.name}
              onChange={(event) => (editingGroupId ? setEditingGroupForm((prev) => ({ ...prev, name: event.target.value })) : setGroupForm((prev) => ({ ...prev, name: event.target.value })))}
              className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2"
              placeholder="e.g. Spice Level"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="menu-group-min" className="text-xs font-medium text-slate-700">Min Select</label>
                <input
                  id="menu-group-min"
                  type="number"
                  min={0}
                  value={editingGroupId ? editingGroupForm.minSelect : groupForm.minSelect}
                  onChange={(event) => (editingGroupId ? setEditingGroupForm((prev) => ({ ...prev, minSelect: event.target.value })) : setGroupForm((prev) => ({ ...prev, minSelect: event.target.value })))}
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="menu-group-max" className="text-xs font-medium text-slate-700">Max Select</label>
                <input
                  id="menu-group-max"
                  type="number"
                  min={0}
                  value={editingGroupId ? editingGroupForm.maxSelect : groupForm.maxSelect}
                  onChange={(event) => (editingGroupId ? setEditingGroupForm((prev) => ({ ...prev, maxSelect: event.target.value })) : setGroupForm((prev) => ({ ...prev, maxSelect: event.target.value })))}
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="menu-group-order" className="text-xs font-medium text-slate-700">Sort Order</label>
                <input
                  id="menu-group-order"
                  type="number"
                  min={0}
                  value={editingGroupId ? editingGroupForm.sortOrder : groupForm.sortOrder}
                  onChange={(event) => (editingGroupId ? setEditingGroupForm((prev) => ({ ...prev, sortOrder: event.target.value })) : setGroupForm((prev) => ({ ...prev, sortOrder: event.target.value })))}
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
                {isCreatingOptionGroup || isUpdatingOptionGroup ? "Saving..." : editingGroupId ? "Update Group (PUT)" : "Create Group (POST)"}
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
                  <div key={group.id} className="flex items-center justify-between rounded-md border border-[#eadfc9] bg-white p-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">{group.name}</p>
                      <p className="truncate text-[10px] text-slate-500">Min {group.minSelect ?? 0} / Max {group.maxSelect ?? 0} - {group.options.length} options</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => startEditOptionGroup(group)} className="rounded-md border border-[#dfd2bb] bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">Edit</button>
                      <button type="button" onClick={() => removeOptionGroup(group)} disabled={isDeletingOptionGroup} className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60">Delete</button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="px-1 py-2 text-xs text-slate-500">No option groups found.</p>
              )}
            </div>
          </form>

          <form onSubmit={submitCreateItem} className="space-y-3 p-4">
            <label htmlFor="menu-item-name" className="text-xs font-medium text-slate-700">Item Name</label>
            <input id="menu-item-name" value={itemForm.name} onChange={(event) => setItemForm((prev) => ({ ...prev, name: event.target.value }))} className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2" placeholder="e.g. Cold Coffee" />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="menu-item-main-category" className="text-xs font-medium text-slate-700">Main Category</label>
                <select
                  id="menu-item-main-category"
                  value={itemForm.mainCategoryId}
                  onChange={(event) => changeMainCategory("create", event.target.value)}
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
                <label htmlFor="menu-item-sub-category" className="text-xs font-medium text-slate-700">Sub Category (optional)</label>
                <select
                  id="menu-item-sub-category"
                  value={itemForm.subCategoryId}
                  onChange={(event) => changeSubCategory("create", event.target.value)}
                  disabled={!itemForm.mainCategoryId}
                  className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="">{itemForm.mainCategoryId ? "No sub category" : "Select main category first"}</option>
                  {itemSubCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
              Final category: {resolveSelectedCategoryId(itemForm) ? selectedCategoryLabel(resolveSelectedCategoryId(itemForm)) : "Not selected"}
            </p>

            <VariantFields
              idPrefix="create"
              variants={itemForm.variants}
              onChange={(key, field, value) => updateVariant("create", key, field, value)}
              onAdd={() => addVariant("create")}
              onRemove={(key) => removeVariant("create", key)}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="menu-item-tax" className="text-xs font-medium text-slate-700">Tax Percentage (%)</label>
                <input id="menu-item-tax" type="number" min={0} max={100} step="0.01" value={itemForm.taxPercentage} onChange={(event) => setItemForm((prev) => ({ ...prev, taxPercentage: event.target.value }))} className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2" placeholder="5" />
              </div>
              <div className="space-y-1">
                <label htmlFor="menu-item-image" className="text-xs font-medium text-slate-700">Image URL (optional)</label>
                <input id="menu-item-image" value={itemForm.image} onChange={(event) => setItemForm((prev) => ({ ...prev, image: event.target.value }))} className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2" placeholder="https://..." />
              </div>
            </div>

            <label htmlFor="menu-item-description" className="text-xs font-medium text-slate-700">Description (optional)</label>
            <textarea id="menu-item-description" value={itemForm.description} onChange={(event) => setItemForm((prev) => ({ ...prev, description: event.target.value }))} rows={3} className="w-full rounded-lg border border-[#ddd4c1] bg-white px-3 py-2 text-sm outline-none ring-amber-200 focus:ring-2" placeholder="Short description" />

            <OptionGroupFields groups={optionGroups} selected={itemForm.optionGroupIds} onToggle={(groupId, checked) => toggleGroup("create", groupId, checked)} />

            <button type="submit" disabled={isCreatingItem} className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 disabled:opacity-60">{isCreatingItem ? "Adding..." : "Add Menu Item"}</button>

            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-lg border border-[#ebdfc8] bg-white p-2"><p className="text-slate-500">Total</p><p className="mt-1 text-base font-semibold">{totalItems}</p></div>
              <div className="rounded-lg border border-[#ebdfc8] bg-white p-2"><p className="text-slate-500">Available</p><p className="mt-1 text-base font-semibold">{availableItems}</p></div>
              <div className="rounded-lg border border-[#ebdfc8] bg-white p-2"><p className="text-slate-500">Hidden</p><p className="mt-1 text-base font-semibold">{unavailableItems}</p></div>
              <div className="rounded-lg border border-[#ebdfc8] bg-white p-2"><p className="text-slate-500">Avg Price</p><p className="mt-1 text-sm font-semibold">{formatMoney(avgPrice)}</p></div>
            </div>
          </form>
        </article>

        <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
          <div className="border-b border-[#eee7d8] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{tenantName || "Restaurant"} Menu</h3>
                <p className="text-xs text-slate-500">{isLoading ? "Loading menu..." : `${filteredItems.length} items shown`}</p>
              </div>
              <button type="button" onClick={() => refetch()} className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{isFetching ? "Refreshing..." : "Refresh"}</button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <label htmlFor="menu-search" className="text-xs font-medium text-slate-700">Search Items</label>
                <input id="menu-search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search by item, variant, category" className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2" />
              </div>
              <div className="space-y-1">
                <label htmlFor="menu-filter-main-category" className="text-xs font-medium text-slate-700">Main Category</label>
                <select id="menu-filter-main-category" value={mainCategoryFilter} onChange={(event) => changeMainCategoryFilter(event.target.value)} className="h-10 min-w-[140px] rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm">
                  <option value="all">All Main Categories</option>
                  {mainCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="menu-filter-sub-category" className="text-xs font-medium text-slate-700">Sub Category</label>
                <select
                  id="menu-filter-sub-category"
                  value={subCategoryFilter}
                  onChange={(event) => setSubCategoryFilter(event.target.value)}
                  disabled={mainCategoryFilter === "all"}
                  className="h-10 min-w-[140px] rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="all">{mainCategoryFilter === "all" ? "Pick main category first" : "All sub categories"}</option>
                  {filterSubCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="menu-filter-status" className="text-xs font-medium text-slate-700">Availability</label>
                <select id="menu-filter-status" value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value as "all" | "available" | "unavailable")} className="h-10 min-w-[130px] rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm">
                  <option value="all">All Status</option>
                  <option value="available">Available</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="menu-filter-groups" className="text-xs font-medium text-slate-700">Group Mapping</label>
                <select id="menu-filter-groups" value={groupUsageFilter} onChange={(event) => setGroupUsageFilter(event.target.value as "all" | "withGroups" | "withoutGroups")} className="h-10 min-w-[130px] rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm">
                  <option value="all">All Items</option>
                  <option value="withGroups">With Groups</option>
                  <option value="withoutGroups">Without Groups</option>
                </select>
              </div>
            </div>
          </div>

          {notice ? <p className="mx-4 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p> : null}
          {error ? <p className="mx-4 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
          {optionGroupsError ? <p className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">Option groups load issue: {getErrorMessage(optionGroupsError)}</p> : null}

          <div className="p-4">
            {filteredItems.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredItems.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-[#eadfc9] bg-[linear-gradient(160deg,#fffcf6_0%,#fff7e8_100%)] p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">{item.name}</p>
                        <p className="truncate text-xs text-slate-500">{item.categoryId ? selectedCategoryLabel(item.categoryId) : "Uncategorized"}</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${item.isAvailable ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-slate-100 text-slate-600"}`}>
                        {item.isAvailable ? "Available" : "Hidden"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-amber-700">{formatMoney(getPrimaryPrice(item))}</p>
                    <p className="mt-2 min-h-9 text-xs text-slate-600">{item.description || "No description"}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.variants.map((variant, index) => (
                        <span key={`${item.id}-${variant.id}-${index}`} className={`rounded-full border px-2 py-0.5 text-[10px] ${variant.isAvailable ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-300 bg-slate-100 text-slate-500"}`}>
                          {variant.name}: {formatMoney(variant.price)}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button type="button" onClick={() => openEdit(item)} className="rounded-lg border border-[#dfd2bb] bg-white px-2 py-2 text-xs font-semibold text-slate-700">Edit</button>
                      <button type="button" onClick={() => toggleAvailability(item)} disabled={isUpdatingItem} className={`rounded-lg border px-2 py-2 text-xs font-semibold disabled:opacity-60 ${item.isAvailable ? "border-slate-300 bg-slate-100 text-slate-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{item.isAvailable ? "Hide" : "Show"}</button>
                      <button type="button" onClick={() => removeItem(item)} disabled={isDeletingItem} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60">Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#e0d6c4] bg-[#fffcf7] px-4 py-10 text-center text-sm text-slate-600">No menu items found. Create category and item from Menu Control.</div>
            )}
          </div>
        </article>
      </section>

      {editingItem ? (
        <div className="fixed inset-0 z-40">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setEditingItem(null)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-[#e6dfd1] bg-[#fffdf9] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-[#eee7d8] pb-3">
              <h4 className="text-base font-semibold">Edit {editingItem.name}</h4>
              <button type="button" onClick={() => setEditingItem(null)} className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1 text-xs font-semibold">Close</button>
            </div>

            <form className="space-y-3" onSubmit={submitEdit}>
              <label htmlFor="edit-menu-item-name" className="text-xs font-medium text-slate-700">Item Name</label>
              <input id="edit-menu-item-name" value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2" />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="edit-menu-item-main-category" className="text-xs font-medium text-slate-700">Main Category</label>
                  <select
                    id="edit-menu-item-main-category"
                    value={editForm.mainCategoryId}
                    onChange={(event) => changeMainCategory("edit", event.target.value)}
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
                  <label htmlFor="edit-menu-item-sub-category" className="text-xs font-medium text-slate-700">Sub Category (optional)</label>
                  <select
                    id="edit-menu-item-sub-category"
                    value={editForm.subCategoryId}
                    onChange={(event) => changeSubCategory("edit", event.target.value)}
                    disabled={!editForm.mainCategoryId}
                    className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="">{editForm.mainCategoryId ? "No sub category" : "Select main category first"}</option>
                    {editSubCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
                Final category: {resolveSelectedCategoryId(editForm) ? selectedCategoryLabel(resolveSelectedCategoryId(editForm)) : "Not selected"}
              </p>

              <VariantFields idPrefix="edit" variants={editForm.variants} onChange={(key, field, value) => updateVariant("edit", key, field, value)} onAdd={() => addVariant("edit")} onRemove={(key) => removeVariant("edit", key)} />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="edit-menu-item-tax" className="text-xs font-medium text-slate-700">Tax Percentage (%)</label>
                  <input id="edit-menu-item-tax" type="number" min={0} max={100} step="0.01" value={editForm.taxPercentage} onChange={(event) => setEditForm((prev) => ({ ...prev, taxPercentage: event.target.value }))} className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="edit-menu-item-image" className="text-xs font-medium text-slate-700">Image URL</label>
                  <input id="edit-menu-item-image" value={editForm.image} onChange={(event) => setEditForm((prev) => ({ ...prev, image: event.target.value }))} className="h-10 w-full rounded-lg border border-[#ddd4c1] bg-white px-3 text-sm outline-none ring-amber-200 focus:ring-2" />
                </div>
              </div>

              <label htmlFor="edit-menu-item-description" className="text-xs font-medium text-slate-700">Description</label>
              <textarea id="edit-menu-item-description" value={editForm.description} onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))} rows={3} className="w-full rounded-lg border border-[#ddd4c1] bg-white px-3 py-2 text-sm outline-none ring-amber-200 focus:ring-2" />

              <OptionGroupFields groups={optionGroups} selected={editForm.optionGroupIds} onToggle={(groupId, checked) => toggleGroup("edit", groupId, checked)} />

              <button type="submit" disabled={isUpdatingItem} className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{isUpdatingItem ? "Saving..." : "Save Changes"}</button>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}


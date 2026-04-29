"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/confirm-provider";
import { getErrorMessage } from "@/lib/error";
import { showError, showSuccess } from "@/lib/feedback";
import { Eye, EyeOff, Plus } from "lucide-react";
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

// ─── Types ───────────────────────────────────────────────────────────────────

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
  foodType: string;
  prepTime: string;
  tags: string;
  stock: string;
  isFeatured: boolean;
};

type OptionGroupForm = {
  name: string;
  minSelect: string;
  maxSelect: string;
  sortOrder: string;
};

type MenuPanelTab = "itemList" | "category" | "optionGroup";
type ItemModalStep = 1 | 2 | 3;

// ─── Constants ────────────────────────────────────────────────────────────────

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;
const RECENT_PARENT_CATEGORY_KEY = "restrokhata:recent-main-categories";
const MAX_RECENT = 8;
const PANEL_KEY = "restrokhata:menu-active-panel";
const LAST_VARIANTS_KEY = "restrokhata:last-item-variants";
const VARIANT_PRESETS = ["Regular", "Half", "Full", "Large"];
const FULFILLMENT_TYPES = ["KITCHEN", "BAR", "COUNTER", "DIRECT"];
const TAX_PRESETS = ["0", "5", "12", "18", "28"];

// const Icon = {
//   Close: () => (
//     <svg
//       className="w-4 h-4"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth={2}
//       viewBox="0 0 24 24"
//     >
//       <path
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         d="M6 18L18 6M6 6l12 12"
//       />
//     </svg>
//   ),
//   Plus: () => (
//     <svg
//       className="w-4 h-4"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth={2.5}
//       viewBox="0 0 24 24"
//     >
//       <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
//     </svg>
//   ),
//   Search: () => (
//     <svg
//       className="w-4 h-4"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth={2}
//       viewBox="0 0 24 24"
//     >
//       <path
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
//       />
//     </svg>
//   ),
//   Grid: () => (
//     <svg
//       className="w-4 h-4"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth={2}
//       viewBox="0 0 24 24"
//     >
//       <rect x="3" y="3" width="7" height="7" rx="1" />
//       <rect x="14" y="3" width="7" height="7" rx="1" />
//       <rect x="3" y="14" width="7" height="7" rx="1" />
//       <rect x="14" y="14" width="7" height="7" rx="1" />
//     </svg>
//   ),
//   List: () => (
//     <svg
//       className="w-4 h-4"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth={2}
//       viewBox="0 0 24 24"
//     >
//       <path
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         d="M4 6h16M4 12h16M4 18h16"
//       />
//     </svg>
//   ),
//   Edit: () => (
//     <svg
//       className="w-3.5 h-3.5"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth={2}
//       viewBox="0 0 24 24"
//     >
//       <path
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
//       />
//     </svg>
//   ),
//   Trash: () => (
//     <svg
//       className="w-3.5 h-3.5"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth={2}
//       viewBox="0 0 24 24"
//     >
//       <path
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
//       />
//     </svg>
//   ),
//   Refresh: () => (
//     <svg
//       className="w-4 h-4"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth={2}
//       viewBox="0 0 24 24"
//     >
//       <path
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
//       />
//     </svg>
//   ),
//   Phone: () => (
//     <svg
//       className="w-3 h-3"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth={2}
//       viewBox="0 0 24 24"
//     >
//       <path
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
//       />
//     </svg>
//   ),
//   Mail: () => (
//     <svg
//       className="w-3 h-3"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth={2}
//       viewBox="0 0 24 24"
//     >
//       <path
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
//       />
//     </svg>
//   ),
//   Lock: () => (
//     <svg
//       className="w-3.5 h-3.5"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth={2}
//       viewBox="0 0 24 24"
//     >
//       <path
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
//       />
//     </svg>
//   ),
//   Users: () => (
//     <svg
//       className="w-8 h-8"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth={1.5}
//       viewBox="0 0 24 24"
//     >
//       <path
//         strokeLinecap="round"
//         strokeLinejoin="round"
//         d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
//       />
//     </svg>
//   ),
//   ChevronRight: () => (
//     <svg
//       className="w-3.5 h-3.5"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth={2.5}
//       viewBox="0 0 24 24"
//     >
//       <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
//     </svg>
//   ),
// };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
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
    key: `v-${Date.now()}-${Math.random().toString(16).slice(2)}-${index}`,
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
    key: `v-${Date.now()}-${Math.random().toString(16).slice(2)}-${index}`,
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
    fulfillmentType: "KITCHEN",
    foodType: "VEG",
    prepTime: "",
    tags: "",
    stock: "",
    isFeatured: false,
  };
}

function createEmptyOptionGroupForm(): OptionGroupForm {
  return { name: "", minSelect: "0", maxSelect: "1", sortOrder: "0" };
}

function resolveSelectedCategoryId(form: ItemForm): string {
  return form.subCategoryId || form.mainCategoryId;
}

function resolveItemCategorySelection(
  categoryId: string | undefined,
  categoriesById: Map<string, MenuCategoryRecord>,
): Pick<ItemForm, "mainCategoryId" | "subCategoryId"> {
  if (!categoryId) return { mainCategoryId: "", subCategoryId: "" };
  const selected = categoriesById.get(categoryId);
  if (!selected) return { mainCategoryId: categoryId, subCategoryId: "" };
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
    return item.variants.map((v, i) => ({
      key: `existing-${v.id}-${i}`,
      name: v.name,
      price: String(v.price),
      isAvailable: v.isAvailable,
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
  if (!form.mainCategoryId) return "Main category select karo";
  if (!form.variants.length) return "At least one variant is required";
  for (let i = 0; i < form.variants.length; i++) {
    if (!form.variants[i].name.trim())
      return `Variant ${i + 1} ka naam likhein`;
    if (
      !form.variants[i].price.trim() ||
      toNumber(form.variants[i].price, -1) < 0
    )
      return `Variant ${i + 1} ki price sahi nahi hai`;
  }
  const invalidGroup = form.optionGroupIds.find(
    (id) => !OBJECT_ID_REGEX.test(id),
  );
  if (invalidGroup) return `Invalid option group id: ${invalidGroup}`;
  return null;
}

function toVariantsPayload(variants: VariantForm[]) {
  return variants.map((v, i) => ({
    name: v.name.trim() || `Variant ${i + 1}`,
    price: Math.max(0, toNumber(v.price, 0)),
    isAvailable: v.isAvailable,
    sortOrder: i,
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
    foodType: form.foodType || undefined,
    prepTime: form.prepTime ? toNumber(form.prepTime, 0) : undefined,
    tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : undefined,
    stock: form.stock ? toNumber(form.stock, 0) : undefined,
    isFeatured: form.isFeatured,
  };
}

function toUpdatePayload(
  item: MenuItemRecord,
  form: ItemForm,
): UpdateMenuItemPayload {
  const payload: UpdateMenuItemPayload = {};

  const categoryId = resolveSelectedCategoryId(form);
  if (categoryId !== item.categoryId) payload.categoryId = categoryId;

  const name = form.name.trim();
  if (name !== item.name) payload.name = name;

  const description = form.description.trim() || undefined;
  if (description !== item.description) payload.description = description;

  const image = form.image.trim() || undefined;
  if (image !== item.image) payload.image = image;

  const taxPercentage = Math.min(100, Math.max(0, toNumber(form.taxPercentage, item.taxPercentage ?? 0)));
  if (taxPercentage !== item.taxPercentage) payload.taxPercentage = taxPercentage;

  const sortedFormGroups = [...form.optionGroupIds].sort();
  const sortedItemGroups = [...(item.optionGroupIds || [])].sort();
  if (sortedFormGroups.join(",") !== sortedItemGroups.join(",")) {
    payload.optionGroupIds = form.optionGroupIds;
  }

  const mappedVariants = toVariantsPayload(form.variants);
  const oldVariants = item.variants.map((v, i) => ({
    name: v.name, price: v.price, isAvailable: v.isAvailable, sortOrder: i
  }));
  if (JSON.stringify(mappedVariants) !== JSON.stringify(oldVariants)) {
    payload.variants = mappedVariants;
  }

  if (form.fulfillmentType !== item.fulfillmentType) payload.fulfillmentType = form.fulfillmentType;

  const foodType = form.foodType || undefined;
  if (foodType !== item.foodType) payload.foodType = foodType;

  const prepTime = form.prepTime ? toNumber(form.prepTime, 0) : undefined;
  if (prepTime !== item.prepTime) payload.prepTime = prepTime;

  const formTags = form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : undefined;
  const itemTags = item.tags?.length ? item.tags : undefined;
  if (JSON.stringify(formTags) !== JSON.stringify(itemTags)) {
    payload.tags = formTags;
  }

  const stock = form.stock ? toNumber(form.stock, 0) : undefined;
  if (stock !== item.stock) payload.stock = stock;

  if (form.isFeatured !== item.isFeatured) payload.isFeatured = form.isFeatured;

  return payload;
}

function toOptionGroupPayload(form: OptionGroupForm) {
  const minSelect = Math.max(0, Math.floor(toNumber(form.minSelect, 0)));
  const maxSelect = Math.max(
    minSelect,
    Math.floor(toNumber(form.maxSelect, minSelect)),
  );
  return {
    name: form.name.trim(),
    minSelect,
    maxSelect,
    sortOrder: Math.max(0, Math.floor(toNumber(form.sortOrder, 0))),
  };
}

function validateOptionGroupForm(form: OptionGroupForm): string | null {
  if (!form.name.trim()) return "Option group name is required";
  const min = Math.floor(toNumber(form.minSelect, -1));
  const max = Math.floor(toNumber(form.maxSelect, -1));
  if (min < 0) return "Min select 0 ya zyada hona chahiye";
  if (max < 0) return "Max select 0 ya zyada hona chahiye";
  if (max < min) return "Max select, min se kam nahi ho sakta";
  return null;
}

function lsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Pill chip button */
function Chip({
  label,
  active,
  onClick,
  danger,
  className = "",
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap",
        danger
          ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
          : active
            ? "border-[#d4a30a] bg-[#fdf3e3] text-[#7a4a00]"
            : "border-[#e0d4bb] bg-white text-slate-600 hover:bg-[#faf5eb]",
        className,
      ].join(" ")}
    >
      {label}
    </button>
  );
}

/** Horizontal scrollable chip row */
function ChipScroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

/** Section label */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-2">
      {children}
    </p>
  );
}

/** Toggle switch */
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-emerald-500" : "bg-slate-200",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

/** Availability badge */
function AvailBadge({ available }: { available: boolean }) {
  return (
    <span
      className={[
        "inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold",
        available
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-slate-100 text-slate-500 border border-slate-200",
      ].join(" ")}
    >
      {available ? "Live" : "Hidden"}
    </span>
  );
}

/** Step indicator */
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-4">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={[
            "h-1.5 rounded-full transition-all",
            i + 1 === current
              ? "w-6 bg-[#d4a30a]"
              : i + 1 < current
                ? "w-3 bg-emerald-400"
                : "w-3 bg-slate-200",
          ].join(" ")}
        />
      ))}
      <span className="ml-2 text-[11px] text-slate-400 font-medium">
        Step {current} of {total}
      </span>
    </div>
  );
}

/** Field label */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
      {children}
    </label>
  );
}

/** Text input */
function TextInput({
  value,
  onChange,
  placeholder,
  id,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={[
        "h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3.5 text-sm text-slate-900",
        "outline-none transition-all focus:border-[#d4a30a] focus:ring-2 focus:ring-[#f5c842]/20",
        className,
      ].join(" ")}
    />
  );
}

/** Number input */
function NumberInput({
  value,
  onChange,
  placeholder,
  min = 0,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      min={min}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={[
        "h-11 w-full rounded-xl border border-[#ddd4c1] bg-white px-3.5 text-sm text-slate-900",
        "outline-none transition-all focus:border-[#d4a30a] focus:ring-2 focus:ring-[#f5c842]/20",
        className,
      ].join(" ")}
    />
  );
}

/** Primary button */
function PrimaryBtn({
  children,
  onClick,
  disabled,
  type = "button",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={[
        "w-full rounded-xl bg-[#d4a30a] px-4 py-3 text-sm font-bold text-white",
        "transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
        "hover:bg-[#b98a06]",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** Ghost button */
function GhostBtn({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-xl border border-[#e0d4bb] bg-white px-4 py-2.5 text-sm font-semibold text-slate-600",
        "transition-all hover:bg-[#faf5eb] active:scale-[0.98] disabled:opacity-50",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** Danger button */
function DangerBtn({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700",
        "transition-all hover:bg-rose-100 active:scale-[0.98] disabled:opacity-50",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// ─── Variant Fields ───────────────────────────────────────────────────────────

function VariantFields({
  variants,
  onChange,
  onAdd,
  onRemove,
}: {
  variants: VariantForm[];
  onChange: (
    key: string,
    field: keyof Omit<VariantForm, "key">,
    value: string | boolean,
  ) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Variants & Pricing</SectionLabel>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-full border border-[#d4a30a] bg-[#fdf9ee] px-3 py-1 text-[11px] font-bold text-[#8a5c00] hover:bg-[#fef3d0]"
        >
          + Add Variant
        </button>
      </div>
      {variants.map((variant, index) => (
        <div
          key={variant.key}
          className="rounded-2xl border border-[#ead9b8] bg-[#fffaf0] p-3"
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Variant {index + 1}
            </span>
            {variants.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(variant.key)}
                className="text-[11px] font-semibold text-rose-500 hover:text-rose-700"
              >
                Remove
              </button>
            )}
          </div>
          {/* Name presets */}
          <div className="mb-2">
            <ChipScroll>
              {VARIANT_PRESETS.map((preset) => (
                <Chip
                  key={preset}
                  label={preset}
                  active={variant.name === preset}
                  onClick={() => onChange(variant.key, "name", preset)}
                />
              ))}
            </ChipScroll>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Name</FieldLabel>
              <TextInput
                value={variant.name}
                onChange={(v) => onChange(variant.key, "name", v)}
                placeholder="e.g. Large"
              />
            </div>
            <div>
              <FieldLabel>Price (₹)</FieldLabel>
              <NumberInput
                value={variant.price}
                onChange={(v) => onChange(variant.key, "price", v)}
                placeholder="120"
              />
            </div>
          </div>
          <label className="mt-2.5 flex items-center gap-2.5 cursor-pointer">
            <Toggle
              checked={variant.isAvailable}
              onChange={(v) => onChange(variant.key, "isAvailable", v)}
            />
            <span className="text-xs font-medium text-slate-600">
              Available for order
            </span>
          </label>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MenuWorkspace({ tenantSlug }: Props) {
  const confirm = useConfirm();

  // ── Queries ──
  const { data: categoriesPayload } = useGetMenuCategoriesQuery({ flat: true });
  const { data: optionGroupsPayload, error: optionGroupsError } =
    useGetMenuOptionGroupsQuery();
  const { data: itemsPayload } = useGetMenuItemsQuery({ page: 1, limit: 100 });

  // ── Mutations ──
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

  // ── Panel / View state ──
  const [activePanel, setActivePanel] = useState<MenuPanelTab>(() => {
    const saved = lsGet(PANEL_KEY);
    if (saved === "itemList" || saved === "category" || saved === "optionGroup")
      return saved;
    return "itemList";
  });
  const [searchText, setSearchText] = useState("");
  const [mainCategoryFilter, setMainCategoryFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<
    "all" | "available" | "unavailable"
  >("all");
  const [isMenuPreviewOpen, setIsMenuPreviewOpen] = useState(false);

  // ── Item modal state ──
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [itemModalStep, setItemModalStep] = useState<ItemModalStep>(1);
  const [editingItem, setEditingItem] = useState<MenuItemRecord | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(() => createEmptyForm());

  // ── Category sheet state ──
  const [isCatSheetOpen, setIsCatSheetOpen] = useState(false);
  const [catType, setCatType] = useState<"main" | "sub">("main");
  const [catName, setCatName] = useState("");
  const [catParentId, setCatParentId] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [editingCategoryName, setEditingCategoryName] = useState("");

  // ── Option group sheet state ──
  const [isOGSheetOpen, setIsOGSheetOpen] = useState(false);
  const [groupForm, setGroupForm] = useState<OptionGroupForm>(() =>
    createEmptyOptionGroupForm(),
  );
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupForm, setEditingGroupForm] = useState<OptionGroupForm>(
    () => createEmptyOptionGroupForm(),
  );

  // ── Remembered state ──
  const [lastUsedVariants, setLastUsedVariants] = useState<
    Omit<VariantForm, "key">[]
  >(() => {
    try {
      const raw = lsGet(LAST_VARIANTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (v): v is Omit<VariantForm, "key"> =>
            !!v &&
            typeof v.name === "string" &&
            typeof v.price === "string" &&
            typeof v.isAvailable === "boolean",
        )
        .slice(0, 5);
    } catch {
      return [];
    }
  });
  const [recentParentIds, setRecentParentIds] = useState<string[]>(() => {
    try {
      const raw = lsGet(RECENT_PARENT_CATEGORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
        .slice(0, MAX_RECENT);
    } catch {
      return [];
    }
  });

  // ── Persist to localStorage ──
  useEffect(() => {
    lsSet(PANEL_KEY, activePanel);
  }, [activePanel]);
  useEffect(() => {
    lsSet(RECENT_PARENT_CATEGORY_KEY, JSON.stringify(recentParentIds));
  }, [recentParentIds]);
  useEffect(() => {
    lsSet(LAST_VARIANTS_KEY, JSON.stringify(lastUsedVariants));
  }, [lastUsedVariants]);

  // ── Derived data ──
  const categories = useMemo(
    () =>
      flattenCategories(categoriesPayload?.items || []).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [categoriesPayload?.items],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const mainCategories = useMemo(
    () =>
      categories
        .filter((c) => !c.parentId || !categoriesById.has(c.parentId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories, categoriesById],
  );
  const subCategoriesByMainId = useMemo(() => {
    const bucket = new Map<string, MenuCategoryRecord[]>();
    categories.forEach((c) => {
      if (!c.parentId || !categoriesById.has(c.parentId)) return;
      const list = bucket.get(c.parentId) || [];
      list.push(c);
      bucket.set(c.parentId, list);
    });
    bucket.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return bucket;
  }, [categories, categoriesById]);

  // Recent → front, rest alphabetically
  const quickPickMainCats = useMemo(() => {
    const byId = new Map(mainCategories.map((c) => [c.id, c]));
    const ordered: MenuCategoryRecord[] = [];
    recentParentIds.forEach((id) => {
      const found = byId.get(id);
      if (found) ordered.push(found);
    });
    mainCategories.forEach((c) => {
      if (!recentParentIds.includes(c.id)) ordered.push(c);
    });
    return ordered;
  }, [mainCategories, recentParentIds]);

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
      if (item.categoryId)
        counts.set(item.categoryId, (counts.get(item.categoryId) || 0) + 1);
    });
    return counts;
  }, [items]);

  const itemSubCategories = useMemo(
    () =>
      itemForm.mainCategoryId
        ? subCategoriesByMainId.get(itemForm.mainCategoryId) || []
        : [],
    [itemForm.mainCategoryId, subCategoriesByMainId],
  );

  const selectedCategoryLabel = (categoryId: string): string => {
    const cat = categoriesById.get(categoryId);
    if (!cat) return categoryId;
    if (!cat.parentId) return cat.name;
    const parent = categoriesById.get(cat.parentId);
    return parent ? `${parent.name} › ${cat.name}` : cat.name;
  };

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return items.filter((item) => {
      const cat = item.categoryId ? categoriesById.get(item.categoryId) : null;
      const mainId = !item.categoryId
        ? ""
        : !cat
          ? item.categoryId
          : cat.parentId && categoriesById.has(cat.parentId)
            ? cat.parentId
            : cat.id;
      if (mainCategoryFilter !== "all" && mainId !== mainCategoryFilter)
        return false;
      if (availabilityFilter === "available" && !item.isAvailable) return false;
      if (availabilityFilter === "unavailable" && item.isAvailable)
        return false;
      if (!q) return true;
      const variantsText = item.variants.map((v) => v.name).join(" ");
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
  console.log(filteredItems);

  const totalItems = items.length;
  const availableItems = items.filter((i) => i.isAvailable).length;
  const unavailableItems = totalItems - availableItems;
  const avgPrice = totalItems
    ? items.reduce((s, i) => s + getPrimaryPrice(i), 0) / totalItems
    : 0;

  // ── Item modal helpers ──
  function openCreateItem() {
    const templateVariants = lastUsedVariants.length
      ? lastUsedVariants.map((v, i) => createVariantFromTemplate(v, i))
      : [createVariant(0)];
    setItemForm((prev) => ({
      ...createEmptyForm(),
      mainCategoryId: prev.mainCategoryId,
      subCategoryId: prev.subCategoryId,
      taxPercentage: prev.taxPercentage || "5",
      optionGroupIds: prev.optionGroupIds,
      variants: templateVariants,
    }));
    setEditingItem(null);
    setItemModalStep(1);
    setIsItemModalOpen(true);
  }

  function openEditItem(item: MenuItemRecord) {
    const sel = resolveItemCategorySelection(item.categoryId, categoriesById);
    setItemForm({
      name: item.name,
      mainCategoryId: sel.mainCategoryId,
      subCategoryId: sel.subCategoryId,
      description: item.description || "",
      image: item.image || "",
      taxPercentage: String(item.taxPercentage ?? 5),
      variants: ensureVariants(item),
      optionGroupIds: item.optionGroupIds || [],
      fulfillmentType: item.fulfillmentType || "KITCHEN",
      foodType: item.foodType || "VEG",
      prepTime: item.prepTime !== undefined ? String(item.prepTime) : "",
      tags: (item.tags || []).join(", "),
      stock: item.stock !== undefined ? String(item.stock) : "",
      isFeatured: !!item.isFeatured,
    });
    setEditingItem(item);
    setItemModalStep(1);
    setIsItemModalOpen(true);
  }

  function closeItemModal() {
    setIsItemModalOpen(false);
    setEditingItem(null);
  }

  function updateVariant(
    key: string,
    field: keyof Omit<VariantForm, "key">,
    value: string | boolean,
  ) {
    setItemForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v) =>
        v.key === key ? { ...v, [field]: value } : v,
      ),
    }));
  }

  function addVariant() {
    setItemForm((prev) => ({
      ...prev,
      variants: [
        ...prev.variants,
        lastUsedVariants[prev.variants.length]
          ? createVariantFromTemplate(
              lastUsedVariants[prev.variants.length],
              prev.variants.length,
            )
          : createVariant(prev.variants.length),
      ],
    }));
  }

  function removeVariant(key: string) {
    setItemForm((prev) => ({
      ...prev,
      variants:
        prev.variants.length > 1
          ? prev.variants.filter((v) => v.key !== key)
          : prev.variants,
    }));
  }

  function changeMainCategory(id: string) {
    const validSubIds = new Set(
      (subCategoriesByMainId.get(id) || []).map((c) => c.id),
    );
    setItemForm((prev) => ({
      ...prev,
      mainCategoryId: id,
      subCategoryId: validSubIds.has(prev.subCategoryId)
        ? prev.subCategoryId
        : "",
    }));
  }

  function toggleOptionGroup(id: string, checked: boolean) {
    setItemForm((prev) => ({
      ...prev,
      optionGroupIds: checked
        ? Array.from(new Set([...prev.optionGroupIds, id]))
        : prev.optionGroupIds.filter((x) => x !== id),
    }));
  }

  async function submitItem(e: FormEvent) {
    e.preventDefault();
    const err = validateForm(itemForm);
    if (err) {
      showError(err);
      return;
    }

    try {
      if (editingItem) {
        const res = await updateMenuItem({
          itemId: editingItem.id,
          payload: toUpdatePayload(editingItem, itemForm),
        }).unwrap();
        showSuccess(res.message || "Item update ho gaya");
      } else {
        const res = await createMenuItem(toCreatePayload(itemForm)).unwrap();
        const remembered = itemForm.variants
          .filter((v) => v.name.trim())
          .map((v) => ({
            name: v.name,
            price: v.price,
            isAvailable: v.isAvailable,
          }));
        if (remembered.length) setLastUsedVariants(remembered.slice(0, 5));
        showSuccess(res.message || "Item add ho gaya");
      }
      closeItemModal();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

async function toggleAvailability(item: MenuItemRecord) {
  if (!item.categoryId) {
    showError("Category missing hai. Item ek baar edit karo.");
    return;
  }

  const variantsPayload = item.variants.length
    ? item.variants.map((v, i) => ({
        name: v.name,
        price: v.price,
        isAvailable: v.isAvailable,
        sortOrder: v.sortOrder ?? i,
      }))
    : [{
        name: "Regular",
        price: item.price,
        isAvailable: item.isAvailable,
        sortOrder: 0,
      }];

  const payload: UpdateMenuItemPayload = {
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    image: item.image,
    taxPercentage: item.taxPercentage ?? 0,
    sortOrder: item.sortOrder ?? 0,
    optionGroupIds: item.optionGroupIds || [],
    fulfillmentType: item.fulfillmentType || "KITCHEN",
    variants: variantsPayload,
    isAvailable: !item.isAvailable,
  };

  try {
    await updateMenuItem({ itemId: item.id, payload }).unwrap();
    showSuccess(`${item.name} ${item.isAvailable ? "hidden" : "live"} kar diya`);
  } catch (err) {
    showError(getErrorMessage(err));
  }
}

  async function removeItem(item: MenuItemRecord) {
    const ok = await confirm({
      title: "Item Delete Karo",
      message: `"${item.name}" hamesha ke liye delete ho jayega.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const res = await deleteMenuItem({ itemId: item.id }).unwrap();
      showSuccess(res.message || "Item delete ho gaya");
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  // ── Category helpers ──
  function openCreateCategory(type: "main" | "sub") {
    setCatType(type);
    setCatName("");
    setCatParentId("");
    setEditingCategoryId(null);
    setEditingCategoryName("");
    setIsCatSheetOpen(true);
  }

  function openEditCategory(cat: MenuCategoryRecord) {
    const isSub = !!cat.parentId && categoriesById.has(cat.parentId || "");
    setCatType(isSub ? "sub" : "main");
    setCatName(cat.name);
    setCatParentId(isSub ? cat.parentId || "" : "");
    setEditingCategoryId(cat.id);
    setEditingCategoryName(cat.name);
    setIsCatSheetOpen(true);
  }

  function chooseParentCategory(id: string) {
    setCatParentId(id);
    setRecentParentIds((prev) =>
      [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT),
    );
  }

  async function submitCategory(e: FormEvent) {
    e.preventDefault();
    const name = editingCategoryId ? editingCategoryName : catName;
    if (!name.trim()) {
      showError("Category name likhein");
      return;
    }
    if (catType === "sub" && !catParentId) {
      showError("Main category select karo");
      return;
    }

    try {
      if (editingCategoryId) {
        const cat = categoriesById.get(editingCategoryId);
        if (!cat) return;
        const res = await updateCategory({
          categoryId: editingCategoryId,
          payload: {
            name: name.trim(),
            parentId: cat.parentId ?? null,
            sortOrder: cat.sortOrder ?? 0,
          },
        }).unwrap();
        showSuccess(res.message || "Category update ho gayi");
      } else {
        const parentId = catType === "sub" ? catParentId : null;
        const siblingCount = parentId
          ? subCategoriesByMainId.get(parentId)?.length || 0
          : mainCategories.length;
        const res = await createCategory({
          name: name.trim(),
          parentId,
          sortOrder: siblingCount + 1,
        }).unwrap();
        showSuccess(res.message || "Category add ho gayi");
      }
      setIsCatSheetOpen(false);
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function removeCategory(cat: MenuCategoryRecord) {
    const subCount = subCategoriesByMainId.get(cat.id)?.length || 0;
    const itemCount = itemCountByCategoryId.get(cat.id) || 0;
    const detail = [
      subCount ? `${subCount} sub categories` : "",
      itemCount ? `${itemCount} items` : "",
    ]
      .filter(Boolean)
      .join(", ");
    const ok = await confirm({
      title: "Category Delete Karo",
      message: `"${cat.name}" delete karna chahte ho?${detail ? ` (${detail})` : ""} Backend tabhi delete karta hai jab koi child ya item nahi ho.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const res = await deleteCategory({ categoryId: cat.id }).unwrap();
      if (catParentId === cat.id) setCatParentId("");
      if (mainCategoryFilter === cat.id) setMainCategoryFilter("all");
      showSuccess(res.message || "Category delete ho gayi");
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  // ── Option group helpers ──
  function openCreateOG() {
    setGroupForm(createEmptyOptionGroupForm());
    setEditingGroupId(null);
    setEditingGroupForm(createEmptyOptionGroupForm());
    setIsOGSheetOpen(true);
  }

  function openEditOG(group: MenuOptionGroupRecord) {
    setEditingGroupId(group.id);
    setEditingGroupForm({
      name: group.name,
      minSelect: String(group.minSelect ?? 0),
      maxSelect: String(group.maxSelect ?? Math.max(1, group.options.length)),
      sortOrder: String(group.sortOrder ?? 0),
    });
    setIsOGSheetOpen(true);
  }

  async function submitOG(e: FormEvent) {
    e.preventDefault();
    const form = editingGroupId ? editingGroupForm : groupForm;
    const err = validateOptionGroupForm(form);
    if (err) {
      showError(err);
      return;
    }

    try {
      if (editingGroupId) {
        const res = await updateOptionGroup({
          groupId: editingGroupId,
          payload: toOptionGroupPayload(form),
        }).unwrap();
        showSuccess(res.message || "Option group update ho gaya");
      } else {
        const res = await createOptionGroup(
          toOptionGroupPayload(form),
        ).unwrap();
        showSuccess(res.message || "Option group add ho gaya");
      }
      setIsOGSheetOpen(false);
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  async function removeOG(group: MenuOptionGroupRecord) {
    const ok = await confirm({
      title: "Option Group Delete Karo",
      message: `"${group.name}" delete karne se linked items ka option mapping hat jayega.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const res = await deleteOptionGroup({ groupId: group.id }).unwrap();
      showSuccess(res.message || "Option group delete ho gaya");
    } catch (err) {
      showError(getErrorMessage(err));
    }
  }

  const menuPreviewHref = tenantSlug
    ? `/qr?tenantSlug=${encodeURIComponent(tenantSlug)}`
    : "";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Tab Bar ── */}
      <nav className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(["itemList", "category", "optionGroup"] as MenuPanelTab[]).map(
          (tab) => {
            const labels: Record<MenuPanelTab, string> = {
              itemList: "Menu Items",
              category: "Categories",
              optionGroup: "Option Groups",
            };
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActivePanel(tab)}
                className={[
                  "shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition-all whitespace-nowrap",
                  activePanel === tab
                    ? "border-[#d4a30a] bg-[#d4a30a] text-white shadow-sm"
                    : "border-[#e0d4bb] bg-white text-slate-500 hover:bg-[#faf5eb]",
                ].join(" ")}
              >
                {labels[tab]}
              </button>
            );
          },
        )}
      </nav>

      {/* ── Stats Row (Items panel only) ── */}
      {activePanel === "itemList" && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[
            { label: "Total", value: totalItems },
            { label: "Live", value: availableItems },
            { label: "Hidden", value: unavailableItems },
            { label: "Avg", value: formatMoney(avgPrice) },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-2xl border border-[#ead9b8] bg-[#fffaf0] px-2 py-2.5 text-center"
            >
              <p className="text-base font-bold text-slate-800 leading-none">
                {value}
              </p>
              <p className="mt-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                {label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Search + Filters ── */}
      <div className="mt-3">
        <div className="flex items-center justify-between items-center gap-2">
          <div className="flex items-center gap-2 rounded-2xl border border-[#ddd4c1] bg-white px-3.5 py-2.5 w-[80%]">
            <svg
              className="h-4 w-4 shrink-0 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={
                activePanel === "itemList"
                  ? "Search items..."
                  : activePanel === "category"
                    ? "Search categories..."
                    : "Search option groups..."
              }
              className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText("")}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
          <div>
            <button
              className="flex items-center gap-1 h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-sm shadow-amber-200/60 transition-all active:scale-95"
              onClick={() => {
                if (activePanel === "itemList") openCreateItem();
                else if (activePanel === "category") openCreateCategory("main");
                else openCreateOG();
              }}
            >
              <Plus />
              <span>
                {activePanel === "itemList"
                  ? "Menu Item"
                  : activePanel === "category"
                    ? "Category"
                    : "Option Group"}
              </span>
            </button>
          </div>
        </div>

        {activePanel === "itemList" && (
          <div className="mt-2.5 space-y-2">
            <ChipScroll>
              <Chip
                label="All"
                active={mainCategoryFilter === "all"}
                onClick={() => {
                  setMainCategoryFilter("all");
                  setAvailabilityFilter("all");
                }}
              />
              {mainCategories.map((cat) => (
                <Chip
                  key={cat.id}
                  label={cat.name}
                  active={mainCategoryFilter === cat.id}
                  onClick={() => setMainCategoryFilter(cat.id)}
                />
              ))}
              <Chip
                label="Live"
                active={availabilityFilter === "available"}
                onClick={() =>
                  setAvailabilityFilter((p) =>
                    p === "available" ? "all" : "available",
                  )
                }
              />
              <Chip
                label="Hidden"
                active={availabilityFilter === "unavailable"}
                onClick={() =>
                  setAvailabilityFilter((p) =>
                    p === "unavailable" ? "all" : "unavailable",
                  )
                }
              />
            </ChipScroll>
            {/* <ChipScroll>
              <Chip
                label="All Items"
                active={availabilityFilter === "all"}
                onClick={() => setAvailabilityFilter("all")}
              />
              <Chip
                label="Live"
                active={availabilityFilter === "available"}
                onClick={() =>
                  setAvailabilityFilter((p) =>
                    p === "available" ? "all" : "available",
                  )
                }
              />
              <Chip
                label="Hidden"
                active={availabilityFilter === "unavailable"}
                onClick={() =>
                  setAvailabilityFilter((p) =>
                    p === "unavailable" ? "all" : "unavailable",
                  )
                }
              />
            </ChipScroll> */}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="mt-3">
        {/* Items */}
        {activePanel === "itemList" &&
          (filteredItems.length ? (
            // <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filteredItems.map((item) => (
                <article
                  key={item.id}
                  className={[
                    "relative rounded-2xl border p-3.5 transition-all cursor-pointer hover:shadow-sm",
                    item.isAvailable
                      ? "border-[#ead9b8] bg-gradient-to-br from-[#fffcf6] to-[#fff7e8]"
                      : "border-slate-200 bg-slate-50 opacity-[0.65] grayscale-[0.5]",
                  ].join(" ")}
                  onClick={() => openEditItem(item)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900">
                        {item.name}
                      </p>
                      <p className="truncate text-[11px] text-slate-400 mt-0.5">
                        {item.categoryId
                          ? selectedCategoryLabel(item.categoryId)
                          : "Uncategorized"}
                      </p>
                    </div>
                    <div className="flex flex-col items-center">
                      <AvailBadge available={item.isAvailable} />
                      <button
                        type="button"
                        className="p-1 rounded-full transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleAvailability(item);
                        }}
                      >
                        <span
                          className={`text-base ${item.isAvailable ? "text-emerald-600" : "text-rose-500"}`}
                        >
                          {item.isAvailable ? <Eye /> : <EyeOff />}
                        </span>
                      </button>
                    </div>
                  </div>
                  <p className="text-base font-bold text-[#8a5c00] mb-2">
                    {formatMoney(getPrimaryPrice(item))}
                  </p>
                  {item.description && (
                    <p className="text-xs text-slate-500 mb-2 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {item.variants.map((v, i) => (
                      <span
                        key={`${item.id}-${v.id}-${i}`}
                        className={[
                          "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                          v.isAvailable
                            ? "border-[#ead9b8] bg-[#fffaf0] text-[#7a4a00]"
                            : "border-slate-200 bg-slate-100 text-slate-400 line-through",
                        ].join(" ")}
                      >
                        {v.name}: {formatMoney(v.price)}
                      </span>
                    ))}
                  </div>
                  {item.fulfillmentType && (
                    <span className="mb-3 inline-block rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                      {item.fulfillmentType}
                    </span>
                  )}
                  {/* <div className="grid grid-cols-3 gap-1.5 mt-1">
                    <GhostBtn
                      onClick={() => openEditItem(item)}
                      className="py-2 text-xs"
                    >
                      Edit
                    </GhostBtn>
                    <button
                      type="button"
                      onClick={() => toggleAvailability(item)}
                      disabled={isUpdatingItem}
                      className={[
                        "rounded-xl border px-2 py-2 text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-50",
                        item.isAvailable
                          ? "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                      ].join(" ")}
                    >
                      {item.isAvailable ? "Hide" : "Show"}
                    </button>
                    <DangerBtn
                      onClick={() => removeItem(item)}
                      disabled={isDeletingItem}
                      className="py-2 text-xs"
                    >
                      Del
                    </DangerBtn>
                  </div> */}
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#ddd4c1] bg-[#fffdf9] py-14 text-center">
              <p className="text-2xl mb-2">🍽️</p>
              <p className="text-sm font-semibold text-slate-400">
                Koi item nahi mila
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Upar + se naya item add karo
              </p>
            </div>
          ))}

        {/* Categories */}
        {activePanel === "category" &&
          (() => {
            const q = searchText.trim().toLowerCase();
            const filteredMains = mainCategories.filter(
              (c) => !q || c.name.toLowerCase().includes(q),
            );
            return filteredMains.length ? (
              <div className="space-y-2">
                {filteredMains.map((main) => {
                  const subs = subCategoriesByMainId.get(main.id) || [];
                  const totalItemsInTree =
                    (itemCountByCategoryId.get(main.id) || 0) +
                    subs.reduce(
                      (s, sub) => s + (itemCountByCategoryId.get(sub.id) || 0),
                      0,
                    );
                  return (
                    <div
                      key={main.id}
                      className="rounded-2xl border border-[#ead9b8] bg-[#fffaf0] overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-3.5 py-3 bg-gradient-to-r from-[#fffaf0] to-[#fff5e0]">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate">
                            {main.name}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {subs.length} sub-categories · {totalItemsInTree}{" "}
                            items
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => openCreateCategory("sub")}
                            className="rounded-full border border-[#d4a30a]/40 bg-white px-2.5 py-1 text-[11px] font-bold text-[#8a5c00] hover:bg-[#fdf9ee]"
                          >
                            + Sub
                          </button>
                          <GhostBtn
                            onClick={() => openEditCategory(main)}
                            className="px-2.5 py-1 text-[11px]"
                          >
                            Edit
                          </GhostBtn>
                          <DangerBtn
                            onClick={() => removeCategory(main)}
                            disabled={isDeletingCategory}
                            className="px-2.5 py-1 text-[11px]"
                          >
                            Del
                          </DangerBtn>
                        </div>
                      </div>
                      {subs.length > 0 && (
                        <div className="px-3.5 pb-3 pt-1 border-t border-[#ead9b8]/60 space-y-1.5">
                          {subs.map((sub) => (
                            <div
                              key={sub.id}
                              className="flex items-center justify-between rounded-xl border border-[#ead9b8] bg-white px-3 py-2"
                            >
                              <div>
                                <p className="text-sm font-semibold text-slate-700">
                                  {sub.name}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  {itemCountByCategoryId.get(sub.id) || 0} items
                                </p>
                              </div>
                              <div className="flex gap-1.5">
                                <GhostBtn
                                  onClick={() => openEditCategory(sub)}
                                  className="px-2.5 py-1 text-[11px]"
                                >
                                  Edit
                                </GhostBtn>
                                <DangerBtn
                                  onClick={() => removeCategory(sub)}
                                  disabled={isDeletingCategory}
                                  className="px-2.5 py-1 text-[11px]"
                                >
                                  Del
                                </DangerBtn>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#ddd4c1] bg-[#fffdf9] py-14 text-center">
                <p className="text-2xl mb-2">📂</p>
                <p className="text-sm font-semibold text-slate-400">
                  Koi category nahi mili
                </p>
              </div>
            );
          })()}

        {/* Option Groups */}
        {activePanel === "optionGroup" &&
          (() => {
            const q = searchText.trim().toLowerCase();
            const filtered = optionGroups.filter(
              (g) =>
                !q ||
                `${g.name} ${g.options.map((o) => o.name).join(" ")}`
                  .toLowerCase()
                  .includes(q),
            );
            return filtered.length ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {filtered.map((group) => (
                  <article
                    key={group.id}
                    className="rounded-2xl border border-[#ead9b8] bg-gradient-to-br from-[#fffcf6] to-[#fff7e8] p-3.5"
                  >
                    <p className="font-bold text-slate-800 truncate">
                      {group.name}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Min {group.minSelect ?? 0} / Max {group.maxSelect ?? 0} ·{" "}
                      {group.options.length} options
                    </p>
                    {group.options.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {group.options.slice(0, 4).map((opt) => (
                          <span
                            key={opt.id || opt.name}
                            className="rounded-full border border-[#ead9b8] bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                          >
                            {opt.name}
                          </span>
                        ))}
                        {group.options.length > 4 && (
                          <span className="rounded-full border border-[#ead9b8] bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                            +{group.options.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-3 flex gap-1.5">
                      <GhostBtn
                        onClick={() => openEditOG(group)}
                        className="flex-1 py-2 text-xs"
                      >
                        Edit
                      </GhostBtn>
                      <DangerBtn
                        onClick={() => removeOG(group)}
                        disabled={isDeletingOptionGroup}
                        className="flex-1 py-2 text-xs"
                      >
                        Delete
                      </DangerBtn>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#ddd4c1] bg-[#fffdf9] py-14 text-center">
                <p className="text-2xl mb-2">⚙️</p>
                <p className="text-sm font-semibold text-slate-400">
                  Koi option group nahi mila
                </p>
              </div>
            );
          })()}
      </div>

      {/* ── Preview Button ── */}
      {menuPreviewHref && (
        <button
          type="button"
          onClick={() => setIsMenuPreviewOpen(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-[#e2cfab] bg-[#c08544] px-4 py-2 text-xs font-bold text-white shadow-lg transition-colors hover:bg-[#a86f37] sm:right-4 lg:bottom-[calc(env(safe-area-inset-bottom)+1.25rem)]"
        >
          Preview Menu
        </button>
      )}

      {/* ── Menu Preview Modal ── */}
      {isMenuPreviewOpen && menuPreviewHref && (
        <div className="fixed inset-0 z-40 p-2 sm:p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-slate-900/45"
            onClick={() => setIsMenuPreviewOpen(false)}
          />
          <div className="relative z-10 mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#e6dfd1] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#eee7d8] bg-[#fff8ec] px-4 py-2.5">
              <p className="text-sm font-bold text-slate-800">
                QR Menu Preview
              </p>
              <button
                type="button"
                onClick={() => setIsMenuPreviewOpen(false)}
                className="h-8 w-8 rounded-full border border-[#e0d8c9] bg-white text-slate-700"
                aria-label="Close"
              >
                ✕
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
      )}

      {/* ── Item Modal (3-step bottom sheet) ── */}
      {/* {isItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeItemModal}
          />
          <div className="relative z-10 w-full max-w-xl max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#e6dfd1] bg-[#fffdf9] shadow-2xl">
       
            <div className="sticky top-0 z-10 bg-[#fffdf9] border-b border-[#eee7d8] px-4 pt-3 pb-3">
              <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {editingItem ? "Item Edit" : "Naya Item"}
                  </p>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingItem ? editingItem.name : "Menu Item Add Karo"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeItemModal}
                  className="h-8 w-8 rounded-full border border-[#e0d8c9] bg-white text-sm text-slate-600"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2.5">
                <StepDots current={itemModalStep} total={3} />
              </div>
            </div>

            <form onSubmit={submitItem} className="p-4 space-y-4">
           
              {itemModalStep === 1 && (
                <>
                  <div>
                    <FieldLabel>Item Name *</FieldLabel>
                    <TextInput
                      value={itemForm.name}
                      onChange={(v) => setItemForm((p) => ({ ...p, name: v }))}
                      placeholder="e.g. Paneer Tikka, Cold Coffee..."
                    />
                  </div>

                  <div>
                    <FieldLabel>Main Category *</FieldLabel>
                    <ChipScroll>
                      {mainCategories.map((cat) => (
                        <Chip
                          key={cat.id}
                          label={cat.name}
                          active={itemForm.mainCategoryId === cat.id}
                          onClick={() => changeMainCategory(cat.id)}
                        />
                      ))}
                    </ChipScroll>
                    {!mainCategories.length && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Pehle ek category banao
                      </p>
                    )}
                  </div>

                  {itemSubCategories.length > 0 && (
                    <div>
                      <FieldLabel>Sub Category (optional)</FieldLabel>
                      <ChipScroll>
                        <Chip
                          label="None"
                          active={!itemForm.subCategoryId}
                          onClick={() =>
                            setItemForm((p) => ({ ...p, subCategoryId: "" }))
                          }
                        />
                        {itemSubCategories.map((cat) => (
                          <Chip
                            key={cat.id}
                            label={cat.name}
                            active={itemForm.subCategoryId === cat.id}
                            onClick={() =>
                              setItemForm((p) => ({
                                ...p,
                                subCategoryId: cat.id,
                              }))
                            }
                          />
                        ))}
                      </ChipScroll>
                    </div>
                  )}

                  {resolveSelectedCategoryId(itemForm) && (
                    <div className="rounded-xl border border-[#c3defe] bg-[#eff6ff] px-3 py-2 text-[11px] font-semibold text-blue-700">
                      Category:{" "}
                      {selectedCategoryLabel(
                        resolveSelectedCategoryId(itemForm),
                      )}
                    </div>
                  )}

                  <div>
                    <FieldLabel>Description (optional)</FieldLabel>
                    <textarea
                      value={itemForm.description}
                      onChange={(e) =>
                        setItemForm((p) => ({
                          ...p,
                          description: e.target.value,
                        }))
                      }
                      placeholder="Short description..."
                      rows={2}
                      className="w-full rounded-xl border border-[#ddd4c1] bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-[#d4a30a] focus:ring-2 focus:ring-[#f5c842]/20 resize-none"
                    />
                  </div>

                  <div>
                    <FieldLabel>Image URL (optional)</FieldLabel>
                    <TextInput
                      value={itemForm.image}
                      onChange={(v) => setItemForm((p) => ({ ...p, image: v }))}
                      placeholder="https://..."
                    />
                  </div>

                  <PrimaryBtn onClick={() => setItemModalStep(2)}>
                    Next: Variants & Pricing →
                  </PrimaryBtn>
                </>
              )}

              {itemModalStep === 2 && (
                <>
                  <VariantFields
                    variants={itemForm.variants}
                    onChange={updateVariant}
                    onAdd={addVariant}
                    onRemove={removeVariant}
                  />

                  <div>
                    <FieldLabel>Tax %</FieldLabel>
                    <ChipScroll>
                      {TAX_PRESETS.map((pct) => (
                        <Chip
                          key={pct}
                          label={`${pct}%`}
                          active={itemForm.taxPercentage === pct}
                          onClick={() =>
                            setItemForm((p) => ({ ...p, taxPercentage: pct }))
                          }
                        />
                      ))}
                    </ChipScroll>
                  </div>

                  <div className="flex gap-2">
                    <GhostBtn
                      onClick={() => setItemModalStep(1)}
                      className="flex-1"
                    >
                      ← Back
                    </GhostBtn>
                    <PrimaryBtn
                      onClick={() => setItemModalStep(3)}
                      className="flex-[2]"
                    >
                      Next: Fulfillment & Options →
                    </PrimaryBtn>
                  </div>
                </>
              )}


              {itemModalStep === 3 && (
                <>
                  <div>
                    <FieldLabel>Fulfillment Type</FieldLabel>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {FULFILLMENT_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() =>
                            setItemForm((p) => ({
                              ...p,
                              fulfillmentType: type,
                            }))
                          }
                          className={[
                            "rounded-xl border py-2.5 text-xs font-bold transition-all",
                            itemForm.fulfillmentType === type
                              ? "border-[#d4a30a] bg-[#fdf3e3] text-[#7a4a00]"
                              : "border-[#ddd4c1] bg-white text-slate-600 hover:bg-[#faf5eb]",
                          ].join(" ")}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      Selected: {itemForm.fulfillmentType || "None"}
                    </p>
                  </div>

                  {optionGroups.length > 0 && (
                    <div>
                      <FieldLabel>Option Groups (optional)</FieldLabel>
                      <ChipScroll>
                        {optionGroups.map((g) => {
                          const selected = itemForm.optionGroupIds.includes(
                            g.id,
                          );
                          return (
                            <Chip
                              key={g.id}
                              label={`${selected ? "✓ " : ""}${g.name}`}
                              active={selected}
                              onClick={() => toggleOptionGroup(g.id, !selected)}
                            />
                          );
                        })}
                      </ChipScroll>
                      {itemForm.optionGroupIds.length > 0 && (
                        <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
                          {itemForm.optionGroupIds.length} group
                          {itemForm.optionGroupIds.length > 1 ? "s" : ""}{" "}
                          selected
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <GhostBtn
                      onClick={() => setItemModalStep(2)}
                      className="flex-1"
                    >
                      ← Back
                    </GhostBtn>
                    <button
                      type="submit"
                      disabled={editingItem ? isUpdatingItem : isCreatingItem}
                      className="flex-[2] rounded-xl bg-[#d4a30a] py-3 text-sm font-bold text-white transition-all hover:bg-[#b98a06] active:scale-[0.98] disabled:opacity-50"
                    >
                      {editingItem
                        ? isUpdatingItem
                          ? "Update ho raha hai..."
                          : "Update Item"
                        : isCreatingItem
                          ? "Add ho raha hai..."
                          : "Add to Menu"}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )} */}

      {/* ── Item Modal ── */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeItemModal}
          />
          <div className="relative z-10 w-full max-w-xl max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#e6dfd1] bg-[#fffdf9] shadow-2xl">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[#fffdf9] border-b border-[#eee7d8] px-4 pt-3 pb-3">
              <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {editingItem ? "Edit Item" : "Add New Item"}
                  </p>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingItem ? editingItem.name : "Menu Item Details"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeItemModal}
                  className="h-8 w-8 rounded-full border border-[#e0d8c9] bg-white text-sm text-slate-600"
                >
                  ✕
                </button>
              </div>
              {/* Step dots only for ADD mode */}
              {!editingItem && (
                <div className="mt-2.5">
                  <StepDots current={itemModalStep} total={3} />
                </div>
              )}
            </div>

            <form onSubmit={submitItem} className="p-4 space-y-4">
              {/* ========== ADD MODE : 3-STEP ========== */}
              {!editingItem && (
                <>
                  {itemModalStep === 1 && (
                    // ... same as your existing step 1 (Basic Info)
                    <>
                      <div>
                        <FieldLabel>Item Name *</FieldLabel>
                        <TextInput
                          value={itemForm.name}
                          onChange={(v) =>
                            setItemForm((p) => ({ ...p, name: v }))
                          }
                          placeholder="e.g. Paneer Tikka, Cold Coffee..."
                        />
                      </div>
                      <div>
                        <FieldLabel>Main Category *</FieldLabel>
                        <ChipScroll>
                          {mainCategories.map((cat) => (
                            <Chip
                              key={cat.id}
                              label={cat.name}
                              active={itemForm.mainCategoryId === cat.id}
                              onClick={() => changeMainCategory(cat.id)}
                            />
                          ))}
                        </ChipScroll>
                        {!mainCategories.length && (
                          <p className="mt-1 text-[11px] text-slate-400">
                            Pehle ek category banao
                          </p>
                        )}
                      </div>
                      {itemSubCategories.length > 0 && (
                        <div>
                          <FieldLabel>Sub Category (optional)</FieldLabel>
                          <ChipScroll>
                            <Chip
                              label="None"
                              active={!itemForm.subCategoryId}
                              onClick={() =>
                                setItemForm((p) => ({
                                  ...p,
                                  subCategoryId: "",
                                }))
                              }
                            />
                            {itemSubCategories.map((cat) => (
                              <Chip
                                key={cat.id}
                                label={cat.name}
                                active={itemForm.subCategoryId === cat.id}
                                onClick={() =>
                                  setItemForm((p) => ({
                                    ...p,
                                    subCategoryId: cat.id,
                                  }))
                                }
                              />
                            ))}
                          </ChipScroll>
                        </div>
                      )}
                      {resolveSelectedCategoryId(itemForm) && (
                        <div className="rounded-xl border border-[#c3defe] bg-[#eff6ff] px-3 py-2 text-[11px] font-semibold text-blue-700">
                          Category:{" "}
                          {selectedCategoryLabel(
                            resolveSelectedCategoryId(itemForm),
                          )}
                        </div>
                      )}
                      <div>
                        <FieldLabel>Description (optional)</FieldLabel>
                        <textarea
                          value={itemForm.description}
                          onChange={(e) =>
                            setItemForm((p) => ({
                              ...p,
                              description: e.target.value,
                            }))
                          }
                          placeholder="Short description..."
                          rows={2}
                          className="w-full rounded-xl border border-[#ddd4c1] bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-[#d4a30a] focus:ring-2 focus:ring-[#f5c842]/20 resize-none"
                        />
                      </div>
                      <div>
                        <FieldLabel>Image URL (optional)</FieldLabel>
                        <TextInput
                          value={itemForm.image}
                          onChange={(v) =>
                            setItemForm((p) => ({ ...p, image: v }))
                          }
                          placeholder="https://..."
                        />
                      </div>

                      <PrimaryBtn onClick={() => setItemModalStep(2)}>
                        Next: Variants & Pricing →
                      </PrimaryBtn>
                    </>
                  )}

                  {itemModalStep === 2 && (
                    <>
                      <VariantFields
                        variants={itemForm.variants}
                        onChange={updateVariant}
                        onAdd={addVariant}
                        onRemove={removeVariant}
                      />
                      <div>
                        <FieldLabel>Tax %</FieldLabel>
                        <ChipScroll>
                          {TAX_PRESETS.map((pct) => (
                            <Chip
                              key={pct}
                              label={`${pct}%`}
                              active={itemForm.taxPercentage === pct}
                              onClick={() =>
                                setItemForm((p) => ({
                                  ...p,
                                  taxPercentage: pct,
                                }))
                              }
                            />
                          ))}
                        </ChipScroll>
                      </div>
                      <div className="flex gap-2">
                        <GhostBtn
                          onClick={() => setItemModalStep(1)}
                          className="flex-1"
                        >
                          ← Back
                        </GhostBtn>
                        <PrimaryBtn
                          onClick={() => setItemModalStep(3)}
                          className="flex-[2]"
                        >
                          Next: Fulfillment & Options →
                        </PrimaryBtn>
                      </div>
                    </>
                  )}

                  {itemModalStep === 3 && (
                    <>
                      <div>
                        <FieldLabel>Fulfillment Type</FieldLabel>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {FULFILLMENT_TYPES.map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() =>
                                setItemForm((p) => ({
                                  ...p,
                                  fulfillmentType: type,
                                }))
                              }
                              className={[
                                "rounded-xl border py-2.5 text-xs font-bold transition-all",
                                itemForm.fulfillmentType === type
                                  ? "border-[#d4a30a] bg-[#fdf3e3] text-[#7a4a00]"
                                  : "border-[#ddd4c1] bg-white text-slate-600 hover:bg-[#faf5eb]",
                              ].join(" ")}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[11px] text-slate-400">
                          Selected: {itemForm.fulfillmentType || "None"}
                        </p>
                      </div>
                      {optionGroups.length > 0 && (
                        <div>
                          <FieldLabel>Option Groups (optional)</FieldLabel>
                          <ChipScroll>
                            {optionGroups.map((g) => {
                              const selected = itemForm.optionGroupIds.includes(
                                g.id,
                              );
                              return (
                                <Chip
                                  key={g.id}
                                  label={`${selected ? "✓ " : ""}${g.name}`}
                                  active={selected}
                                  onClick={() =>
                                    toggleOptionGroup(g.id, !selected)
                                  }
                                />
                              );
                            })}
                          </ChipScroll>
                          {itemForm.optionGroupIds.length > 0 && (
                            <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
                              {itemForm.optionGroupIds.length} group
                              {itemForm.optionGroupIds.length > 1
                                ? "s"
                                : ""}{" "}
                              selected
                            </p>
                          )}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <FieldLabel>Prep Time (mins) (optional)</FieldLabel>
                          <NumberInput value={itemForm.prepTime} onChange={(v) => setItemForm(p => ({ ...p, prepTime: v }))} placeholder="e.g. 15" />
                        </div>
                        <div>
                          <FieldLabel>Food Type</FieldLabel>
                          <ChipScroll>
                            {[
                              { id: "VEG", label: "Veg" },
                              { id: "NON_VEG", label: "Non-Veg" },
                              { id: "EGG", label: "Egg" },
                              { id: "VEGAN", label: "Vegan" },
                            ].map((ft) => (
                              <Chip
                                key={ft.id}
                                label={ft.label}
                                active={itemForm.foodType === ft.id}
                                onClick={() => setItemForm((p) => ({ ...p, foodType: ft.id }))}
                              />
                            ))}
                          </ChipScroll>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <FieldLabel>Stock (optional)</FieldLabel>
                          <NumberInput value={itemForm.stock} onChange={(v) => setItemForm(p => ({ ...p, stock: v }))} placeholder="Empty = ∞" />
                        </div>
                        <div>
                          <FieldLabel>Tags (optional)</FieldLabel>
                          <TextInput value={itemForm.tags} onChange={(v) => setItemForm(p => ({ ...p, tags: v }))} placeholder="e.g. spicy, best seller" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-[#ddd4c1] bg-white px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Featured Item</p>
                          <p className="text-[11px] text-slate-500">Highlight on public menu</p>
                        </div>
                        <Toggle checked={itemForm.isFeatured} onChange={(v) => setItemForm(p => ({ ...p, isFeatured: v }))} />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <GhostBtn
                          onClick={() => setItemModalStep(2)}
                          className="flex-1"
                        >
                          ← Back
                        </GhostBtn>
                        <button
                          type="submit"
                          disabled={isCreatingItem}
                          className="flex-[2] rounded-xl bg-[#d4a30a] py-3 text-sm font-bold text-white transition-all hover:bg-[#b98a06] active:scale-[0.98] disabled:opacity-50"
                        >
                          {isCreatingItem
                            ? "Add ho raha hai..."
                            : "Add to Menu"}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ========== EDIT MODE : SINGLE PAGE ========== */}
              {editingItem && (
                <div className="space-y-4">
                  {/* Basic Info */}
                  <div>
                    <FieldLabel>Item Name *</FieldLabel>
                    <TextInput
                      value={itemForm.name}
                      onChange={(v) => setItemForm((p) => ({ ...p, name: v }))}
                      placeholder="e.g. Paneer Tikka"
                    />
                  </div>

                  <div>
                    <FieldLabel>Main Category *</FieldLabel>
                    <ChipScroll>
                      {mainCategories.map((cat) => (
                        <Chip
                          key={cat.id}
                          label={cat.name}
                          active={itemForm.mainCategoryId === cat.id}
                          onClick={() => changeMainCategory(cat.id)}
                        />
                      ))}
                    </ChipScroll>
                  </div>

                  {itemSubCategories.length > 0 && (
                    <div>
                      <FieldLabel>Sub Category</FieldLabel>
                      <ChipScroll>
                        <Chip
                          label="None"
                          active={!itemForm.subCategoryId}
                          onClick={() =>
                            setItemForm((p) => ({ ...p, subCategoryId: "" }))
                          }
                        />
                        {itemSubCategories.map((cat) => (
                          <Chip
                            key={cat.id}
                            label={cat.name}
                            active={itemForm.subCategoryId === cat.id}
                            onClick={() =>
                              setItemForm((p) => ({
                                ...p,
                                subCategoryId: cat.id,
                              }))
                            }
                          />
                        ))}
                      </ChipScroll>
                    </div>
                  )}

                  <div>
                    <FieldLabel>Description</FieldLabel>
                    <textarea
                      value={itemForm.description}
                      onChange={(e) =>
                        setItemForm((p) => ({
                          ...p,
                          description: e.target.value,
                        }))
                      }
                      rows={2}
                      className="w-full rounded-xl border border-[#ddd4c1] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#d4a30a]"
                    />
                  </div>

                  <div>
                    <FieldLabel>Image URL</FieldLabel>
                    <TextInput
                      value={itemForm.image}
                      onChange={(v) => setItemForm((p) => ({ ...p, image: v }))}
                    />
                  </div>



                  {/* Variants */}
                  <VariantFields
                    variants={itemForm.variants}
                    onChange={updateVariant}
                    onAdd={addVariant}
                    onRemove={removeVariant}
                  />

                  {/* Tax */}
                  <div>
                    <FieldLabel>Tax %</FieldLabel>
                    <ChipScroll>
                      {TAX_PRESETS.map((pct) => (
                        <Chip
                          key={pct}
                          label={`${pct}%`}
                          active={itemForm.taxPercentage === pct}
                          onClick={() =>
                            setItemForm((p) => ({ ...p, taxPercentage: pct }))
                          }
                        />
                      ))}
                    </ChipScroll>
                  </div>

                  {/* Fulfillment */}
                  <div>
                    <FieldLabel>Fulfillment Type</FieldLabel>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {FULFILLMENT_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() =>
                            setItemForm((p) => ({
                              ...p,
                              fulfillmentType: type,
                            }))
                          }
                          className={[
                            "rounded-xl border py-2.5 text-xs font-bold",
                            itemForm.fulfillmentType === type
                              ? "border-[#d4a30a] bg-[#fdf3e3] text-[#7a4a00]"
                              : "border-[#ddd4c1] bg-white text-slate-600",
                          ].join(" ")}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Option Groups */}
                  {optionGroups.length > 0 && (
                    <div>
                      <FieldLabel>Option Groups</FieldLabel>
                      <ChipScroll>
                        {optionGroups.map((g) => {
                          const selected = itemForm.optionGroupIds.includes(
                            g.id,
                          );
                          return (
                            <Chip
                              key={g.id}
                              label={`${selected ? "✓ " : ""}${g.name}`}
                              active={selected}
                              onClick={() => toggleOptionGroup(g.id, !selected)}
                            />
                          );
                        })}
                      </ChipScroll>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <FieldLabel>Prep Time (mins) (optional)</FieldLabel>
                      <NumberInput value={itemForm.prepTime} onChange={(v) => setItemForm(p => ({ ...p, prepTime: v }))} placeholder="e.g. 15" />
                    </div>
                    <div>
                      <FieldLabel>Food Type</FieldLabel>
                      <ChipScroll>
                        {[
                          { id: "VEG", label: "Veg" },
                          { id: "NON_VEG", label: "Non-Veg" },
                          { id: "EGG", label: "Egg" },
                          { id: "VEGAN", label: "Vegan" },
                        ].map((ft) => (
                          <Chip
                            key={ft.id}
                            label={ft.label}
                            active={itemForm.foodType === ft.id}
                            onClick={() => setItemForm((p) => ({ ...p, foodType: ft.id }))}
                          />
                        ))}
                      </ChipScroll>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>Stock (optional)</FieldLabel>
                      <NumberInput value={itemForm.stock} onChange={(v) => setItemForm(p => ({ ...p, stock: v }))} placeholder="Empty = ∞" />
                    </div>
                    <div>
                      <FieldLabel>Tags (optional)</FieldLabel>
                      <TextInput value={itemForm.tags} onChange={(v) => setItemForm(p => ({ ...p, tags: v }))} placeholder="e.g. spicy, best seller" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-[#ddd4c1] bg-white px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Featured Item</p>
                      <p className="text-[11px] text-slate-500">Highlight on public menu</p>
                    </div>
                    <Toggle checked={itemForm.isFeatured} onChange={(v) => setItemForm(p => ({ ...p, isFeatured: v }))} />
                  </div>


                  {/* Action Buttons for Edit Mode */}
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={async () => {
                        if (editingItem) {
                          await removeItem(editingItem);
                          closeItemModal(); // close after delete
                        }
                      }}
                      disabled={isDeletingItem}
                      className="flex-1 rounded-xl border border-rose-200 bg-rose-50 py-3 text-sm font-bold text-rose-700 transition-all hover:bg-rose-100 active:scale-[0.98] disabled:opacity-50"
                    >
                      {isDeletingItem ? "Deleting..." : "Delete Item"}
                    </button>

                    <button
                      type="submit"
                      disabled={isUpdatingItem}
                      className="flex-1 rounded-xl bg-[#d4a30a] py-3 text-sm font-bold text-white transition-all hover:bg-[#b98a06] active:scale-[0.98] disabled:opacity-50"
                    >
                      {isUpdatingItem ? "Updating..." : "Update Item"}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ── Category Bottom Sheet ── */}
      {isCatSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setIsCatSheetOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#e6dfd1] bg-[#fffdf9] shadow-2xl">
            <div className="sticky top-0 z-10 bg-[#fffdf9] border-b border-[#eee7d8] px-4 pt-3 pb-3">
              <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  {editingCategoryId
                    ? "Category Edit Karo"
                    : catType === "main"
                      ? "Main Category Add Karo"
                      : "Sub Category Add Karo"}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCatSheetOpen(false)}
                  className="h-8 w-8 rounded-full border border-[#e0d8c9] bg-white text-sm text-slate-600"
                >
                  ✕
                </button>
              </div>
            </div>
            <form onSubmit={submitCategory} className="p-4 space-y-4">
              {!editingCategoryId && (
                <div>
                  <FieldLabel>Category Type</FieldLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {(["main", "sub"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setCatType(type);
                          if (type === "main") setCatParentId("");
                        }}
                        className={[
                          "rounded-xl border py-2.5 text-sm font-bold transition-all",
                          catType === type
                            ? "border-[#d4a30a] bg-[#fdf3e3] text-[#7a4a00]"
                            : "border-[#ddd4c1] bg-white text-slate-600 hover:bg-[#faf5eb]",
                        ].join(" ")}
                      >
                        {type === "main" ? "Main Category" : "Sub Category"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <FieldLabel>Category Name *</FieldLabel>
                <TextInput
                  value={editingCategoryId ? editingCategoryName : catName}
                  onChange={
                    editingCategoryId ? setEditingCategoryName : setCatName
                  }
                  placeholder={
                    catType === "main"
                      ? "e.g. Beverages, Starters..."
                      : "e.g. Cold Drinks, Mocktails..."
                  }
                />
              </div>

              {catType === "sub" && (
                <div>
                  <FieldLabel>Main Category (Parent) *</FieldLabel>
                  <ChipScroll>
                    {quickPickMainCats.map((cat) => (
                      <Chip
                        key={cat.id}
                        label={cat.name}
                        active={catParentId === cat.id}
                        onClick={() => chooseParentCategory(cat.id)}
                      />
                    ))}
                  </ChipScroll>
                  {catParentId && (
                    <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
                      Parent: {categoriesById.get(catParentId)?.name}
                    </p>
                  )}
                </div>
              )}

              <PrimaryBtn
                type="submit"
                disabled={isCreatingCategory || isUpdatingCategory}
              >
                {isCreatingCategory || isUpdatingCategory
                  ? "Saving..."
                  : editingCategoryId
                    ? "Update Category"
                    : catType === "main"
                      ? "Add Main Category"
                      : "Add Sub Category"}
              </PrimaryBtn>
            </form>
          </div>
        </div>
      )}

      {/* ── Option Group Bottom Sheet ── */}
      {isOGSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setIsOGSheetOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[#e6dfd1] bg-[#fffdf9] shadow-2xl">
            <div className="sticky top-0 z-10 bg-[#fffdf9] border-b border-[#eee7d8] px-4 pt-3 pb-3">
              <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  {editingGroupId
                    ? "Option Group Edit Karo"
                    : "Option Group Add Karo"}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsOGSheetOpen(false)}
                  className="h-8 w-8 rounded-full border border-[#e0d8c9] bg-white text-sm text-slate-600"
                >
                  ✕
                </button>
              </div>
            </div>
            <form onSubmit={submitOG} className="p-4 space-y-4">
              <div>
                <FieldLabel>Group Name *</FieldLabel>
                <TextInput
                  value={
                    editingGroupId ? editingGroupForm.name : groupForm.name
                  }
                  onChange={(v) =>
                    editingGroupId
                      ? setEditingGroupForm((p) => ({ ...p, name: v }))
                      : setGroupForm((p) => ({ ...p, name: v }))
                  }
                  placeholder="e.g. Spice Level, Extra Toppings..."
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Min Select", field: "minSelect" as const },
                  { label: "Max Select", field: "maxSelect" as const },
                  { label: "Sort Order", field: "sortOrder" as const },
                ].map(({ label, field }) => (
                  <div key={field}>
                    <FieldLabel>{label}</FieldLabel>
                    <NumberInput
                      value={
                        editingGroupId
                          ? editingGroupForm[field]
                          : groupForm[field]
                      }
                      onChange={(v) =>
                        editingGroupId
                          ? setEditingGroupForm((p) => ({ ...p, [field]: v }))
                          : setGroupForm((p) => ({ ...p, [field]: v }))
                      }
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              <PrimaryBtn
                type="submit"
                disabled={isCreatingOptionGroup || isUpdatingOptionGroup}
              >
                {isCreatingOptionGroup || isUpdatingOptionGroup
                  ? "Saving..."
                  : editingGroupId
                    ? "Update Group"
                    : "Add Group"}
              </PrimaryBtn>
            </form>
          </div>
        </div>
      )}
    </>
  );
}


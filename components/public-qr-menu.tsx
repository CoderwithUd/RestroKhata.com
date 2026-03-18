"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/constants";

type PublicVariant = {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
};

type PublicItem = {
  id: string;
  name: string;
  description?: string;
  image?: string;
  isAvailable: boolean;
  variants: PublicVariant[];
};

type PublicCategory = {
  id: string;
  name: string;
  items: PublicItem[];
  children: PublicCategory[];
};

type PublicMenuPayload = {
  tenant?: {
    id?: string;
    name?: string;
    slug?: string;
  };
  table?: {
    id?: string;
    number?: number;
    name?: string;
  };
  categories: PublicCategory[];
};

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

function parseVariant(value: unknown): PublicVariant | null {
  const record = asRecord(value);
  if (!record) return null;

  const name = asString(record.name) || "Variant";
  const price = asNumber(record.price) ?? 0;
  const id = asString(record.id) || asString(record._id) || asString(record.variantId) || `${name}-${price}`;
  if (!id) return null;

  return {
    id,
    name,
    price,
    isAvailable: asBoolean(record.isAvailable) ?? asBoolean(record.isActive) ?? true,
  };
}

function parseItem(value: unknown): PublicItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(record.id) || asString(record._id) || asString(record.itemId);
  if (!id) return null;

  const variants = asArray(record.variants).map(parseVariant).filter((variant): variant is PublicVariant => Boolean(variant));
  const fallbackPrice = asNumber(record.price);
  const resolvedVariants =
    variants.length || fallbackPrice === undefined
      ? variants
      : [
          {
            id: `${id}-price`,
            name: "Regular",
            price: fallbackPrice,
            isAvailable: asBoolean(record.isAvailable) ?? asBoolean(record.isActive) ?? true,
          },
        ];

  return {
    id,
    name: asString(record.name) || "Untitled Item",
    description: asString(record.description) || asString(record.desc),
    image: asString(record.image) || asString(record.imageUrl) || asString(record.thumbnail),
    isAvailable: asBoolean(record.isAvailable) ?? asBoolean(record.isActive) ?? (resolvedVariants.length ? resolvedVariants.some((variant) => variant.isAvailable) : true),
    variants: resolvedVariants,
  };
}

function parseCategory(value: unknown): PublicCategory | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(record.id) || asString(record._id) || asString(record.categoryId);
  if (!id) return null;

  return {
    id,
    name: asString(record.name) || "Category",
    items: asArray(record.items || record.menuItems).map(parseItem).filter((item): item is PublicItem => Boolean(item)),
    children: asArray(record.children || record.subCategories || record.subcategories)
      .map(parseCategory)
      .filter((category): category is PublicCategory => Boolean(category)),
  };
}

function parsePayload(data: unknown): PublicMenuPayload {
  const rawRoot = asRecord(data);
  if (!rawRoot) {
    return { categories: [] };
  }

  const root = asRecord(rawRoot.data) || rawRoot;
  const menuRoot = asRecord(root.menu) || root;
  const tableRecord = asRecord(menuRoot.table) || asRecord(root.table) || asRecord(rawRoot.table);
  const tenantRecord = asRecord(menuRoot.tenant) || asRecord(root.tenant) || asRecord(rawRoot.tenant);
  const categoriesSource =
    asArray(menuRoot.categories).length > 0
      ? menuRoot.categories
      : asArray(root.categories).length > 0
        ? root.categories
        : rawRoot.categories;

  return {
    tenant: {
      id: asString(tenantRecord?.id) || asString(tenantRecord?._id),
      name: asString(tenantRecord?.name),
      slug: asString(tenantRecord?.slug),
    },
    table: tableRecord
      ? {
          id: asString(tableRecord.id) || asString(tableRecord._id),
          number: asNumber(tableRecord.number),
          name: asString(tableRecord.name),
        }
      : undefined,
    categories: asArray(categoriesSource).map(parseCategory).filter((category): category is PublicCategory => Boolean(category)),
  };
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function flattenCategoryTree(categories: PublicCategory[], depth = 0): Array<{ category: PublicCategory; depth: number }> {
  return categories.flatMap((category) => [
    { category, depth },
    ...flattenCategoryTree(category.children, depth + 1),
  ]);
}

type PublicQrMenuProps = {
  tenantSlug?: string;
};

export function PublicQrMenu({ tenantSlug: tenantSlugFromPath }: PublicQrMenuProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<PublicMenuPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const queryKey = `${tenantSlugFromPath || ""}:${searchParams.toString()}`;

  useEffect(() => {
    const controller = new AbortController();
    const token = searchParams.get("token")?.trim();
    const tenantSlug = searchParams.get("tenantSlug")?.trim() || tenantSlugFromPath?.trim();
    const tableId = searchParams.get("tableId")?.trim();
    const tableNumber = searchParams.get("tableNumber")?.trim();

    if (!token && !tenantSlug) {
      setData(null);
      setIsLoading(false);
      setError("QR URL invalid: token ya tenantSlug missing hai.");
      return () => controller.abort();
    }

    async function fetchMenu() {
      setIsLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (token) {
        params.set("token", token);
      } else {
        if (tenantSlug) params.set("tenantSlug", tenantSlug);
        if (tableId) params.set("tableId", tableId);
        if (tableNumber) params.set("tableNumber", tableNumber);
      }

      try {
        const response = await fetch(`${API_BASE_URL}/public/menu?${params.toString()}`, {
          method: "GET",
          credentials: "omit",
          signal: controller.signal,
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = asString((body as Record<string, unknown>)?.message) || "Public menu load failed";
          throw new Error(message);
        }

        setData(parsePayload(body));
      } catch (e) {
        if (controller.signal.aborted) return;
        setData(null);
        setError(e instanceof Error ? e.message : "Public menu load failed");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    fetchMenu();
    return () => controller.abort();
  }, [queryKey, searchParams, tenantSlugFromPath]);

  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const flatCategories = useMemo(() => flattenCategoryTree(data?.categories || []), [data?.categories]);
  const categoriesWithItems = useMemo(
    () => flatCategories.filter(({ category }) => category.items.length > 0),
    [flatCategories],
  );
  const visibleCategories = useMemo(
    () =>
      activeCategoryId === "all"
        ? categoriesWithItems
        : categoriesWithItems.filter(({ category }) => category.id === activeCategoryId),
    [activeCategoryId, categoriesWithItems],
  );
  const visibleItemCount = useMemo(
    () => visibleCategories.reduce((sum, { category }) => sum + category.items.length, 0),
    [visibleCategories],
  );
  const tenantName = data?.tenant?.name || data?.tenant?.slug || "Restaurant";
  const tableLabel = data?.table?.name || (Number.isFinite(data?.table?.number) ? `Table ${data?.table?.number}` : "Walk-in");

  useEffect(() => {
    if (!categoriesWithItems.length) {
      setActiveCategoryId("all");
      return;
    }
    const exists = categoriesWithItems.some(({ category }) => category.id === activeCategoryId);
    if (activeCategoryId !== "all" && !exists) {
      setActiveCategoryId("all");
    }
  }, [activeCategoryId, categoriesWithItems]);

  return (
    <main className="min-h-screen bg-[#f6f4ef] px-3 py-4 text-slate-900 md:px-6 md:py-8">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header className="rounded-2xl border border-[#e6dfd1] bg-[linear-gradient(145deg,#fff6e6_0%,#fffdf9_58%,#eff7f2_100%)] p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Public QR Menu</p>
              <h1 className="mt-2 text-2xl font-semibold md:text-3xl">{tenantName}</h1>
              <p className="mt-1 text-sm text-slate-600">Serving for: {tableLabel}</p>
            </div>
            <div className="grid min-w-[150px] grid-cols-1 gap-2 text-xs sm:grid-cols-2 sm:text-right">
              <p className="rounded-lg border border-[#eadfc9] bg-white px-3 py-2 font-medium text-slate-700">Categories: {categoriesWithItems.length}</p>
              <p className="rounded-lg border border-[#eadfc9] bg-white px-3 py-2 font-medium text-slate-700">Items: {visibleItemCount}</p>
            </div>
          </div>

          {categoriesWithItems.length ? (
            <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setActiveCategoryId("all")}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  activeCategoryId === "all" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-[#e0d8c9] bg-white text-slate-700"
                }`}
              >
                All Menu
              </button>
              {categoriesWithItems.map(({ category, depth }) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategoryId(category.id)}
                  className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    activeCategoryId === category.id ? "border-amber-200 bg-amber-50 text-amber-800" : "border-[#e0d8c9] bg-white text-slate-700"
                  }`}
                >
                  {depth ? `${"• ".repeat(Math.min(depth, 2))}` : ""}
                  {category.name}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        {isLoading ? (
          <section className="mt-4 rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] p-6 text-sm text-slate-600">
            Loading menu...
          </section>
        ) : null}

        {error ? (
          <section className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</section>
        ) : null}

        {!isLoading && !error ? (
          <section className="mt-4 space-y-4">
            {visibleCategories.length ? (
              visibleCategories.map(({ category, depth }) => (
                <article key={category.id} className="overflow-hidden rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
                  <div className="border-b border-[#eee7d8] bg-[linear-gradient(145deg,#fff9ef_0%,#fffdf9_90%)] px-4 py-3" style={{ paddingLeft: `${16 + depth * 12}px` }}>
                    <h2 className="text-lg font-semibold text-slate-900">{category.name}</h2>
                    <p className="text-xs text-slate-500">{category.items.length} items</p>
                  </div>
                  <div className="grid gap-3 p-4 md:grid-cols-2">
                    {category.items.length ? (
                      category.items.map((item) => (
                        <div key={item.id} className="rounded-xl border border-[#eadfc9] bg-[linear-gradient(165deg,#fffcf6_0%,#fff7e8_100%)] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-base font-semibold text-slate-900">{item.name}</p>
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                item.isAvailable
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-300 bg-slate-100 text-slate-600"
                              }`}
                            >
                              {item.isAvailable ? "Available" : "Out"}
                            </span>
                          </div>
                          {item.image ? (
                            <div className="mt-2 overflow-hidden rounded-lg border border-[#eadfc9] bg-white shadow-sm">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={item.image} alt={item.name} loading="lazy" className="h-36 w-full object-cover" />
                            </div>
                          ) : null}
                          {item.description ? <p className="mt-2 text-xs text-slate-600">{item.description}</p> : null}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.variants.length ? (
                              item.variants.map((variant) => (
                                <span
                                  key={variant.id}
                                  className={`rounded-full border px-2 py-1 text-[11px] ${
                                    variant.isAvailable
                                      ? "border-amber-200 bg-amber-50 text-amber-800"
                                      : "border-slate-300 bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  {variant.name}: {formatMoney(variant.price)}
                                </span>
                              ))
                            ) : (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">No variants</span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No items in this category.</p>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <article className="rounded-2xl border border-dashed border-[#e0d6c4] bg-[#fffcf7] px-4 py-10 text-center text-sm text-slate-600">
                Menu is empty for this QR link.
              </article>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}

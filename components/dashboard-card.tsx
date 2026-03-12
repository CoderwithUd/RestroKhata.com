"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clearStoredSession } from "@/lib/auth-session";
import { getErrorMessage } from "@/lib/error";
import { isSubscriptionExpired } from "@/lib/subscription";
import { FullPageLoader } from "@/components/full-page-loader";
import { InvoicesWorkspace } from "@/components/invoices-workspace";
import { MenuWorkspace } from "@/components/menu-workspace";
import { OrdersWorkspace } from "@/components/orders-workspace";
import { ProfileSettingsWorkspace } from "@/components/profile-settings-workspace";
import { StaffWorkspace } from "@/components/staff-workspace";
import { TablesWorkspace } from "@/components/tables-workspace";
import { useLogoutMutation, useOrdersQuery, useTentantProfileQuery } from "@/store/api/authApi";
import { useGetMenuItemsQuery } from "@/store/api/menuApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { clearSession, selectAuthTenant, selectAuthUser } from "@/store/slices/authSlice";
import { useGetTablesQuery } from "@/store/api/tablesApi";

type DashboardCardProps = {
  section?: string;
};

type RoleKey = "owner" | "manager" | "waiter" | "kitchen";
type SectionId =
  | "overview"
  | "orders"
  | "invoices"
  | "menu"
  | "staff"
  | "reports"
  | "settings"
  | "tables"
  | "kitchen"
  | "inventory"
  | "profile";

type DashboardSection = {
  id: SectionId;
  short: string;
  label: string;
  subtitle: string;
  kpis: Array<{ label: string; value: string; tone: "amber" | "green" | "blue" | "red" }>;
  modules: Array<{ title: string; description: string; value: string }>;
};

const ROLE_SECTIONS: Record<RoleKey, SectionId[]> = {
  owner: ["overview", "orders", "invoices", "tables", "kitchen", "menu", "staff", "reports", "inventory", "settings", "profile"],
  manager: ["overview", "orders", "invoices", "tables", "kitchen", "menu", "staff", "reports", "profile"],
  waiter: ["overview", "orders", "invoices", "tables", "profile"],
  kitchen: ["overview", "kitchen", "orders", "inventory", "profile"],
};

const SECTION_LIBRARY: Record<SectionId, DashboardSection> = {
  overview: {
    id: "overview",
    short: "OV",
    label: "Dashboard",
    subtitle: "Cafe and restaurant operations in one place.",
    kpis: [
      { label: "Today's Revenue", value: "INR 18,420", tone: "amber" },
      { label: "Total Orders", value: "84", tone: "green" },
      { label: "Tables Occupied", value: "11/18", tone: "blue" },
      { label: "Avg Wait Time", value: "14 min", tone: "red" },
    ],
    modules: [
      { title: "Peak Hour Window", description: "Rush traffic across counters.", value: "7:30 PM - 9:15 PM" },
      { title: "Delivery Mix", description: "Dine-in vs online order ratio.", value: "58% / 42%" },
      { title: "Staff On Shift", description: "Live active operations team.", value: "12 members" },
    ],
  },
  orders: {
    id: "orders",
    short: "OR",
    label: "Orders",
    subtitle: "Track incoming, cooking, and packed orders.",
    kpis: [
      { label: "New", value: "29", tone: "amber" },
      { label: "Cooking", value: "11", tone: "red" },
      { label: "Ready", value: "8", tone: "green" },
      { label: "Packed", value: "6", tone: "blue" },
    ],
    modules: [
      { title: "Counter Priority", description: "High-priority order queue.", value: "6 urgent tickets" },
      { title: "Average Fulfillment", description: "Order completion speed.", value: "18 min" },
      { title: "Refund Requests", description: "Pending customer escalations.", value: "1 open" },
    ],
  },
  invoices: {
    id: "invoices",
    short: "BL",
    label: "Invoices",
    subtitle: "Generate table bills and collect payment quickly.",
    kpis: [
      { label: "Pending Bills", value: "14", tone: "amber" },
      { label: "Issued", value: "9", tone: "blue" },
      { label: "Paid", value: "62", tone: "green" },
      { label: "Overdue", value: "1", tone: "red" },
    ],
    modules: [
      { title: "Fast Billing", description: "One tap invoice issue for ready orders.", value: "Live now" },
      { title: "Payment Desk", description: "Cash and UPI settlement from one screen.", value: "2 modes" },
      { title: "Table Clearance", description: "Auto table release after payment.", value: "Enabled" },
    ],
  },
  menu: {
    id: "menu",
    short: "MN",
    label: "Menu",
    subtitle: "Manage items, pricing, and sell-through.",
    kpis: [
      { label: "Live Items", value: "86", tone: "blue" },
      { label: "Out of Stock", value: "5", tone: "red" },
      { label: "Top Seller", value: "Cappuccino", tone: "amber" },
      { label: "Margin", value: "34%", tone: "green" },
    ],
    modules: [
      { title: "Category Health", description: "Performance by menu buckets.", value: "Snacks +14%" },
      { title: "Pricing Alerts", description: "Items below target margin.", value: "4 items" },
      { title: "Seasonal Promo", description: "Current active campaign.", value: "Summer Beverages" },
    ],
  },
  staff: {
    id: "staff",
    short: "TM",
    label: "Staff",
    subtitle: "Shift assignment, attendance, and productivity.",
    kpis: [
      { label: "On Time", value: "91%", tone: "green" },
      { label: "Late", value: "3", tone: "red" },
      { label: "On Floor", value: "8", tone: "blue" },
      { label: "In Kitchen", value: "4", tone: "amber" },
    ],
    modules: [
      { title: "Shift Roster", description: "Next shift readiness snapshot.", value: "Night shift full" },
      { title: "Escalation Board", description: "Operational tickets from team.", value: "2 pending" },
      { title: "Training Status", description: "SOP module completion.", value: "87% completed" },
    ],
  },
  reports: {
    id: "reports",
    short: "RP",
    label: "Reports",
    subtitle: "Revenue and operation analytics.",
    kpis: [
      { label: "Weekly Growth", value: "+12.8%", tone: "green" },
      { label: "Repeat Guests", value: "39%", tone: "blue" },
      { label: "AOV", value: "INR 486", tone: "amber" },
      { label: "Tax Snapshot", value: "INR 17,430", tone: "red" },
    ],
    modules: [
      { title: "Daily P&L", description: "Profit and cost status.", value: "Healthy" },
      { title: "Channel ROI", description: "Performance by delivery partner.", value: "Best: Direct" },
      { title: "Forecast", description: "Expected close by tonight.", value: "INR 1,58,000" },
    ],
  },
  settings: {
    id: "settings",
    short: "ST",
    label: "Settings",
    subtitle: "Business profile and integrations.",
    kpis: [
      { label: "Profile Health", value: "100%", tone: "green" },
      { label: "Tax Rules", value: "Configured", tone: "blue" },
      { label: "Payment Modes", value: "6", tone: "amber" },
      { label: "Integrations", value: "3", tone: "red" },
    ],
    modules: [
      { title: "Restaurant Profile", description: "Brand details and contact points.", value: "Up to date" },
      { title: "Billing", description: "Current SaaS plan status.", value: "Growth Plan" },
      { title: "Automation", description: "Order and alert workflows.", value: "5 enabled" },
    ],
  },
  tables: {
    id: "tables",
    short: "TB",
    label: "Tables",
    subtitle: "Floor occupancy and service status.",
    kpis: [
      { label: "Occupied", value: "11", tone: "amber" },
      { label: "Free", value: "5", tone: "green" },
      { label: "Reserved", value: "2", tone: "blue" },
      { label: "Billing", value: "2", tone: "red" },
    ],
    modules: [
      { title: "Hot Zone", description: "High movement dining area.", value: "Terrace" },
      { title: "Fast Turn Tables", description: "Tables with low delay.", value: "T2, T7, T11" },
      { title: "Guest Notes", description: "Special requests tracker.", value: "3 active" },
    ],
  },
  kitchen: {
    id: "kitchen",
    short: "KT",
    label: "Kitchen",
    subtitle: "Preparation queue and handoff flow.",
    kpis: [
      { label: "Prep Queue", value: "14", tone: "amber" },
      { label: "Urgent", value: "3", tone: "red" },
      { label: "Ready", value: "6", tone: "green" },
      { label: "Avg Cook", value: "16 min", tone: "blue" },
    ],
    modules: [
      { title: "Slowest Item", description: "Current bottleneck dish.", value: "Smoked Pasta" },
      { title: "Fire Alerts", description: "Orders crossing SLA.", value: "2 alerts" },
      { title: "Handoff Efficiency", description: "Kitchen to waiter transfer.", value: "93%" },
    ],
  },
  inventory: {
    id: "inventory",
    short: "IV",
    label: "Inventory",
    subtitle: "Stock levels and restock planning.",
    kpis: [
      { label: "Low Stock", value: "7", tone: "red" },
      { label: "Critical", value: "2", tone: "amber" },
      { label: "Wastage", value: "2.1%", tone: "blue" },
      { label: "ETA", value: "Tomorrow", tone: "green" },
    ],
    modules: [
      { title: "Priority Purchase", description: "Items to buy first.", value: "Cheese, Lettuce" },
      { title: "Storage Health", description: "Cold and dry storage check.", value: "Stable" },
      { title: "Vendor SLA", description: "On-time supplier performance.", value: "96%" },
    ],
  },
  profile: {
    id: "profile",
    short: "PF",
    label: "My Profile",
    subtitle: "Your shift and tasks.",
    kpis: [
      { label: "Shift Time", value: "7h 20m", tone: "blue" },
      { label: "Tasks Done", value: "31", tone: "green" },
      { label: "Feedback", value: "4.6", tone: "amber" },
      { label: "Break Left", value: "12 min", tone: "red" },
    ],
    modules: [
      { title: "Assigned Zone", description: "Primary active responsibility.", value: "Main Floor" },
      { title: "Today Checklist", description: "Pending personal tasks.", value: "2 pending" },
      { title: "Supervisor Note", description: "Latest coaching update.", value: "Great speed" },
    ],
  },
};

const KOT_TICKETS = [
  { table: "Table 3", time: "18 min ago", items: "Pasta Arrabbiata, Cold Coffee x 2, Brownie", tone: "red" },
  { table: "Table 11", time: "12 min ago", items: "Veg Thali x 5, Sweet Lassi x 3", tone: "amber" },
  { table: "Table 8", time: "Ready", items: "Cheese Burger x 2, Loaded Fries", tone: "green" },
];

const SALES_WEEK = [55, 72, 48, 85, 63, 74, 40];

const TOP_ITEMS = [
  { name: "Cappuccino", price: "INR 180", sold: "34 sold" },
  { name: "Paneer Pizza", price: "INR 380", sold: "18 sold" },
  { name: "Cheese Burger", price: "INR 260", sold: "22 sold" },
  { name: "Choco Brownie", price: "INR 140", sold: "29 sold" },
];

function normalizeRole(rawRole?: string): RoleKey {
  const role = (rawRole || "manager").toLowerCase().trim();
  if (role.includes("owner") || role.includes("admin")) return "owner";
  if (role.includes("waiter") || role.includes("server") || role.includes("captain")) return "waiter";
  if (role.includes("kitchen") || role.includes("chef") || role.includes("cook")) return "kitchen";
  return "manager";
}

function toneClasses(tone: "amber" | "green" | "blue" | "red"): string {
  if (tone === "green") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "blue") return "border-blue-200 bg-blue-50 text-blue-800";
  if (tone === "red") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function roleLabel(role: RoleKey): string {
  if (role === "owner") return "Owner";
  if (role === "waiter") return "Waiter";
  if (role === "kitchen") return "Kitchen";
  return "Manager";
}

function orderTone(status?: string): "amber" | "green" | "blue" | "red" {
  const normalized = (status || "").toUpperCase();

  if (normalized === "PLACED" || normalized === "NEW") return "amber";
  if (normalized === "IN_PROGRESS" || normalized === "COOKING" || normalized === "PREPARING") return "red";
  if (normalized === "READY" || normalized === "COMPLETED" || normalized === "DELIVERED") return "green";
  return "blue";
}

function tableStatusLabel(status?: string): string {
  const normalized = (status || "AVAILABLE").toUpperCase();
  if (normalized === "RESERVED") return "Reserved";
  if (normalized === "OCCUPIED") return "Occupied";
  if (normalized === "BILLING") return "Billing";
  if (normalized === "AVAILABLE") return "Available";
  return normalized;
}

function tableStatusClass(status?: string): string {
  const normalized = (status || "AVAILABLE").toUpperCase();
  if (normalized === "RESERVED") return "border-blue-200 bg-blue-50 text-blue-700";
  if (normalized === "OCCUPIED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (normalized === "BILLING") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalized === "AVAILABLE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function NavItem({
  item,
  href,
  active,
  badge,
  onClick,
}: {
  item: DashboardSection;
  href: string;
  active: boolean;
  badge?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
        active ? "bg-amber-100 text-amber-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-amber-200 text-amber-900" : "bg-slate-200 text-slate-600"}`}>
        <SectionIcon id={item.id} />
      </span>
      <span className="flex-1 truncate font-medium">{item.label}</span>
      {badge ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">{badge}</span> : null}
    </Link>
  );
}

function SectionIcon({ id }: { id: SectionId }) {
  const common = "h-4 w-4";

  if (id === "overview") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </svg>
    );
  }

  if (id === "orders") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 4h8" />
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    );
  }

  if (id === "invoices") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M15 3v5h4M9 12h8M9 16h8" />
      </svg>
    );
  }

  if (id === "tables") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="6" width="16" height="8" rx="1.5" />
        <path d="M8 14v4M16 14v4" />
      </svg>
    );
  }

  if (id === "kitchen") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 6h12v12H4z" />
        <path d="M16 10h4M16 14h4" />
      </svg>
    );
  }

  if (id === "menu") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 4v10M10 4v10M6 9h4M14 4v16M14 12h4" />
      </svg>
    );
  }

  if (id === "staff") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="9" r="2.5" />
        <path d="M3.5 20c0-3 2.4-5 5.5-5s5.5 2 5.5 5M14 20c0-2 1.6-3.5 3.8-3.5S21.5 18 21.5 20" />
      </svg>
    );
  }

  if (id === "reports") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 20h16" />
        <rect x="6" y="11" width="3" height="6" />
        <rect x="11" y="8" width="3" height="9" />
        <rect x="16" y="5" width="3" height="12" />
      </svg>
    );
  }

  if (id === "inventory") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 9h16M9 9v11" />
      </svg>
    );
  }

  if (id === "settings") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3.5" />
        <path d="M19 12a7 7 0 0 0-.1-1l2-1.4-2-3.5-2.4 1a7.3 7.3 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a7.3 7.3 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.4a7 7 0 0 0 0 2l-2 1.4 2 3.5 2.4-1a7.3 7.3 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7.3 7.3 0 0 0 1.7-1l2.4 1 2-3.5-2-1.4c.1-.3.1-.7.1-1z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M5 21c0-3.5 3-6 7-6s7 2.5 7 6" />
    </svg>
  );
}

export function DashboardCard({ section }: DashboardCardProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectAuthUser);
  const tenant = useAppSelector(selectAuthTenant);
  const [logout, { isLoading: isLoggingOut }] = useLogoutMutation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const { data: tentantProfile, isLoading: isTenantProfileLoading } = useTentantProfileQuery();
  const { data: ordersPayload, isFetching: isOrdersFetching } = useOrdersQuery({
    status: ["PLACED", "IN_PROGRESS"],
    page: 1,
    limit: 20,
  });
  const subscriptionExpired = isSubscriptionExpired(tentantProfile?.subscription);
  const { data: tablesPayload } = useGetTablesQuery();

  const role = useMemo(() => normalizeRole(tentantProfile?.role || user?.role), [tentantProfile?.role, user?.role]);
  const allowedIds = ROLE_SECTIONS[role];
  const defaultId = allowedIds[0];
  const activeId = section && allowedIds.includes(section as SectionId) ? (section as SectionId) : null;
  const { data: menuPayload } = useGetMenuItemsQuery({ page: 1, limit: 100 }, {
    skip: activeId !== "menu",
  });

  const activeSection = activeId ? SECTION_LIBRARY[activeId] : null;
  const navSections = allowedIds.map((id) => SECTION_LIBRARY[id]);
  const liveOrders = (ordersPayload?.items || []).slice(0, 6).map((order) => ({
    id: order.orderNumber || order.id,
    title: order.sourceLabel || order.tableName || "Order",
    items: order.itemsSummary || "Order items unavailable",
    status: order.status || "UNKNOWN",
    tone: orderTone(order.status),
  }));
  const activeOrderCount = ordersPayload?.pagination.total || liveOrders.length;
  const kitchenActiveCount = (ordersPayload?.items || []).filter((order) => {
    const status = (order.status || "").toUpperCase();
    return status === "IN_PROGRESS" || status === "COOKING" || status === "PREPARING";
  }).length;
  const tablesList = tablesPayload?.items || [];
  const totalTablesCount = tablesList.length;
  const activeTablesCount = tablesList.filter((table) => table.isActive).length;
  const reservedTablesCount = tablesList.filter((table) => (table.status || "").toUpperCase() === "RESERVED").length;
  const occupiedTablesCount = tablesList.filter((table) => (table.status || "").toUpperCase() === "OCCUPIED").length;
  const previewTables = tablesList.slice(0, 18);
  const menuItems = menuPayload?.items || [];
  const menuTotalCount = menuItems.length;
  const menuAvailableCount = menuItems.filter((item) => item.isAvailable).length;
  const menuUnavailableCount = menuTotalCount - menuAvailableCount;
  const menuCategoriesCount = new Set(
    menuItems.map((item) => (item.categoryName || "").trim()).filter((value) => Boolean(value)),
  ).size;
  const menuAvgPrice = menuTotalCount
    ? Math.round((menuItems.reduce((sum, item) => sum + (item.price || 0), 0) / menuTotalCount) * 100) / 100
    : 0;

  useEffect(() => {
    if (!section || !activeId) {
      router.replace(`/dashboard/${defaultId}`);
    }
  }, [activeId, defaultId, router, section]);

  useEffect(() => {
    if (!isTenantProfileLoading && subscriptionExpired) {
      router.replace("/plan");
    }
  }, [isTenantProfileLoading, router, subscriptionExpired]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [activeId]);

  const onLogout = async () => {
    try {
      await logout().unwrap();
    } catch (error) {
      console.error(getErrorMessage(error));
    } finally {
      dispatch(clearSession());
      clearStoredSession();
      router.replace("/login");
    }
  };

  if (isTenantProfileLoading && !tentantProfile) {
    return <FullPageLoader label="Loading your workspace" />;
  }

  if (subscriptionExpired) {
    return <FullPageLoader label="Redirecting to plan details" />;
  }

  if (!section || !activeSection) {
    return <FullPageLoader label="Opening dashboard" />;
  }

  const todayText = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const todayCompact = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const tenantName = tentantProfile?.tenant?.name || tenant?.name || "BrewDesk";
  const memberName = tentantProfile?.user?.name || user?.name || "Restaurant User";
  const memberRole = roleLabel(role);
  const tenantSlug = tentantProfile?.tenant?.slug || tenant?.slug || "";
  const bottomTabs = navSections.slice(0, 5);
  const getNavBadge = (id: SectionId): string | undefined => {
    if (id === "orders") return `${activeOrderCount}`;
    if (id === "kitchen") return `${kitchenActiveCount}`;
    if (id === "tables") return `${totalTablesCount}`;
    if (id === "menu" && menuTotalCount) return `${menuTotalCount}`;
    return undefined;
  };
  const activeSectionKpis =
    activeSection.id === "tables"
      ? [
          { label: "Total Tables", value: `${totalTablesCount}`, tone: "amber" as const },
          { label: "Active", value: `${activeTablesCount}`, tone: "green" as const },
          { label: "Reserved", value: `${reservedTablesCount}`, tone: "blue" as const },
          { label: "Occupied", value: `${occupiedTablesCount}`, tone: "red" as const },
        ]
      : activeSection.id === "menu"
        ? [
            { label: "Total Items", value: `${menuTotalCount}`, tone: "blue" as const },
            { label: "Available", value: `${menuAvailableCount}`, tone: "green" as const },
            { label: "Hidden", value: `${menuUnavailableCount}`, tone: "red" as const },
            {
              label: menuCategoriesCount ? "Avg Price" : "Categories",
              value: menuCategoriesCount ? `INR ${menuAvgPrice}` : `${menuCategoriesCount}`,
              tone: "amber" as const,
            },
          ]
      : activeSection.kpis;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6f4ef] text-slate-900">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,#fbe8c6_0%,transparent_38%),radial-gradient(circle_at_bottom_left,#e4efe7_0%,transparent_35%)]" />

      <div className="mx-auto flex w-full max-w-[1460px] gap-4 px-3 py-3 md:px-4 md:py-4 lg:gap-6 lg:px-6 lg:py-6">
        <aside className="hidden h-[calc(100vh-3rem)] w-[265px] shrink-0 rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] p-4 lg:flex lg:flex-col">
          <div className="border-b border-[#eee7d8] pb-4">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-sm font-bold text-white">BD</div>
            <h2 className="mt-3 text-lg font-semibold">{tenantName}</h2>
            <p className="text-xs text-slate-500">Cafe and Restaurant Manager</p>
          </div>

          <nav className="no-scrollbar mt-4 flex-1 space-y-1 overflow-y-auto pr-1">
            {navSections.map((item) => (
              <NavItem
                key={item.id}
                item={item}
                href={`/dashboard/${item.id}`}
                active={item.id === activeSection.id}
                badge={getNavBadge(item.id)}
              />
            ))}
          </nav>

          <div className="mt-4 rounded-xl border border-[#ebe2d1] bg-[#faf5ea] p-3">
            <p className="text-sm font-semibold">{memberName}</p>
            <p className="text-xs text-slate-500">{memberRole}</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 rounded-2xl border border-[#e6dfd1] bg-[#fffdf9]/95 px-3 py-3 shadow-sm backdrop-blur sm:top-3 md:px-4 lg:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e6dfd1] bg-white text-slate-700 lg:hidden"
                  aria-label="Open menu"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
                <div className="min-w-0">
                  <h1 className="truncate text-base font-semibold sm:text-lg md:text-xl">Good morning, {memberName}</h1>
                  <p className="text-xs text-slate-500 sm:hidden">{todayCompact} - Open</p>
                  <p className="hidden text-sm text-slate-500 sm:block">{todayText} - Cafe is Open</p>
                </div>
              </div>

              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
                <button
                  type="button"
                  onClick={() => setNewOrderOpen(true)}
                  className="hidden rounded-lg border border-[#e6dfd1] bg-white px-3 py-2 text-sm font-medium text-slate-700 md:inline-flex hover:bg-amber-50"
                >
                  + New Order
                </button>
                {allowedIds.includes("invoices") ? (
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard/invoices")}
                    className="hidden w-full items-center justify-center rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 sm:inline-flex sm:w-auto"
                  >
                    Billing
                  </button>
                ) : null}
                {tenantSlug ? (
                  <Link href={`/${tenantSlug}`} className="hidden rounded-lg border border-[#e6dfd1] bg-white px-3 py-2 text-sm font-medium text-slate-700 xl:inline-flex">
                    Public URL
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={onLogout}
                  disabled={isLoggingOut}
                  className="inline-flex w-full items-center justify-center rounded-lg border border-[#e6dfd1] bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60 sm:w-auto"
                >
                  {isLoggingOut ? "Signing out..." : "Logout"}
                </button>
              </div>
            </div>
          </header>

       

          <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {activeSectionKpis.map((kpi, index) => (
              <article key={kpi.label} className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] p-4 shadow-sm">
                <div className={`mb-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${toneClasses(kpi.tone)}`}>
                  {kpi.label} 
                </div>
                <p className="text-2xl font-semibold text-slate-900">{kpi.value}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${
                      kpi.tone === "green"
                        ? "bg-emerald-500"
                        : kpi.tone === "blue"
                          ? "bg-blue-500"
                          : kpi.tone === "red"
                            ? "bg-rose-500"
                            : "bg-amber-500"
                    }`}
                    style={{ width: `${58 + (index % 4) * 10}%` }}
                  />
                </div>
              </article>
            ))}
          </section>

          {activeSection.id === "overview" ? (
            <>
              <section className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eee7d8] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">Table Floor Plan</p>
                      <p className="text-xs text-slate-500">Tap a table to manage</p>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs">All {totalTablesCount}</span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">Active {activeTablesCount}</span>
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">Reserved {reservedTablesCount}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
                    {previewTables.length ? (
                      previewTables.map((table) => (
                        <button
                          key={table.id}
                          type="button"
                          onClick={() => router.push("/dashboard/tables")}
                          className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-xs font-medium transition hover:scale-[1.02] ${
                            tableStatusClass(table.status)
                          }`}
                        >
                          <span className="text-sm font-semibold">T{table.number}</span>
                          <span>{table.capacity} seats</span>
                          <span className="mt-1 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] text-slate-500">
                            {tableStatusLabel(table.status)}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="col-span-full rounded-xl border border-dashed border-[#e0d6c4] bg-[#fffcf7] px-4 py-8 text-center text-xs text-slate-600">
                        No tables found. Create from the Tables section.
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eee7d8] px-4 py-3 text-xs text-slate-600">
                    <div className="flex flex-wrap gap-3">
                      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-emerald-400" />Available</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-blue-400" />Reserved</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-amber-400" />Occupied</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-rose-400" />Billing</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push("/dashboard/tables")}
                      className="rounded-lg border border-[#e0d8c9] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      Manage Tables
                    </button>
                  </div>
                </article>

                <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#eee7d8] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">Live Orders</p>
                      <p className="text-xs text-slate-500">{isOrdersFetching ? "Syncing..." : `${activeOrderCount} active`}</p>
                    </div>
                    <button className="rounded-lg border border-[#e6dfd1] bg-white px-3 py-1.5 text-xs" onClick={()=>router.push("/dashboard/orders")}>View all</button>
                  </div>
                  <div className="space-y-3 p-4">
                    {liveOrders.length ? liveOrders.map((order,key) => (
                      <div key={order.id} className="flex items-center gap-3 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-amber-700">
                          {key+1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{order.title}</p>
                          <p className="truncate text-xs text-slate-500">{order.items}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${toneClasses(order.tone)}`}>
                          {order.status}
                        </span>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-500">No active orders right now.</p>
                    )}
                  </div>
                </article>
              </section>

              <section className="mt-4 grid gap-4 xl:grid-cols-2">
                <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#eee7d8] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">Kitchen Display</p>
                      <p className="text-xs text-slate-500">3 pending tickets</p>
                    </div>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-700">3 Urgent</span>
                  </div>
                  <div className="space-y-3 p-4">
                    {KOT_TICKETS.map((ticket, index) => (
                      <div
                        key={index}
                        className={`rounded-xl border-l-4 border p-3 ${
                          ticket.tone === "red"
                            ? "border-rose-300 bg-rose-50"
                            : ticket.tone === "green"
                              ? "border-emerald-300 bg-emerald-50"
                              : "border-amber-300 bg-amber-50"
                        }`}
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-sm font-semibold">{ticket.table}</p>
                          <p className="text-xs text-slate-500">{ticket.time}</p>
                        </div>
                        <p className="text-xs text-slate-600">{ticket.items}</p>
                      </div>
                    ))}
                  </div>
                </article>

                <div className="grid gap-4">
                  <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
                    <div className="border-b border-[#eee7d8] px-4 py-3">
                      <p className="text-sm font-semibold">Sales This Week</p>
                      <p className="text-xs text-slate-500">Total INR 1,12,400</p>
                    </div>
                    <div className="p-4">
                      <div className="flex h-24 items-end gap-1.5">
                        {SALES_WEEK.map((height, i) => (
                          <div key={i} className={`w-full rounded-t ${i === 5 ? "bg-amber-500" : "bg-amber-200"}`} style={{ height: `${height}%` }} />
                        ))}
                      </div>
                      <div className="mt-2 grid grid-cols-7 text-center text-[10px] text-slate-500">
                        <span>Mon</span>
                        <span>Tue</span>
                        <span>Wed</span>
                        <span>Thu</span>
                        <span>Fri</span>
                        <span>Sat</span>
                        <span>Sun</span>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
                    <div className="border-b border-[#eee7d8] px-4 py-3">
                      <p className="text-sm font-semibold">Top Selling Items</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 p-4">
                      {TOP_ITEMS.map((item) => (
                        <div key={item.name} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-sm font-semibold">{item.name}</p>
                          <p className="mt-1 text-xs font-semibold text-amber-700">{item.price}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{item.sold} today</p>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              </section>
            </>
          ) : activeSection.id === "orders" || activeSection.id === "kitchen" ? (
            <section className="mt-4">
              <OrdersWorkspace rawRole={tentantProfile?.role || user?.role} />
            </section>
          ) : activeSection.id === "invoices" ? (
            <section className="mt-4">
              <InvoicesWorkspace rawRole={tentantProfile?.role || user?.role} />
            </section>
          ) : activeSection.id === "tables" ? (
            <TablesWorkspace tenantName={tenantName} tenantSlug={tenantSlug} />
          ) : activeSection.id === "menu" ? (
            <MenuWorkspace tenantName={tenantName} />
          ) : activeSection.id === "staff" ? (
            <StaffWorkspace tenantName={tenantName} />
          ) : activeSection.id === "profile" || activeSection.id === "settings" ? (
            <ProfileSettingsWorkspace title={activeSection.id === "settings" ? "Business Settings" : "Profile & Settings"} />
          ) : (
            <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activeSection.modules.map((module) => (
                <article key={module.title} className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] p-4 shadow-sm">
                  <p className="text-sm font-semibold">{module.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{module.description}</p>
                  <p className="mt-4 text-base font-semibold text-amber-700">{module.value}</p>
                </article>
              ))}
            </section>
          )}
        </div>
      </div>

      {/* Global + New Order modal (accessible from header button) */}
      {newOrderOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setNewOrderOpen(false)}>
          <div
            className="flex h-[90vh] w-full max-w-3xl flex-col rounded-t-3xl bg-[#f6f4ef] p-4 shadow-2xl sm:rounded-2xl sm:h-auto sm:max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-bold">New Order</p>
              <button onClick={() => setNewOrderOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <OrdersWorkspace rawRole="waiter" />
            </div>
          </div>
        </div>
      )}

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/35"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          />
          <aside className="no-scrollbar absolute left-0 top-0 h-full w-[86%] max-w-[320px] overflow-y-auto border-r border-[#e6dfd1] bg-[#fffdf9] p-4 shadow-2xl">
            <div className="mb-4 flex items-start justify-between border-b border-[#eee7d8] pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{memberRole}</p>
                <h2 className="mt-1 text-lg font-semibold">{tenantName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg border border-[#e6dfd1] bg-white px-2.5 py-1 text-xs font-semibold"
              >
                Close
              </button>
            </div>

            <nav className="space-y-1">
              {navSections.map((item) => (
                  <NavItem
                    key={item.id}
                    item={item}
                    href={`/dashboard/${item.id}`}
                    active={item.id === activeSection.id}
                    onClick={() => setDrawerOpen(false)}
                    badge={getNavBadge(item.id)}
                  />
                ))}
              </nav>
          </aside>
        </div>
      ) : null}

      {allowedIds.includes("invoices") ? (
        <button
          type="button"
          onClick={() => router.push("/dashboard/invoices")}
          className="fixed bottom-20 right-3 z-40 inline-flex items-center justify-center rounded-full bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/30 sm:hidden"
        >
          Billing
        </button>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e6dfd1] bg-[#fffdf9] px-2 py-2 lg:hidden">
        <div className="no-scrollbar grid gap-1" style={{ gridTemplateColumns: `repeat(${bottomTabs.length}, minmax(0, 1fr))` }}>
          {bottomTabs.map((item) => {
            const active = item.id === activeSection.id;
            return (
              <Link
                key={item.id}
                href={`/dashboard/${item.id}`}
                className={`inline-flex min-w-0 flex-col items-center rounded-lg px-1.5 py-1.5 text-[10px] font-semibold ${
                  active ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"
                }`}
              >
                <span className="relative inline-flex h-5 w-5 items-center justify-center">
                  <SectionIcon id={item.id} />
                  {getNavBadge(item.id) ? (
                    <span className="absolute -right-2 -top-2 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white">
                      {getNavBadge(item.id)}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 w-full truncate text-center">{item.label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </main>
  );
}

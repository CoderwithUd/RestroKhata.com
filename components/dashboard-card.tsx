"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import packageInfo from "@/package.json";
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
import {
  useLogoutMutation,
  useOrdersQuery,
  useReportsSummaryQuery,
  useTentantProfileQuery,
} from "@/store/api/authApi";
import { useGetInvoicesQuery } from "@/store/api/invoicesApi";
import { useGetMenuItemsQuery } from "@/store/api/menuApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  clearSession,
  selectAuthTenant,
  selectAuthUser,
} from "@/store/slices/authSlice";
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
  kpis: Array<{
    label: string;
    value: string;
    tone: "amber" | "green" | "blue" | "red";
  }>;
  modules: Array<{ title: string; description: string; value: string }>;
};

const ROLE_SECTIONS: Record<RoleKey, SectionId[]> = {
  owner: [
    "overview",
    "orders",
    "invoices",
    "tables",
    "kitchen",
    "menu",
    "staff",
    "reports",
    "inventory",
    "settings",
    "profile",
  ],
  manager: [
    "overview",
    "orders",
    "invoices",
    "tables",
    "kitchen",
    "menu",
    "staff",
    "reports",
    "profile",
  ],
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
      {
        title: "Peak Hour Window",
        description: "Rush traffic across counters.",
        value: "7:30 PM - 9:15 PM",
      },
      {
        title: "Delivery Mix",
        description: "Dine-in vs online order ratio.",
        value: "58% / 42%",
      },
      {
        title: "Staff On Shift",
        description: "Live active operations team.",
        value: "12 members",
      },
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
      {
        title: "Counter Priority",
        description: "High-priority order queue.",
        value: "6 urgent tickets",
      },
      {
        title: "Average Fulfillment",
        description: "Order completion speed.",
        value: "18 min",
      },
      {
        title: "Refund Requests",
        description: "Pending customer escalations.",
        value: "1 open",
      },
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
      {
        title: "Fast Billing",
        description: "One tap invoice issue for ready orders.",
        value: "Live now",
      },
      {
        title: "Payment Desk",
        description: "Cash and UPI settlement from one screen.",
        value: "2 modes",
      },
      {
        title: "Table Clearance",
        description: "Auto table release after payment.",
        value: "Enabled",
      },
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
      {
        title: "Category Health",
        description: "Performance by menu buckets.",
        value: "Snacks +14%",
      },
      {
        title: "Pricing Alerts",
        description: "Items below target margin.",
        value: "4 items",
      },
      {
        title: "Seasonal Promo",
        description: "Current active campaign.",
        value: "Summer Beverages",
      },
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
      {
        title: "Shift Roster",
        description: "Next shift readiness snapshot.",
        value: "Night shift full",
      },
      {
        title: "Escalation Board",
        description: "Operational tickets from team.",
        value: "2 pending",
      },
      {
        title: "Training Status",
        description: "SOP module completion.",
        value: "87% completed",
      },
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
      {
        title: "Daily P&L",
        description: "Profit and cost status.",
        value: "Healthy",
      },
      {
        title: "Channel ROI",
        description: "Performance by delivery partner.",
        value: "Best: Direct",
      },
      {
        title: "Forecast",
        description: "Expected close by tonight.",
        value: "INR 1,58,000",
      },
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
      {
        title: "Restaurant Profile",
        description: "Brand details and contact points.",
        value: "Up to date",
      },
      {
        title: "Billing",
        description: "Current SaaS plan status.",
        value: "Growth Plan",
      },
      {
        title: "Automation",
        description: "Order and alert workflows.",
        value: "5 enabled",
      },
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
      {
        title: "Hot Zone",
        description: "High movement dining area.",
        value: "Terrace",
      },
      {
        title: "Fast Turn Tables",
        description: "Tables with low delay.",
        value: "T2, T7, T11",
      },
      {
        title: "Guest Notes",
        description: "Special requests tracker.",
        value: "3 active",
      },
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
      {
        title: "Slowest Item",
        description: "Current bottleneck dish.",
        value: "Smoked Pasta",
      },
      {
        title: "Fire Alerts",
        description: "Orders crossing SLA.",
        value: "2 alerts",
      },
      {
        title: "Handoff Efficiency",
        description: "Kitchen to waiter transfer.",
        value: "93%",
      },
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
      {
        title: "Priority Purchase",
        description: "Items to buy first.",
        value: "Cheese, Lettuce",
      },
      {
        title: "Storage Health",
        description: "Cold and dry storage check.",
        value: "Stable",
      },
      {
        title: "Vendor SLA",
        description: "On-time supplier performance.",
        value: "96%",
      },
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
      {
        title: "Assigned Zone",
        description: "Primary active responsibility.",
        value: "Main Floor",
      },
      {
        title: "Today Checklist",
        description: "Pending personal tasks.",
        value: "2 pending",
      },
      {
        title: "Supervisor Note",
        description: "Latest coaching update.",
        value: "Great speed",
      },
    ],
  },
};

const APP_VERSION = `v${packageInfo.version}`;

function normalizeRole(rawRole?: string): RoleKey {
  const role = (rawRole || "manager").toLowerCase().trim();
  if (role.includes("owner") || role.includes("admin")) return "owner";
  if (
    role.includes("waiter") ||
    role.includes("server") ||
    role.includes("captain")
  )
    return "waiter";
  if (
    role.includes("kitchen") ||
    role.includes("chef") ||
    role.includes("cook")
  )
    return "kitchen";
  return "manager";
}

function toneClasses(tone: "amber" | "green" | "blue" | "red"): string {
  if (tone === "green")
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
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

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatRelativeTime(value?: string): string {
  if (!value) return "Just now";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Just now";

  const diffMs = Date.now() - timestamp;
  if (diffMs <= 0) return "Just now";

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function countStatuses(
  source: Record<string, number> | undefined,
  statuses: string[],
): number {
  if (!source) return 0;
  const normalized: Record<string, number> = {};
  Object.entries(source).forEach(([status, value]) => {
    const key = status.trim().toUpperCase();
    normalized[key] = (normalized[key] || 0) + value;
  });
  return statuses.reduce((sum, status) => {
    return sum + (normalized[status.trim().toUpperCase()] || 0);
  }, 0);
}

function isSameLocalDate(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function orderTone(status?: string): "amber" | "green" | "blue" | "red" {
  const normalized = (status || "").toUpperCase();

  if (normalized === "PLACED" || normalized === "NEW") return "amber";
  if (
    normalized === "IN_PROGRESS" ||
    normalized === "COOKING" ||
    normalized === "PREPARING"
  )
    return "red";
  if (
    normalized === "READY" ||
    normalized === "COMPLETED" ||
    normalized === "DELIVERED"
  )
    return "green";
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
  if (normalized === "RESERVED")
    return "border-blue-200 bg-blue-50 text-blue-700";
  if (normalized === "OCCUPIED")
    return "border-amber-200 bg-amber-50 text-amber-700";
  if (normalized === "BILLING")
    return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalized === "AVAILABLE")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
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
        active
          ? "bg-amber-100 text-amber-900"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-amber-200 text-amber-900" : "bg-slate-200 text-slate-600"}`}
      >
        <SectionIcon id={item.id} />
      </span>
      <span className="flex-1 truncate font-medium">{item.label}</span>
      {badge ? (
        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function SectionIcon({ id }: { id: SectionId }) {
  const common = "h-4 w-4";

  if (id === "overview") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={common}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </svg>
    );
  }

  if (id === "orders") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={common}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M8 4h8" />
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    );
  }

  if (id === "invoices") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={common}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M15 3v5h4M9 12h8M9 16h8" />
      </svg>
    );
  }

  if (id === "tables") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={common}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="4" y="6" width="16" height="8" rx="1.5" />
        <path d="M8 14v4M16 14v4" />
      </svg>
    );
  }

  if (id === "kitchen") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={common}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M4 6h12v12H4z" />
        <path d="M16 10h4M16 14h4" />
      </svg>
    );
  }

  if (id === "menu") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={common}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 4v10M10 4v10M6 9h4M14 4v16M14 12h4" />
      </svg>
    );
  }

  if (id === "staff") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={common}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="9" r="2.5" />
        <path d="M3.5 20c0-3 2.4-5 5.5-5s5.5 2 5.5 5M14 20c0-2 1.6-3.5 3.8-3.5S21.5 18 21.5 20" />
      </svg>
    );
  }

  if (id === "reports") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={common}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M4 20h16" />
        <rect x="6" y="11" width="3" height="6" />
        <rect x="11" y="8" width="3" height="9" />
        <rect x="16" y="5" width="3" height="12" />
      </svg>
    );
  }

  if (id === "inventory") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={common}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 9h16M9 9v11" />
      </svg>
    );
  }

  if (id === "settings") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={common}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="3.5" />
        <path d="M19 12a7 7 0 0 0-.1-1l2-1.4-2-3.5-2.4 1a7.3 7.3 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a7.3 7.3 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.4a7 7 0 0 0 0 2l-2 1.4 2 3.5 2.4-1a7.3 7.3 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7.3 7.3 0 0 0 1.7-1l2.4 1 2-3.5-2-1.4c.1-.3.1-.7.1-1z" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className={common}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
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
  const { data: tentantProfile, isLoading: isTenantProfileLoading } =
    useTentantProfileQuery();
  const { data: ordersPayload, isFetching: isOrdersFetching } = useOrdersQuery({
    status: ["PLACED", "IN_PROGRESS", "READY"],
    page: 1,
  });
  const subscriptionExpired = isSubscriptionExpired(
    tentantProfile?.subscription,
  );
  const { data: tablesPayload } = useGetTablesQuery();

  const role = useMemo(
    () => normalizeRole(tentantProfile?.role || user?.role),
    [tentantProfile?.role, user?.role],
  );
  const reportsEnabled = role === "owner" || role === "manager";
  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const { data: todaySummary, isFetching: isTodaySummaryFetching } =
    useReportsSummaryQuery(
      {
        period: "today",
        tzOffsetMinutes,
      },
      {
        skip: !reportsEnabled,
        pollingInterval: 30000,
        refetchOnFocus: true,
        refetchOnReconnect: true,
        refetchOnMountOrArgChange: true,
      },
    );
  const { data: weekSummary, isFetching: isWeekSummaryFetching } =
    useReportsSummaryQuery(
      {
        period: "this_week",
        tzOffsetMinutes,
      },
      {
        skip: !reportsEnabled,
        pollingInterval: 30000,
        refetchOnFocus: true,
        refetchOnReconnect: true,
        refetchOnMountOrArgChange: true,
      },
    );
  const { data: paidInvoicesPayload, isFetching: isPaidInvoicesFetching } =
    useGetInvoicesQuery(
      {
        status: "PAID",
        page: 1,
        limit: 100,
      },
      {
        pollingInterval: 30000,
        refetchOnFocus: true,
        refetchOnReconnect: true,
      },
    );
  const allowedIds = ROLE_SECTIONS[role];
  const defaultId = allowedIds[0];
  const activeId =
    section && allowedIds.includes(section as SectionId)
      ? (section as SectionId)
      : null;
  const { data: menuPayload } = useGetMenuItemsQuery(
    { page: 1, limit: 100 },
    {
      skip: activeId !== "menu",
    },
  );

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
    return (
      status === "IN_PROGRESS" || status === "COOKING" || status === "PREPARING"
    );
  }).length;
  const tablesList = tablesPayload?.items || [];
  const totalTablesCount = tablesList.length;
  const activeTablesCount = tablesList.filter((table) => table.isActive).length;
  const reservedTablesCount = tablesList.filter(
    (table) => (table.status || "").toUpperCase() === "RESERVED",
  ).length;
  const occupiedTablesCount = tablesList.filter(
    (table) => (table.status || "").toUpperCase() === "OCCUPIED",
  ).length;
  const previewTables = tablesList.slice(0, 18);
  const menuItems = menuPayload?.items || [];
  const menuTotalCount = menuItems.length;
  const menuAvailableCount = menuItems.filter(
    (item) => item.isAvailable,
  ).length;
  const menuUnavailableCount = menuTotalCount - menuAvailableCount;
  const menuCategoriesCount = new Set(
    menuItems
      .map((item) => (item.categoryName || "").trim())
      .filter((value) => Boolean(value)),
  ).size;
  const menuAvgPrice = menuTotalCount
    ? Math.round(
        (menuItems.reduce((sum, item) => sum + (item.price || 0), 0) /
          menuTotalCount) *
          100,
      ) / 100
    : 0;
  const todaySales = todaySummary?.sales;
  const weekSales = weekSummary?.sales;
  const todayOrdersByStatus = todaySummary?.orders.byStatus;
  const todayInvoicesByStatus = todaySummary?.invoices.byStatus;
  const weekOrdersByStatus = weekSummary?.orders.byStatus;
  const weekInvoicesByStatus = weekSummary?.invoices.byStatus;
  const reportLoading =
    reportsEnabled && (isTodaySummaryFetching || isWeekSummaryFetching);
  const now = new Date();
  const paidInvoicesToday = (paidInvoicesPayload?.items || []).filter(
    (invoice) => {
      const paidAt =
        invoice.payment?.paidAt || invoice.updatedAt || invoice.createdAt;
      if (!paidAt) return false;
      const paidDate = new Date(paidAt);
      if (Number.isNaN(paidDate.getTime())) return false;
      return isSameLocalDate(paidDate, now);
    },
  );
  const paidInvoicesTodayAmount = paidInvoicesToday.reduce((sum, invoice) => {
    const amount =
      invoice.payment?.paidAmount ??
      invoice.totalDue ??
      invoice.grandTotal ??
      invoice.subTotal ??
      0;
    return sum + amount;
  }, 0);
  const todayPaidSalesValue = reportsEnabled
    ? Math.max(todaySales?.paidTotal ?? 0, paidInvoicesTodayAmount)
    : paidInvoicesTodayAmount;
  const todayKitchenQueue = countStatuses(todayOrdersByStatus, [
    "PLACED",
    "NEW",
    "IN_PROGRESS",
    "COOKING",
    "PREPARING",
  ]);
  const todayReadyCount = countStatuses(todayOrdersByStatus, ["READY"]);
  const todayServedCount = countStatuses(todayOrdersByStatus, [
    "SERVED",
    "COMPLETED",
    "DELIVERED",
  ]);
  const todayCancelledCount = countStatuses(todayOrdersByStatus, ["CANCELLED"]);
  const todayPendingInvoices = countStatuses(todayInvoicesByStatus, [
    "ISSUED",
    "PENDING",
    "UNPAID",
  ]);
  const todayPaidInvoices = countStatuses(todayInvoicesByStatus, ["PAID"]);
  const weekPendingInvoices = countStatuses(weekInvoicesByStatus, [
    "ISSUED",
    "PENDING",
    "UNPAID",
  ]);
  const weekPaidInvoices = countStatuses(weekInvoicesByStatus, ["PAID"]);
  const weekOrderReady = countStatuses(weekOrdersByStatus, ["READY"]);
  const weekOrderServed = countStatuses(weekOrdersByStatus, [
    "SERVED",
    "COMPLETED",
    "DELIVERED",
  ]);
  const weekOrderCancelled = countStatuses(weekOrdersByStatus, ["CANCELLED"]);
  const kitchenTickets = (ordersPayload?.items || []).slice(0, 5).map((order) => {
    const label = order.tableName || order.sourceLabel || order.orderNumber || "Order";
    return {
      id: order.id,
      label,
      time: formatRelativeTime(order.updatedAt || order.createdAt),
      items: order.itemsSummary || "Order items unavailable",
      status: order.status || "PLACED",
      tone: orderTone(order.status),
    };
  });

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
  const memberName =
    tentantProfile?.user?.name || user?.name || "Restaurant User";
  const memberRole = roleLabel(role);
  const tenantSlug = tentantProfile?.tenant?.slug || tenant?.slug || "";
  const bottomTabs = navSections.slice(0, 5);
  const accountSectionId = allowedIds.includes("profile")
    ? "profile"
    : allowedIds.includes("settings")
      ? "settings"
      : null;
  const handleDrawerNavigate = (target: SectionId) => {
    setDrawerOpen(false);
    router.push(`/dashboard/${target}`);
  };
  const getNavBadge = (id: SectionId): string | undefined => {
    if (id === "orders") return `${activeOrderCount}`;
    if (id === "kitchen") return `${kitchenActiveCount}`;
    if (id === "tables") return `${totalTablesCount}`;
    if (id === "menu" && menuTotalCount) return `${menuTotalCount}`;
    return undefined;
  };
  const activeSectionKpis =
    activeSection.id === "overview"
      ? [
          {
            label: "Today's Revenue",
            value: formatMoney(todayPaidSalesValue),
            tone: "amber" as const,
          },
          {
            label: "Today's Orders",
            value: `${reportsEnabled ? todaySummary?.orders.total ?? 0 : activeOrderCount}`,
            tone: "green" as const,
          },
          {
            label: "Tables Occupied",
            value: `${occupiedTablesCount}/${totalTablesCount || 0}`,
            tone: "blue" as const,
          },
          {
            label: "Avg Ticket",
            value: reportsEnabled
              ? formatMoney(todaySales?.avgTicket ?? 0)
              : paidInvoicesToday.length
                ? formatMoney(todayPaidSalesValue / paidInvoicesToday.length)
                : formatMoney(0),
            tone: "red" as const,
          },
        ]
      : activeSection.id === "reports"
        ? [
            {
              label: "Sales Today",
              value: formatMoney(todaySales?.paidTotal ?? 0),
              tone: "green" as const,
            },
            {
              label: "Sales This Week",
              value: formatMoney(weekSales?.paidTotal ?? 0),
              tone: "amber" as const,
            },
            {
              label: "Expenses This Week",
              value: formatMoney(weekSummary?.expenses.total ?? 0),
              tone: "red" as const,
            },
            {
              label: "Net Result (Week)",
              value: formatMoney(weekSummary?.profitLoss.netResult ?? 0),
              tone:
                (weekSummary?.profitLoss.netResult ?? 0) >= 0
                  ? ("green" as const)
                  : ("red" as const),
            },
          ]
        : activeSection.id === "tables"
          ? [
              {
                label: "Total Tables",
                value: `${totalTablesCount}`,
                tone: "amber" as const,
              },
              {
                label: "Active",
                value: `${activeTablesCount}`,
                tone: "green" as const,
              },
              {
                label: "Reserved",
                value: `${reservedTablesCount}`,
                tone: "blue" as const,
              },
              {
                label: "Occupied",
                value: `${occupiedTablesCount}`,
                tone: "red" as const,
              },
            ]
          : activeSection.id === "menu"
            ? [
                {
                  label: "Total Items",
                  value: `${menuTotalCount}`,
                  tone: "blue" as const,
                },
                {
                  label: "Available",
                  value: `${menuAvailableCount}`,
                  tone: "green" as const,
                },
                {
                  label: "Hidden",
                  value: `${menuUnavailableCount}`,
                  tone: "red" as const,
                },
                {
                  label: menuCategoriesCount ? "Avg Price" : "Categories",
                  value: menuCategoriesCount
                    ? `INR ${menuAvgPrice}`
                    : `${menuCategoriesCount}`,
                  tone: "amber" as const,
                },
              ]
            : activeSection.kpis;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6f4ef] text-slate-900 lg:h-screen lg:overflow-hidden">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,#fbe8c6_0%,transparent_38%),radial-gradient(circle_at_bottom_left,#e4efe7_0%,transparent_35%)]" />

      <div className="mx-auto flex w-full max-w-[1460px] gap-4 px-3 py-3 md:px-4 md:py-4 lg:gap-6 lg:px-6 lg:py-6">
        <aside className="hidden h-[calc(100vh-3rem)] w-[258px] shrink-0 rounded-[28px] border border-[#e6dfd1] bg-[#fffdf9] p-3.5 shadow-sm lg:sticky lg:top-3 lg:flex lg:flex-col">
          <div className="border-b border-[#eee7d8] pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-sm font-bold text-white shadow-lg shadow-amber-500/20">
                BD
              </div>
              <span className="rounded-full border border-[#eadfc9] bg-[#fff6e7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                {APP_VERSION}
              </span>
            </div>
            <h2 className="mt-3 truncate text-base font-semibold text-slate-900">
              {tenantName}
            </h2>
            {accountSectionId ? (
              <button
                type="button"
                onClick={() => router.push(`/dashboard/${accountSectionId}`)}
                className="mt-2 block text-left"
              >
                <p className="truncate text-sm font-medium text-slate-800">
                  {memberName}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{memberRole}</p>
              </button>
            ) : (
              <div className="mt-2">
                <p className="truncate text-sm font-medium text-slate-800">
                  {memberName}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{memberRole}</p>
              </div>
            )}
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
        </aside>

        <div className="min-w-0 flex-1 lg:flex lg:h-[calc(100vh-3rem)] lg:flex-col">
          <header className="sticky top-0 z-20 rounded-[26px] border border-[#e6dfd1] bg-[#fffdf9]/95 px-3 py-3 shadow-sm backdrop-blur sm:top-3 md:px-4 lg:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e6dfd1] bg-white text-slate-700 shadow-sm lg:hidden"
                  aria-label="Open menu"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold sm:text-xl">
                    {activeSection.label}
                  </h1>
                  <p className="mt-0.5 truncate text-xs text-slate-500 sm:text-sm">
                    {activeSection.subtitle}
                  </p>
                  <p className="hidden">
                    {todayCompact} · {memberName}
                  </p>
                </div>
              </div>

              <div className="hidden">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Store Snapshot
                </p>
                <p className="mt-2 truncate text-base font-semibold text-slate-900">
                  {tenantName}
                </p>
                <p className="mt-1 text-xs text-slate-500">{memberName}</p>
                <p className="mt-3 text-xs text-slate-500">{todayText}</p>
              </div>
            </div>

            <div className="hidden">
              {accountSectionId ? (
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/${accountSectionId}`)}
                  className="hidden"
                >
                  Profile
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => router.push("/dashboard/orders/new")}
                className="hidden rounded-xl border border-[#e6dfd1] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-amber-50 md:inline-flex"
              >
                + New Order
              </button>
              {allowedIds.includes("invoices") ? (
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/invoices")}
                  className="hidden items-center justify-center rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 sm:inline-flex"
                >
                  Billing
                </button>
              ) : null}
              {tenantSlug ? (
                <Link href={`/${tenantSlug}`} className="hidden">
                  Public URL
                </Link>
              ) : null}
              <button
                type="button"
                onClick={onLogout}
                disabled={isLoggingOut}
                className="hidden"
              >
                {isLoggingOut ? "Signing out..." : "Logout"}
              </button>
            </div>
          </header>

          <div className="no-scrollbar pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1 lg:pb-0">
{
   ( activeSection.id === "overview" || activeSection?.id === "reports" )&&
          <section className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-1 sm:gap-3">
            {activeSectionKpis.map((kpi) => (
              <article
                key={kpi.label}
                className="w-[150px] shrink-0 rounded-xl border border-[#e6dfd1] bg-[#fffdf9] p-2 shadow-sm sm:w-[190px] sm:rounded-2xl sm:p-3 md:w-[220px] md:p-4
                 shadow-sm"
              >
                <div
                  className={`mb-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide sm:mb-2 sm:px-2.5 sm:py-1 sm:text-[10px]
                    ${toneClasses(kpi.tone)}`}
                >
                  {kpi.label}
                </div>

                <p className="text-base sm:text-xl md:text-2xl font-semibold text-slate-900">
                  {kpi.value}
                </p>
              </article>
            ))}
          </section>
}
          {activeSection.id === "overview" ? (
            <>
              <section className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eee7d8] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">Table Floor Plan</p>
                      <p className="text-xs text-slate-500">
                        Tap occupied table to open its order
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs">
                        All {totalTablesCount}
                      </span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
                        Active {activeTablesCount}
                      </span>
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                        Reserved {reservedTablesCount}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
                    {previewTables.length ? (
                      previewTables.map((table) => (
                        <button
                          key={table.id}
                          type="button"
                          onClick={() => {
                            const status = (table.status || "").toUpperCase();
                            if (status === "OCCUPIED" || status === "BILLING") {
                              router.push(`/dashboard/orders/items?tableId=${encodeURIComponent(table.id)}`);
                              return;
                            }
                            router.push("/dashboard/tables");
                          }}
                          className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-xs font-medium transition hover:scale-[1.02] ${tableStatusClass(
                            table.status,
                          )}`}
                        >
                          <span className="text-sm font-semibold">
                            T{table.number}
                          </span>
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
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded bg-emerald-400" />
                        Available
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded bg-blue-400" />
                        Reserved
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded bg-amber-400" />
                        Occupied
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded bg-rose-400" />
                        Billing
                      </span>
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
                      <p className="text-xs text-slate-500">
                        {isOrdersFetching
                          ? "Syncing..."
                          : `${activeOrderCount} active`}
                      </p>
                    </div>
                    <button
                      className="rounded-lg border border-[#e6dfd1] bg-white px-3 py-1.5 text-xs"
                      onClick={() => router.push("/dashboard/orders")}
                    >
                      View all
                    </button>
                  </div>
                  <div className="space-y-3 p-4">
                    {liveOrders.length ? (
                      liveOrders.map((order, key) => (
                        <div
                          key={order.id}
                          className="flex items-center gap-3 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
                        >
                          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-amber-700">
                            {key + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {order.title}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {order.items}
                            </p>
                          </div>
                          <span
                            className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${toneClasses(order.tone)}`}
                          >
                            {order.status}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">
                        No active orders right now.
                      </p>
                    )}
                  </div>
                </article>
              </section>

              <section className="mt-4 grid gap-4 xl:grid-cols-2">
                <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#eee7d8] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">Kitchen Queue</p>
                      <p className="text-xs text-slate-500">
                        {isOrdersFetching
                          ? "Syncing live orders..."
                          : `${kitchenTickets.length} active tickets`}
                      </p>
                    </div>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-700">
                      {kitchenActiveCount} Cooking
                    </span>
                  </div>
                  <div className="space-y-3 p-4">
                    {kitchenTickets.length ? (
                      kitchenTickets.map((ticket) => (
                        <div
                          key={ticket.id}
                          className={`rounded-xl border-l-4 border p-3 ${
                            ticket.tone === "red"
                              ? "border-rose-300 bg-rose-50"
                              : ticket.tone === "green"
                                ? "border-emerald-300 bg-emerald-50"
                                : ticket.tone === "blue"
                                  ? "border-blue-300 bg-blue-50"
                                  : "border-amber-300 bg-amber-50"
                          }`}
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold">
                              {ticket.label}
                            </p>
                            <p className="shrink-0 text-xs text-slate-500">
                              {ticket.time}
                            </p>
                          </div>
                          <p className="truncate text-xs text-slate-600">
                            {ticket.items}
                          </p>
                          <div className="mt-2">
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${toneClasses(ticket.tone)}`}
                            >
                              {ticket.status}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">
                        No active kitchen tickets.
                      </p>
                    )}
                  </div>
                </article>

                <div className="grid gap-4">
                  <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#eee7d8] px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold">Today Summary</p>
                        <p className="text-xs text-slate-500">
                          {reportsEnabled
                            ? reportLoading
                              ? "Refreshing data..."
                              : todaySummary?.range?.from
                                ? "From reports API"
                                : "No records yet"
                            : "Visible for owner/manager"}
                        </p>
                      </div>
                      {reportsEnabled ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                          Paid {todayPaidInvoices}
                        </span>
                      ) : null}
                    </div>
                    <div className="grid gap-2 p-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-medium text-slate-500">
                          Paid Sales
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {reportsEnabled
                            ? formatMoney(todayPaidSalesValue)
                            : isPaidInvoicesFetching
                              ? "Syncing..."
                              : formatMoney(todayPaidSalesValue)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-medium text-slate-500">
                          Kitchen Queue
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {reportsEnabled
                            ? `${todayKitchenQueue}`
                            : `${kitchenActiveCount}`}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-medium text-slate-500">
                          Ready / Served
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {reportsEnabled
                            ? `${todayReadyCount} / ${todayServedCount}`
                            : `- / -`}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-medium text-slate-500">
                          Pending Invoices
                        </p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {reportsEnabled ? `${todayPendingInvoices}` : "-"}
                        </p>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
                    <div className="border-b border-[#eee7d8] px-4 py-3">
                      <p className="text-sm font-semibold">This Week</p>
                      <p className="text-xs text-slate-500">
                        Orders, invoices, expense and net result
                      </p>
                    </div>
                    <div className="space-y-2 p-4 text-xs">
                      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="text-slate-600">Paid Sales</span>
                        <span className="font-semibold text-slate-900">
                          {reportsEnabled
                            ? formatMoney(weekSales?.paidTotal ?? 0)
                            : "Role restricted"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="text-slate-600">Ready / Served</span>
                        <span className="font-semibold text-slate-900">
                          {reportsEnabled
                            ? `${weekOrderReady} / ${weekOrderServed}`
                            : "- / -"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="text-slate-600">Paid / Pending Bills</span>
                        <span className="font-semibold text-slate-900">
                          {reportsEnabled
                            ? `${weekPaidInvoices} / ${weekPendingInvoices}`
                            : "- / -"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="text-slate-600">Expenses</span>
                        <span className="font-semibold text-slate-900">
                          {reportsEnabled
                            ? formatMoney(weekSummary?.expenses.total ?? 0)
                            : "Role restricted"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="text-slate-600">Net Result</span>
                        <span
                          className={`font-semibold ${
                            (weekSummary?.profitLoss.netResult ?? 0) >= 0
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}
                        >
                          {reportsEnabled
                            ? formatMoney(weekSummary?.profitLoss.netResult ?? 0)
                            : "Role restricted"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="text-slate-600">Cancelled Orders</span>
                        <span className="font-semibold text-slate-900">
                          {reportsEnabled ? weekOrderCancelled : "-"}
                        </span>
                      </div>
                    </div>
                  </article>
                </div>
              </section>
            </>
          ) : activeSection.id === "reports" ? (
            <section className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eee7d8] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">Reports Summary</p>
                      <p className="text-xs text-slate-500">
                        {reportLoading
                          ? "Syncing report data..."
                        : "Live values from /reports/summary + paid invoices"}
                      </p>
                    </div>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
                    {todaySummary?.range?.period || "today"}
                  </span>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-medium text-slate-500">
                      Today Sales
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {formatMoney(todayPaidSalesValue)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Avg Ticket {formatMoney(todaySales?.avgTicket ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-medium text-slate-500">
                      This Week Sales
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {formatMoney(weekSales?.paidTotal ?? 0)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Net {formatMoney(weekSummary?.profitLoss.netResult ?? 0)}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 border-t border-[#eee7d8] p-4 md:grid-cols-2">
                  <div className="rounded-xl border border-[#e4dccb] bg-[#fffcf7] p-3">
                    <p className="text-xs font-semibold text-slate-700">
                      Order Status (Today)
                    </p>
                    <div className="mt-2 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Placed</span>
                        <span className="font-semibold">
                          {countStatuses(todayOrdersByStatus, ["PLACED", "NEW"])}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">In Progress</span>
                        <span className="font-semibold">
                          {countStatuses(todayOrdersByStatus, [
                            "IN_PROGRESS",
                            "COOKING",
                            "PREPARING",
                          ])}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Ready / Served</span>
                        <span className="font-semibold">
                          {todayReadyCount} / {todayServedCount}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Cancelled</span>
                        <span className="font-semibold">{todayCancelledCount}</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#e4dccb] bg-[#fffcf7] p-3">
                    <p className="text-xs font-semibold text-slate-700">
                      Invoice Status
                    </p>
                    <div className="mt-2 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Today Paid</span>
                        <span className="font-semibold">{todayPaidInvoices}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Today Pending</span>
                        <span className="font-semibold">{todayPendingInvoices}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Week Paid</span>
                        <span className="font-semibold">{weekPaidInvoices}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Week Pending</span>
                        <span className="font-semibold">{weekPendingInvoices}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] shadow-sm">
                <div className="border-b border-[#eee7d8] px-4 py-3">
                  <p className="text-sm font-semibold">Finance Snapshot</p>
                  <p className="text-xs text-slate-500">
                    Weekly profit and expense from reports API
                  </p>
                </div>
                <div className="space-y-2 p-4 text-xs">
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-slate-600">Gross Sales</span>
                    <span className="font-semibold text-slate-900">
                      {formatMoney(weekSales?.grossSales ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-slate-600">Discounts</span>
                    <span className="font-semibold text-slate-900">
                      {formatMoney(weekSales?.discountTotal ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-slate-600">Tax</span>
                    <span className="font-semibold text-slate-900">
                      {formatMoney(weekSales?.taxTotal ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-slate-600">Net Sales</span>
                    <span className="font-semibold text-slate-900">
                      {formatMoney(weekSales?.netSales ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-slate-600">Expenses</span>
                    <span className="font-semibold text-slate-900">
                      {formatMoney(weekSummary?.expenses.total ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-slate-600">Profit</span>
                    <span className="font-semibold text-emerald-700">
                      {formatMoney(weekSummary?.profitLoss.profit ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-slate-600">Loss</span>
                    <span className="font-semibold text-rose-700">
                      {formatMoney(weekSummary?.profitLoss.loss ?? 0)}
                    </span>
                  </div>
                </div>
                {weekSummary?.profitLoss.note ? (
                  <p className="border-t border-[#eee7d8] px-4 py-3 text-[11px] text-slate-500">
                    {weekSummary.profitLoss.note}
                  </p>
                ) : null}
              </article>
            </section>
          ) : activeSection.id === "orders" ? (
            <section className="mt-4">
              <OrdersWorkspace rawRole={tentantProfile?.role || user?.role} />
            </section>
          ) : activeSection.id === "kitchen" ? (
            <section className="mt-4">
              <OrdersWorkspace rawRole="kitchen" />
            </section>
          ) : activeSection.id === "invoices" ? (
            <section className="mt-4">
              <InvoicesWorkspace rawRole={tentantProfile?.role || user?.role} />
            </section>
          ) : activeSection.id === "tables" ? (
            <TablesWorkspace tenantName={tenantName} tenantSlug={tenantSlug} />
          ) : activeSection.id === "menu" ? (
            <MenuWorkspace tenantName={tenantName} tenantSlug={tenantSlug} />
          ) : activeSection.id === "staff" ? (
            <StaffWorkspace tenantName={tenantName} />
          ) : activeSection.id === "profile" ||
            activeSection.id === "settings" ? (
            <ProfileSettingsWorkspace
              title={
                activeSection.id === "settings"
                  ? "Business Settings"
                  : "Profile & Settings"
              }
            />
          ) : (
            <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activeSection.modules.map((module) => (
                <article
                  key={module.title}
                  className="rounded-2xl border border-[#e6dfd1] bg-[#fffdf9] p-4 shadow-sm"
                >
                  <p className="text-sm font-semibold">{module.title}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {module.description}
                  </p>
                  <p className="mt-4 text-base font-semibold text-amber-700">
                    {module.value}
                  </p>
                </article>
              ))}
            </section>
          )}
          </div>
        </div>
      </div>


      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/35"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          />
          <aside className="no-scrollbar absolute left-0 top-0 h-full w-[88%] max-w-[340px] overflow-y-auto border-r border-[#e6dfd1] bg-[#fffdf9] p-4 shadow-2xl">
            <div className="rounded-[28px] border border-[#eadfca] bg-[linear-gradient(145deg,#fff8eb_0%,#fffdf9_55%,#f5fbf8_100%)] p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-sm font-bold text-white shadow-lg shadow-amber-500/20">
                    BD
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-slate-900">
                      {tenantName}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">{APP_VERSION}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#e6dfd1] bg-white text-slate-700"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>

              <div className="mt-4">
                {accountSectionId ? (
                  <button
                    type="button"
                    onClick={() => handleDrawerNavigate(accountSectionId)}
                    className="block w-full rounded-2xl border border-white/70 bg-white/80 p-3 text-left"
                  >
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {memberName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{memberRole}</p>
                  </button>
                ) : (
                  <div className="rounded-2xl border border-white/70 bg-white/80 p-3">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {memberName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{memberRole}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Navigation
              </p>
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
            </div>
          </aside>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e6dfd1] bg-[#fffdf9] px-2 py-2 lg:hidden">
        <div
          className="no-scrollbar grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${bottomTabs.length}, minmax(0, 1fr))`,
          }}
        >
          {bottomTabs.map((item) => {
            const active = item.id === activeSection.id;
            return (
              <Link
                key={item.id}
                href={`/dashboard/${item.id}`}
                className={`inline-flex min-w-0 flex-col items-center rounded-lg px-1.5 py-1.5 text-[10px] font-semibold ${
                  active
                    ? "bg-amber-100 text-amber-900"
                    : "bg-slate-100 text-slate-600"
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
                <span className="mt-0.5 w-full truncate text-center">
                  {item.label.split(" ")[0]}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </main>
  );
}

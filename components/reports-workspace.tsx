"use client";

import { downloadMonthlyAccountReportPdf } from "@/lib/monthly-account-report-pdf";
import { useReportsMonthlyQuery } from "@/store/api/authApi";
import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportDay = {
  date: string;
  day: string;
  label: string;
  orders: number;
  invoices: number;
  paidInvoices: number;
  sales: number;
  expenses: number;
  profit: number;
};

type ReportMonth = {
  month: string;
  label: string;
  orders: number;
  invoices: number;
  paidInvoices: number;
  sales: number;
  expenses: number;
  profit: number;
};

type ReportsSummary = {
  timezone?: string;
  range?: { type?: string; from?: string; to?: string };
  thisMonth?: {
    month?: string;
    label?: string;
    orders?: number;
    invoices?: number;
    paidInvoices?: number;
    sales?: number;
    expenses?: number;
    profit?: number;
  };
  totals?: {
    orders?: number;
    invoices?: number;
    paidInvoices?: number;
    sales?: number;
    expenses?: number;
    profit?: number;
  };
  days?: ReportDay[];
};

type ReportsWorkspaceProps = {
  reportsSummary?: ReportsSummary;
  isReportsFetching?: boolean;
  tenantName?: string;
};

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatMoneyShort(value: number): string {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value}`;
}

function formatMonthLabel(value?: string): string {
  if (!value) return new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function formatDisplayDate(value?: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

type KpiTone = "amber" | "blue" | "green" | "red" | "slate";

const KPI_STYLES: Record<KpiTone, { accent: string; value: string; bg: string; border: string }> = {
  amber: { accent: "bg-amber-500", value: "text-amber-700", bg: "bg-amber-50/40", border: "border-amber-100" },
  blue:  { accent: "bg-blue-500",  value: "text-blue-700",  bg: "bg-blue-50/40",  border: "border-blue-100"  },
  green: { accent: "bg-emerald-500", value: "text-emerald-700", bg: "bg-emerald-50/40", border: "border-emerald-100" },
  red:   { accent: "bg-rose-500",  value: "text-rose-700",  bg: "bg-rose-50/40",  border: "border-rose-100"  },
  slate: { accent: "bg-slate-400", value: "text-slate-700", bg: "bg-white",        border: "border-slate-200" },
};

function KpiCard({ label, value, hint, tone = "slate" }: {
  label: string; value: string; hint?: string; tone?: KpiTone;
}) {
  const s = KPI_STYLES[tone];
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm ${s.bg} ${s.border}`}>
      <div className={`absolute left-0 top-0 h-full w-[3px] ${s.accent}`} />
      <p className="pl-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`pl-1 mt-2 text-xl font-semibold leading-tight sm:text-2xl ${s.value}`}>{value}</p>
      {hint && <p className="pl-1 mt-1.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

// ─── Recharts: Day Chart ───────────────────────────────────────────────────────

function DayBarChart({ days, todayDate }: { days: ReportDay[]; todayDate: string }) {
  const chartData = days.map((d) => ({
    name: d.day || d.date.slice(8),
    date: d.date,
    Sales: d.sales,
    Orders: d.orders,
    Invoices: d.invoices,
    isToday: d.date === todayDate,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="sales" orientation="left" tickFormatter={formatMoneyShort} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52} />
        <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          formatter={(value, name) => {
            const numericValue = typeof value === "number" ? value : Number(value ?? 0);
            return name === "Sales" ? [formatMoney(numericValue), name] : [value, name];
          }}
          contentStyle={{ fontSize: 12, borderRadius: 12, border: "0.5px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.08)", padding: "10px 14px" }}
          cursor={{ fill: "rgba(241,245,249,0.7)" }}
        />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#64748b", paddingTop: 12 }} />
        <Bar yAxisId="sales" dataKey="Sales" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={44} />
        <Bar yAxisId="count" dataKey="Orders" fill="#22c55e" radius={[6, 6, 0, 0]} maxBarSize={24} />
        <Bar yAxisId="count" dataKey="Invoices" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Recharts: Month Chart ─────────────────────────────────────────────────────

function MonthBarChart({ months }: { months: ReportMonth[] }) {
  const chartData = months.map((m) => ({
    name: m.label,
    Sales: m.sales,
    Orders: m.orders,
    Invoices: m.invoices,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={42} />
        <YAxis yAxisId="sales" orientation="left" tickFormatter={formatMoneyShort} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52} />
        <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          formatter={(value, name) => {
            const numericValue = typeof value === "number" ? value : Number(value ?? 0);
            return name === "Sales" ? [formatMoney(numericValue), name] : [value, name];
          }}
          contentStyle={{ fontSize: 12, borderRadius: 12, border: "0.5px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.08)", padding: "10px 14px" }}
          cursor={{ fill: "rgba(241,245,249,0.7)" }}
        />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#64748b", paddingTop: 12 }} />
        <Bar yAxisId="sales" dataKey="Sales" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={38} />
        <Bar yAxisId="count" dataKey="Orders" fill="#22c55e" radius={[6, 6, 0, 0]} maxBarSize={20} />
        <Bar yAxisId="count" dataKey="Invoices" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Stat Pill (inside mobile cards) ─────────────────────────────────────────

function StatPill({ label, value, valueClass = "text-slate-800" }: {
  label: string; value: string; valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      <span className={`text-sm font-semibold leading-snug ${valueClass}`}>{value}</span>
    </div>
  );
}

// ─── Mobile Day Cards ─────────────────────────────────────────────────────────

function DayCards({ days, todayDate }: { days: ReportDay[]; todayDate: string }) {
  return (
    <div className="space-y-2.5 lg:hidden">
      {days.map((day) => {
        const isToday = day.date === todayDate;
        return (
          <div
            key={day.date}
            className={`rounded-2xl border p-4 ${
              isToday
                ? "border-amber-200 bg-gradient-to-br from-amber-50 to-amber-50/20"
                : "border-slate-200 bg-white"
            }`}
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                {isToday && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
                <div>
                  <p className={`text-sm font-semibold leading-tight ${isToday ? "text-amber-900" : "text-slate-900"}`}>
                    {day.label || day.day}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{formatDisplayDate(day.date)}</p>
                </div>
              </div>
              {isToday && (
                <span className="shrink-0 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">
                  Today
                </span>
              )}
            </div>

            {/* Sales highlight */}
            <div className={`mb-2.5 flex items-center justify-between rounded-xl px-3 py-2.5 ${isToday ? "bg-amber-100/60" : "bg-slate-50"}`}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sales</span>
              <span className="text-base font-semibold text-slate-900">{formatMoney(day.sales)}</span>
            </div>

            {/* Stat pills */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatPill label="Orders" value={`${day.orders}`} />
              <StatPill label="Invoices" value={`${day.invoices}`} />
              <StatPill label="Paid Bills" value={`${day.paidInvoices}`} valueClass="text-emerald-700" />
              <StatPill
                label="Profit"
                value={formatMoney(day.profit)}
                valueClass={day.profit >= 0 ? "text-emerald-700" : "text-rose-700"}
              />
            </div>

            {/* Expenses footer */}
            <div className="mt-2.5 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Expenses</span>
              <span className="text-sm font-medium text-slate-600">{formatMoney(day.expenses)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Mobile Month Cards ───────────────────────────────────────────────────────

function MonthCards({ months }: { months: ReportMonth[] }) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  return (
    <div className="space-y-2.5 lg:hidden">
      {[...months].reverse().map((month) => {
        const isCurrent = month.month === currentMonth;
        return (
          <div
            key={month.month}
            className={`rounded-2xl border p-4 ${
              isCurrent
                ? "border-blue-200 bg-gradient-to-br from-blue-50 to-blue-50/20"
                : "border-slate-200 bg-white"
            }`}
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                {isCurrent && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                <div>
                  <p className={`text-sm font-semibold leading-tight ${isCurrent ? "text-blue-900" : "text-slate-900"}`}>
                    {month.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{month.month}</p>
                </div>
              </div>
              {isCurrent && (
                <span className="shrink-0 rounded-full border border-blue-200 bg-blue-100 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700">
                  Current
                </span>
              )}
            </div>

            {/* Sales highlight */}
            <div className={`mb-2.5 flex items-center justify-between rounded-xl px-3 py-2.5 ${isCurrent ? "bg-blue-100/50" : "bg-slate-50"}`}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sales</span>
              <span className="text-base font-semibold text-slate-900">{formatMoney(month.sales)}</span>
            </div>

            {/* Stat pills */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatPill label="Orders" value={`${month.orders}`} />
              <StatPill label="Invoices" value={`${month.invoices}`} />
              <StatPill label="Paid Bills" value={`${month.paidInvoices}`} valueClass="text-emerald-700" />
              <StatPill
                label="Profit"
                value={formatMoney(month.profit)}
                valueClass={month.profit >= 0 ? "text-emerald-700" : "text-rose-700"}
              />
            </div>

            {/* Expenses footer */}
            <div className="mt-2.5 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Expenses</span>
              <span className="text-sm font-medium text-slate-600">{formatMoney(month.expenses)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Desktop Table ────────────────────────────────────────────────────────────

type TableRow = {
  key: string;
  dateLabel: string;
  dateSub: string;
  isHighlight: boolean;
  highlightLabel?: string;
  highlightColor?: "amber" | "blue";
  orders: number;
  invoices: number;
  paidInvoices: number;
  sales: number;
  expenses: number;
  profit: number;
};

const HIGHLIGHT_COLORS = {
  amber: {
    row: "bg-amber-50/50",
    dot: "bg-amber-500",
    label: "text-amber-900",
    badge: "border-amber-200 bg-amber-100 text-amber-700",
  },
  blue: {
    row: "bg-blue-50/50",
    dot: "bg-blue-500",
    label: "text-blue-900",
    badge: "border-blue-200 bg-blue-100 text-blue-700",
  },
};

type TableFooter = {
  orders: number;
  invoices: number;
  paidInvoices: number;
  sales: number;
  expenses: number;
  profit: number;
};

function DataTable({ rows, footer }: { rows: TableRow[]; footer?: TableFooter }) {
  const headers = ["Date / Month", "Orders", "Invoices", "Paid Bills", "Sales", "Expenses", "Profit"];

  return (
    <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white lg:block">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              {headers.map((h, i) => (
                <th
                  key={h}
                  className={`px-5 py-3.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 ${
                    i === 0 ? "text-left" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const hc = r.isHighlight ? HIGHLIGHT_COLORS[r.highlightColor ?? "amber"] : null;
              return (
                <tr key={r.key} className={`transition-colors hover:bg-slate-50 ${hc?.row ?? ""}`}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      {hc && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${hc.dot}`} />}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${hc ? hc.label : "text-slate-800"}`}>
                            {r.dateLabel}
                          </span>
                          {r.highlightLabel && (
                            <span className={`rounded-full border px-2 py-px text-[9px] font-semibold ${hc?.badge ?? ""}`}>
                              {r.highlightLabel}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400">{r.dateSub}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-slate-600">{r.orders}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-slate-600">{r.invoices}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums font-medium text-emerald-600">{r.paidInvoices}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-900">{formatMoney(r.sales)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-slate-500">{formatMoney(r.expenses)}</td>
                  <td className={`px-5 py-3.5 text-right tabular-nums font-semibold ${r.profit >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                    {formatMoney(r.profit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {footer && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  All Time Total
                </td>
                <td className="px-5 py-4 text-right tabular-nums font-semibold text-slate-700">{footer.orders}</td>
                <td className="px-5 py-4 text-right tabular-nums font-semibold text-slate-700">{footer.invoices}</td>
                <td className="px-5 py-4 text-right tabular-nums font-semibold text-emerald-700">{footer.paidInvoices}</td>
                <td className="px-5 py-4 text-right tabular-nums font-semibold text-slate-900">{formatMoney(footer.sales)}</td>
                <td className="px-5 py-4 text-right tabular-nums font-semibold text-slate-700">{formatMoney(footer.expenses)}</td>
                <td className={`px-5 py-4 text-right tabular-nums font-semibold ${footer.profit >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  {formatMoney(footer.profit)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── Shared UI Pieces ─────────────────────────────────────────────────────────

function Section({ title, subtitle, badge, badgeTone = "amber", action, children }: {
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: "amber" | "blue";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const badgeCls =
    badgeTone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-base font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {badge && (
            <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${badgeCls}`}>
              {badge}
            </span>
          )}
          {action}
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

function ChartPanel({ title, subtitle, children }: {
  title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-slate-100" />
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

function EmptyState({ loading, label }: { loading: boolean; label: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
      {loading ? "Loading…" : label}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReportsWorkspace({
  reportsSummary,
  isReportsFetching = false,
  tenantName,
}: ReportsWorkspaceProps) {
  const { data: reportsMonthly, isFetching: isMonthlyFetching } = useReportsMonthlyQuery();
  const [activeTab, setActiveTab] = useState<"month" | "all">("month");

  const summaryDays: ReportDay[] = reportsSummary?.days ?? [];
  const totals = reportsSummary?.totals;
  const thisMonth = reportsSummary?.thisMonth;
  const todayDate = new Date().toISOString().split("T")[0];
  const currentMonthStr = new Date().toISOString().slice(0, 7);

  const rangeFrom = reportsSummary?.range?.from ?? "";
  const rangeTo = reportsSummary?.range?.to ?? "";
  const rangeLabel =
    rangeFrom && rangeTo
      ? `${formatDisplayDate(rangeFrom)} — ${formatDisplayDate(rangeTo)}`
      : "Day-wise activity";

  const monthlyMonths: ReportMonth[] = reportsMonthly?.months ?? [];
  const monthlyTotals = reportsMonthly?.totals;
  const monthlyRangeFrom = reportsMonthly?.range?.from ?? "";
  const monthlyRangeTo = reportsMonthly?.range?.to ?? "";
  const monthlyRangeLabel =
    monthlyRangeFrom && monthlyRangeTo
      ? `${formatDisplayDate(monthlyRangeFrom)} — ${formatDisplayDate(monthlyRangeTo)}`
      : "All months account report";

  const canDownloadMonthlyPdf = monthlyMonths.length > 0;

  const TAB_CLS = (t: "month" | "all") =>
    activeTab === t
      ? "rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm transition-all"
      : "rounded-xl px-5 py-2 text-xs font-semibold text-slate-500 transition-all hover:bg-slate-100";

  return (
    <section className="mt-4 space-y-5">
      {/* Tab switcher */}
      <div className="flex w-fit gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
        <button type="button" className={TAB_CLS("month")} onClick={() => setActiveTab("month")}>
          This Month
        </button>
        <button type="button" className={TAB_CLS("all")} onClick={() => setActiveTab("all")}>
          All Months
        </button>
      </div>

      {/* ── THIS MONTH ── */}
      {activeTab === "month" && (
        <Section
          title="This Month Report"
          subtitle={isReportsFetching ? "Refreshing data…" : "Day-wise sales, orders, and profit overview."}
          badge={formatMonthLabel(thisMonth?.month)}
          badgeTone="amber"
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Total Sales" value={formatMoney(thisMonth?.sales ?? 0)} hint={`${thisMonth?.paidInvoices ?? 0} paid bills`} tone="amber" />
              <KpiCard label="Orders" value={`${thisMonth?.orders ?? 0}`} hint={`${thisMonth?.invoices ?? 0} invoices raised`} tone="blue" />
              <KpiCard label="Expenses" value={formatMoney(thisMonth?.expenses ?? 0)} hint="This month spend" tone="slate" />
              <KpiCard label="Net Profit" value={formatMoney(thisMonth?.profit ?? 0)} hint="After expenses" tone={(thisMonth?.profit ?? 0) >= 0 ? "green" : "red"} />
            </div>

            <ChartPanel title="Day-wise chart" subtitle={rangeLabel}>
              {summaryDays.length > 0 ? (
                <DayBarChart days={summaryDays} todayDate={todayDate} />
              ) : (
                <EmptyState loading={isReportsFetching} label="No day-wise data available" />
              )}
            </ChartPanel>

            {totals && (
              <>
                <SectionDivider label="Period totals" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiCard label="Period Orders" value={`${totals.orders ?? 0}`} hint="Selected range" tone="slate" />
                  <KpiCard label="Period Invoices" value={`${totals.invoices ?? 0}`} hint={`${totals.paidInvoices ?? 0} paid`} tone="blue" />
                  <KpiCard label="Period Sales" value={formatMoney(totals.sales ?? 0)} hint={`${formatMoney(totals.expenses ?? 0)} expenses`} tone="amber" />
                  <KpiCard label="Period Profit" value={formatMoney(totals.profit ?? 0)} hint="Net result" tone={(totals.profit ?? 0) >= 0 ? "green" : "red"} />
                </div>
              </>
            )}

            {summaryDays.length > 0 && (
              <>
                <SectionDivider label="Day breakdown" />
                <DayCards days={summaryDays} todayDate={todayDate} />
                <DataTable
                  rows={summaryDays.map((d) => ({
                    key: d.date,
                    dateLabel: d.label || d.day,
                    dateSub: formatDisplayDate(d.date),
                    isHighlight: d.date === todayDate,
                    highlightLabel: d.date === todayDate ? "Today" : undefined,
                    highlightColor: "amber" as const,
                    orders: d.orders,
                    invoices: d.invoices,
                    paidInvoices: d.paidInvoices,
                    sales: d.sales,
                    expenses: d.expenses,
                    profit: d.profit,
                  }))}
                />
              </>
            )}
          </div>
        </Section>
      )}

      {/* ── ALL MONTHS ── */}
      {activeTab === "all" && (
        <Section
          title="All Months Report"
          subtitle={isMonthlyFetching ? "Loading account history…" : "Month-by-month account report for CA and owner review."}
          badge={`${monthlyMonths.length} months`}
          badgeTone="blue"
          action={
            <button
              type="button"
              disabled={!canDownloadMonthlyPdf}
              onClick={() =>
                downloadMonthlyAccountReportPdf({
                  months: monthlyMonths,
                  totals: {
                    orders: monthlyTotals?.orders ?? 0,
                    invoices: monthlyTotals?.invoices ?? 0,
                    paidInvoices: monthlyTotals?.paidInvoices ?? 0,
                    sales: monthlyTotals?.sales ?? 0,
                    expenses: monthlyTotals?.expenses ?? 0,
                    profit: monthlyTotals?.profit ?? 0,
                  },
                  meta: {
                    tenantName: tenantName ?? "Restaurant",
                    title: "All Month Account Report",
                    rangeLabel: monthlyRangeLabel,
                  },
                })
              }
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download PDF
            </button>
          }
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Total Sales" value={formatMoney(monthlyTotals?.sales ?? 0)} hint={`${monthlyTotals?.paidInvoices ?? 0} paid invoices`} tone="amber" />
              <KpiCard label="Total Orders" value={`${monthlyTotals?.orders ?? 0}`} hint={`${monthlyTotals?.invoices ?? 0} invoices`} tone="blue" />
              <KpiCard label="Total Expenses" value={formatMoney(monthlyTotals?.expenses ?? 0)} hint="All months combined" tone="slate" />
              <KpiCard label="Net Profit" value={formatMoney(monthlyTotals?.profit ?? 0)} hint="Business result" tone={(monthlyTotals?.profit ?? 0) >= 0 ? "green" : "red"} />
            </div>

            {monthlyMonths.length > 0 ? (
              <>
                <ChartPanel title="Monthly sales trend" subtitle={monthlyRangeLabel}>
                  <MonthBarChart months={monthlyMonths} />
                </ChartPanel>

                <SectionDivider label="Month breakdown" />
                <MonthCards months={monthlyMonths} />
                <DataTable
                  rows={[...monthlyMonths].reverse().map((m) => ({
                    key: m.month,
                    dateLabel: m.label,
                    dateSub: m.month,
                    isHighlight: m.month === currentMonthStr,
                    highlightLabel: m.month === currentMonthStr ? "Current" : undefined,
                    highlightColor: "blue" as const,
                    orders: m.orders,
                    invoices: m.invoices,
                    paidInvoices: m.paidInvoices,
                    sales: m.sales,
                    expenses: m.expenses,
                    profit: m.profit,
                  }))}
                  footer={
                    monthlyTotals
                      ? {
                          orders: monthlyTotals.orders ?? 0,
                          invoices: monthlyTotals.invoices ?? 0,
                          paidInvoices: monthlyTotals.paidInvoices ?? 0,
                          sales: monthlyTotals.sales ?? 0,
                          expenses: monthlyTotals.expenses ?? 0,
                          profit: monthlyTotals.profit ?? 0,
                        }
                      : undefined
                  }
                />
              </>
            ) : (
              <EmptyState loading={isMonthlyFetching} label="No monthly report available" />
            )}
          </div>
        </Section>
      )}
    </section>
  );
}
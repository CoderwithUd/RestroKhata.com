"use client";

import { useMemo } from "react";

type PublicDashboardProps = {
  tenantSlug: string;
};

function toTitleCaseFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

export function PublicDashboard({ tenantSlug }: PublicDashboardProps) {
  const restaurantName = useMemo(() => toTitleCaseFromSlug(tenantSlug) || "Restaurant", [tenantSlug]);

  return (
    <main className="public-shell">
      <section className="public-panel">
        <header className="public-header">
          <div className="badge">USER VIEW</div>
          <h1 className="mt-3 text-3xl">{restaurantName} Experience</h1>
          <p className="helper mt-2">No login required. One dynamic URL for customer-facing dashboard.</p>
        </header>

        <section className="public-grid">
          <article className="public-card">
            <p className="muted">Today Highlights</p>
            <p className="mt-2 dash-value">Chef Special + Fast Checkout</p>
            <p className="helper mt-2">Premium dining flow with simple digital access.</p>
          </article>
          <article className="public-card">
            <p className="muted">Top Categories</p>
            <p className="mt-2 dash-value">Starters, Main Course, Beverages</p>
            <p className="helper mt-2">Optimized layout for mobile, tablet, desktop users.</p>
          </article>
          <article className="public-card">
            <p className="muted">Service Window</p>
            <p className="mt-2 dash-value">10:00 AM to 11:00 PM</p>
            <p className="helper mt-2">Order and inquiry requests are available throughout the day.</p>
          </article>
        </section>
      </section>
    </main>
  );
}


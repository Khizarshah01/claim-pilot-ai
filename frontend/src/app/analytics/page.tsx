"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { duration, money, shortDate } from "@/lib/format";
import type { Stats } from "@/lib/types";

const SERIES = [
  { key: "approved", label: "Approved", color: "var(--success)" },
  { key: "in_review", label: "Needs review", color: "var(--warning)" },
  { key: "denied", label: "Denied", color: "var(--danger)" },
  { key: "pending", label: "Pending", color: "#3f3f46" },
] as const;

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.stats().then(setStats).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <PageHeader title="Analytics" description="Agent throughput and outcomes over the last 14 days" />
      {error && <p className="p-6 text-sm text-danger">{error}</p>}
      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats ? (
            <>
              <Stat label="Claims processed" value={String(stats.total)} sub={`${stats.by_status.pending} awaiting agent run`} />
              <Stat label="Straight-through rate" value={`${Math.round(stats.auto_decision_rate * 100)}%`} sub="Decided without an adjuster" />
              <Stat label="Approved payouts" value={money(stats.total_payout)} sub={`${Math.round(stats.approval_rate * 100)}% approval rate`} />
              <Stat label="Avg fraud risk" value={String(stats.avg_risk)} sub={`${stats.by_status.in_review} routed to review · ${duration(stats.avg_decision_ms)} avg run`} />
            </>
          ) : (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[92px]" />)
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <h2 className="text-xs font-medium text-muted-foreground">Decisions by day</h2>
              <div className="flex flex-wrap gap-3">
                {SERIES.map((s) => (
                  <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-2 rounded-sm" style={{ background: s.color }} /> {s.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="h-72 p-3">
              {stats ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.timeline} barCategoryGap="28%">
                    <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.05)" />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "#8b8b93", fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fill: "#8b8b93", fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip
                      cursor={{ fill: "rgb(255 255 255 / 0.03)" }}
                      contentStyle={{ background: "#121214", border: "1px solid rgb(255 255 255 / 0.08)", borderRadius: 8, fontSize: 12 }}
                      labelFormatter={(l) => shortDate(String(l))}
                    />
                    {SERIES.map((s, i) => (
                      <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} radius={i === SERIES.length - 1 ? [3, 3, 0, 0] : 0} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Skeleton className="h-full" />
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <h2 className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">Top fraud signals</h2>
            {stats && stats.top_flags.length > 0 ? (
              <ul className="space-y-3 p-4">
                {stats.top_flags.map((f) => {
                  const max = stats.top_flags[0].count;
                  return (
                    <li key={f.label}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{f.label}</span>
                        <span className="tnum text-muted-foreground">{f.count}</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-warning/80" style={{ width: `${(f.count / max) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">{stats ? "No fraud signals raised yet." : "Loading…"}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

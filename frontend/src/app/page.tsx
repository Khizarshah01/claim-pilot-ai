"use client";

import { Inbox, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { RiskBar, StatusPill } from "@/components/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { money, relative } from "@/lib/format";
import type { ClaimRecord, ClaimStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: { key: "all" | ClaimStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in_review", label: "Needs review" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "denied", label: "Denied" },
];

export default function InboxPage() {
  const router = useRouter();
  const [claims, setClaims] = useState<ClaimRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | ClaimStatus>("all");

  useEffect(() => {
    api.listClaims().then(setClaims).catch((e) => setError(e.message));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: claims?.length ?? 0 };
    claims?.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [claims]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (claims ?? []).filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!needle) return true;
      return [r.id, r.claim?.claimant_name, r.claim?.policy_number, r.claim?.vehicle, r.claim?.loss_description]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(needle));
    });
  }, [claims, q, filter]);

  return (
    <div>
      <PageHeader
        title="Claims inbox"
        description={claims ? `${counts.in_review ?? 0} need review · ${counts.pending ?? 0} pending agent run` : "Loading claims…"}
        actions={
          <Link href="/claims/new" className={buttonVariants({ size: "sm" })}>
            <Plus /> New claim
          </Link>
        }
      />

      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:px-6">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by claim, claimant, policy…"
            className="h-8 w-full rounded-md border border-input bg-white/[0.02] pr-3 pl-8 text-sm outline-none transition-colors duration-150 placeholder:text-muted-foreground focus:border-primary/50"
          />
        </div>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors duration-150",
                filter === f.key ? "bg-white/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className="tnum text-muted-foreground">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <Empty title="Can't reach the ClaimPilot API" body={`${error}. Start the backend with: uvicorn app.main:app --port 8000`} />
      ) : !claims ? (
        <div className="space-y-px p-4 sm:px-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Empty title="No claims match" body="Try a different search or filter." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 pl-4 font-medium sm:pl-6">Claim</th>
                <th className="px-3 py-2 font-medium">Claimant</th>
                <th className="px-3 py-2 font-medium">Loss</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Risk</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="py-2 pr-4 pl-3 text-right font-medium sm:pr-6">Received</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/claims/${r.id}`)}
                  className="cursor-pointer border-b border-border transition-colors duration-100 hover:bg-white/[0.025]"
                >
                  <td className="py-2.5 pr-3 pl-4 font-mono text-xs text-muted-foreground sm:pl-6">{r.id}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{r.claim?.claimant_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.claim?.policy_number} · {r.claim?.vehicle}
                    </div>
                  </td>
                  <td className="max-w-[320px] px-3 py-2.5">
                    <p className="truncate text-muted-foreground">{r.claim?.loss_description ?? r.input.text}</p>
                  </td>
                  <td className="tnum px-3 py-2.5 text-right">{money(r.claim?.claimed_amount)}</td>
                  <td className="px-3 py-2.5">{r.result ? <RiskBar score={r.result.risk_score} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="tnum py-2.5 pr-4 pl-3 text-right text-xs text-muted-foreground sm:pr-6">{relative(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid place-items-center px-6 py-24 text-center">
      <div className="mb-3 grid size-10 place-items-center rounded-lg border border-border bg-card">
        <Inbox className="size-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

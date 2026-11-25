"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ChevronRight, ShieldCheck, ShieldX, UserRoundSearch } from "lucide-react";
import { useState } from "react";

import { ConfidenceRing, RiskGauge } from "@/components/gauges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { money2 } from "@/lib/format";
import type { ClaimRecord, Citation } from "@/lib/types";
import { cn } from "@/lib/utils";

const DECISION = {
  Approve: { label: "Approve", sub: "Auto-approved by agent", icon: ShieldCheck, cls: "text-success", ring: "ring-success/25 bg-success/[0.06]" },
  Deny: { label: "Deny", sub: "Auto-denied on policy terms", icon: ShieldX, cls: "text-danger", ring: "ring-danger/25 bg-danger/[0.06]" },
  Review: { label: "Needs adjuster review", sub: "Routed by human review gate", icon: UserRoundSearch, cls: "text-warning", ring: "ring-warning/25 bg-warning/[0.06]" },
};

export function DecisionSkeleton({ running }: { running: boolean }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-xs text-muted-foreground">{running ? "Agent is evaluating this claim…" : "Not evaluated yet"}</p>
        <Skeleton className="mb-2 h-6 w-32" />
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}

export function DecisionPanel({ record, onAction, busy }: { record: ClaimRecord; onAction: (a: "approve" | "escalate") => void; busy: boolean }) {
  const r = record.result!;
  const d = DECISION[r.decision];
  const cited = new Set(r.cited_clauses);
  const reviewed = record.audit.some((a) => a.actor === "You");
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="space-y-3">
      <section className={cn("rounded-lg p-4 ring-1 ring-inset", d.ring)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={cn("flex items-center gap-1.5 text-sm font-semibold", d.cls)}>
              <d.icon className="size-4" /> {d.label}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{d.sub}</p>
          </div>
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">{r.mode}</span>
        </div>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">{r.decision === "Review" ? "Proposed payout" : "Payout"}</p>
          <p className="tnum text-3xl font-semibold tracking-tight">{money2(r.payout)}</p>
        </div>
        {r.settlement && r.payout > 0 && (
          <div className="tnum mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
            <Kv k="Approved cost" v={money2(r.settlement.approved_cost)} />
            <Kv k="Deductible" v={`−${money2(r.settlement.deductible)}`} />
            <Kv k="Limit" v={money2(r.settlement.limit)} hint={r.settlement.capped ? "capped" : undefined} />
          </div>
        )}
        {r.review_reasons.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-border pt-3">
            {r.review_reasons.map((x) => (
              <li key={x} className="flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle className="size-3.5" /> {x}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex gap-2">
          <Button size="sm" className="flex-1" disabled={busy || record.status === "approved" || r.decision === "Deny"} onClick={() => onAction("approve")}>
            {record.status === "approved" && reviewed ? "Approved" : "Approve"}
          </Button>
          <Button size="sm" variant="outline" className="flex-1" disabled={busy || (record.status === "in_review" && reviewed)} onClick={() => onAction("escalate")}>
            {record.status === "in_review" && reviewed ? "With adjuster" : "Send to adjuster"}
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <section className="flex flex-col items-center rounded-lg border border-border bg-card p-3">
          <p className="mb-2 self-start text-xs text-muted-foreground">Confidence</p>
          <ConfidenceRing value={r.confidence} />
        </section>
        <section className="flex flex-col items-center rounded-lg border border-border bg-card p-3">
          <p className="mb-2 self-start text-xs text-muted-foreground">Fraud risk</p>
          <RiskGauge score={r.risk_score} />
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card">
        <h3 className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">Rationale</h3>
        <p className="px-4 py-3 text-sm leading-relaxed">{r.rationale}</p>
      </section>

      {r.fraud_flags.length > 0 && (
        <section className="rounded-lg border border-border bg-card">
          <h3 className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">Fraud signals</h3>
          <ul>
            {r.fraud_flags.map((f) => (
              <li key={f.code} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <span className="tnum mt-0.5 w-8 shrink-0 font-mono text-xs text-warning">+{f.weight}</span>
                <div className="min-w-0">
                  <p className="text-sm">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.citations.length > 0 && (
        <section className="rounded-lg border border-border bg-card">
          <h3 className="flex items-center justify-between border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">
            Cited clauses <span className="font-normal">Form PA-2026</span>
          </h3>
          <div>
            {r.citations.map((c) => (
              <ClauseRow key={c.clause_id} c={c} cited={cited.has(c.clause_id)} />
            ))}
          </div>
        </section>
      )}
    </motion.div>
  );
}

function Kv({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{k}</p>
      <p className="mt-0.5 font-medium">
        {v} {hint && <span className="text-warning">· {hint}</span>}
      </p>
    </div>
  );
}

function ClauseRow({ c, cited }: { c: Citation; cited: boolean }) {
  const [open, setOpen] = useState(cited && c.clause_id.startsWith("B"));
  return (
    <div className="border-b border-border last:border-0">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-white/[0.02]">
        <span className={cn("rounded px-1.5 py-0.5 font-mono text-[11px]", cited ? "bg-primary/15 text-primary" : "bg-white/[0.04] text-muted-foreground")}>{c.clause_id}</span>
        <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
        <div className="h-1 w-10 overflow-hidden rounded-full bg-white/[0.06]" title={`Relevance ${c.score.toFixed(2)}`}>
          <div className="h-full bg-white/30" style={{ width: `${c.score * 100}%` }} />
        </div>
        <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform duration-150", open && "rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16 }} className="overflow-hidden">
            <p className="px-4 pb-3 text-[13px] leading-relaxed text-muted-foreground">
              <span className="text-foreground/80">{c.section}. </span>
              {c.text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

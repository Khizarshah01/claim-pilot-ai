import { cn } from "@/lib/utils";
import type { ClaimStatus, Decision } from "@/lib/types";

const STATUS: Record<ClaimStatus, { label: string; cls: string; dot: string }> = {
  approved: { label: "Approved", cls: "text-success bg-success/10 ring-success/20", dot: "bg-success" },
  denied: { label: "Denied", cls: "text-danger bg-danger/10 ring-danger/20", dot: "bg-danger" },
  in_review: { label: "Needs review", cls: "text-warning bg-warning/10 ring-warning/20", dot: "bg-warning" },
  pending: { label: "Pending", cls: "text-muted-foreground bg-white/[0.04] ring-white/10", dot: "bg-muted-foreground" },
};

export function StatusPill({ status, className }: { status: ClaimStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", s.cls, className)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

export const decisionStatus = (d: Decision): ClaimStatus =>
  d === "Approve" ? "approved" : d === "Deny" ? "denied" : "in_review";

export function RiskBar({ score }: { score: number }) {
  const color = score > 60 ? "bg-danger" : score >= 30 ? "bg-warning" : "bg-success";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-14 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(score, 3)}%` }} />
      </div>
      <span className="tnum w-6 text-xs text-muted-foreground">{score}</span>
    </div>
  );
}

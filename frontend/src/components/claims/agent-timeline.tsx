"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronRight, Loader2, Minus, X } from "lucide-react";
import { useState } from "react";

import { duration } from "@/lib/format";
import { STEPS, type TraceStep } from "@/lib/types";
import { cn } from "@/lib/utils";

export type StepState = { status: "idle" | "running" | "done" | "failed" | "skipped"; step?: TraceStep };

export function AgentTimeline({ steps, running }: { steps: Record<string, StepState>; running: boolean }) {
  return (
    <ol className="relative">
      {STEPS.map((s, i) => (
        <TimelineRow key={s.node} index={i} meta={s} state={steps[s.node] ?? { status: "idle" }} last={i === STEPS.length - 1} running={running} />
      ))}
    </ol>
  );
}

function Icon({ status }: { status: StepState["status"] }) {
  const base = "relative z-10 grid size-6 place-items-center rounded-full ring-1 ring-inset transition-colors duration-150";
  switch (status) {
    case "running":
      return (
        <span className={cn(base, "bg-primary/10 ring-primary/40")}>
          <Loader2 className="size-3.5 animate-spin text-primary" />
        </span>
      );
    case "done":
      return (
        <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ duration: 0.15 }} className={cn(base, "bg-primary ring-primary")}>
          <Check className="size-3.5 text-primary-foreground" strokeWidth={3} />
        </motion.span>
      );
    case "failed":
      return (
        <span className={cn(base, "bg-danger/15 ring-danger/40")}>
          <X className="size-3.5 text-danger" strokeWidth={3} />
        </span>
      );
    case "skipped":
      return (
        <span className={cn(base, "bg-transparent ring-white/10")}>
          <Minus className="size-3 text-muted-foreground" />
        </span>
      );
    default:
      return <span className={cn(base, "bg-background ring-white/10")} />;
  }
}

function TimelineRow({ meta, state, last, index }: { meta: (typeof STEPS)[number]; state: StepState; last: boolean; index: number; running: boolean }) {
  const [open, setOpen] = useState(false);
  const { status, step } = state;
  const expandable = !!step && step.details.length > 0;
  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: index * 0.03 }}
      className="relative flex gap-3 pb-1"
    >
      {!last && (
        <span
          className={cn(
            "absolute top-7 bottom-0 left-3 w-px -translate-x-1/2 transition-colors duration-200",
            status === "done" ? "bg-primary/40" : "bg-white/[0.07]",
          )}
        />
      )}
      <div className="pt-2.5">
        <Icon status={status} />
      </div>
      <div className="min-w-0 flex-1">
        <button
          disabled={!expandable}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors duration-150",
            expandable && "hover:bg-white/[0.03]",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cn("text-sm font-medium", status === "idle" || status === "skipped" ? "text-muted-foreground" : "text-foreground")}>
                {meta.label}
              </span>
              {status === "skipped" && <span className="text-xs text-muted-foreground">Skipped</span>}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {status === "running" ? "Working…" : step?.summary ?? meta.hint}
            </p>
          </div>
          {step && <span className="tnum shrink-0 pt-0.5 font-mono text-[11px] text-muted-foreground">{duration(step.duration_ms)}</span>}
          {expandable && <ChevronRight className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-90")} />}
        </button>
        <AnimatePresence initial={false}>
          {open && step && (
            <motion.ul
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="mx-2 mb-2 overflow-hidden rounded-md border border-border bg-black/20"
            >
              {step.details.map((d, i) => (
                <li key={i} className="border-b border-border px-3 py-1.5 font-mono text-[11.5px] leading-relaxed text-muted-foreground last:border-0">
                  {d}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

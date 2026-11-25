"use client";

import { ArrowLeft, RotateCw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { AgentTimeline, type StepState } from "@/components/claims/agent-timeline";
import { ClaimSummary } from "@/components/claims/claim-summary";
import { DecisionPanel, DecisionSkeleton } from "@/components/claims/decision-panel";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, evaluateStream } from "@/lib/api";
import { duration, money2 } from "@/lib/format";
import { STEPS, type ClaimRecord } from "@/lib/types";

function stepsFromRecord(r: ClaimRecord | null): Record<string, StepState> {
  if (!r?.result) return {};
  const out: Record<string, StepState> = {};
  for (const s of STEPS) out[s.node] = { status: "skipped" };
  for (const t of r.result.trace) out[t.node] = { status: t.status, step: t };
  return out;
}

export default function ClaimDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96" />}>
      <ClaimDetail />
    </Suspense>
  );
}

function ClaimDetail() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<ClaimRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setSteps({});
    setRecord((r) => (r ? { ...r, result: null } : r));
    try {
      for await (const ev of evaluateStream({ claim_id: id })) {
        if (ev.event === "step_start") setSteps((s) => ({ ...s, [ev.data.node]: { status: "running" } }));
        else if (ev.event === "step_end") setSteps((s) => ({ ...s, [ev.data.step.node]: { status: ev.data.step.status, step: ev.data.step } }));
        else if (ev.event === "result") {
          setRecord(ev.data);
          setSteps(stepsFromRecord(ev.data));
        } else if (ev.event === "error") setError(ev.data.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setRunning(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    api
      .getClaim(id)
      .then((r) => {
        if (cancelled) return;
        setRecord(r);
        setSteps(stepsFromRecord(r));
        if (r.status === "pending" && !r.result && !started.current) {
          started.current = true;
          run();
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id, run]);

  const act = async (action: "approve" | "escalate") => {
    setBusy(true);
    try {
      setRecord(await api.action(id, action));
    } finally {
      setBusy(false);
    }
  };

  if (error && !record) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-6 text-center">
        <div>
          <p className="text-sm font-medium">Could not load {id}</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}. Is the API running on port 8000?</p>
          <Link href="/" className="mt-4 inline-block text-sm text-primary">Back to inbox</Link>
        </div>
      </div>
    );
  }

  const total = record?.result?.total_duration_ms;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-4 sm:px-6">
        <Link href="/" className="rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-white/[0.04] hover:text-foreground" aria-label="Back">
          <ArrowLeft className="size-4" />
        </Link>
        {record ? (
          <>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="font-mono text-base font-semibold tracking-tight">{record.id}</h1>
                <StatusPill status={record.status} />
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {record.claim?.claimant_name ?? "New claim"} · {record.claim?.vehicle} · <span className="tnum">{money2(record.claim?.claimed_amount)}</span>
              </p>
            </div>
            <div className="ml-auto">
              <Button size="sm" variant="outline" onClick={run} disabled={running}>
                <RotateCw className={running ? "animate-spin" : ""} /> {running ? "Running" : "Re-run agent"}
              </Button>
            </div>
          </>
        ) : (
          <Skeleton className="h-10 w-64" />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <div className="order-3 min-w-0 lg:col-span-2 xl:order-1 xl:col-span-1">{record ? <ClaimSummary record={record} /> : <Skeleton className="h-96" />}</div>

        <section className="order-1 h-fit min-w-0 rounded-lg border border-border bg-card xl:order-2">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 className="text-xs font-medium text-muted-foreground">Agent trace</h2>
            <span className="tnum font-mono text-[11px] text-muted-foreground">
              {running ? (
                <span className="flex items-center gap-1.5 text-primary">
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" /> live
                </span>
              ) : total != null ? (
                `${duration(total)} total`
              ) : null}
            </span>
          </div>
          <div className="p-3">
            <AgentTimeline steps={steps} running={running} />
            {error && <p className="mx-2 mt-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          </div>
        </section>

        <div className="order-2 min-w-0 xl:order-3">
          {record?.result && !running ? <DecisionPanel record={record} onAction={act} busy={busy} /> : <DecisionSkeleton running={running} />}
        </div>
      </div>
    </div>
  );
}

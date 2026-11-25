import { FileText, Paperclip } from "lucide-react";

import { longDate, money2, relative } from "@/lib/format";
import type { ClaimRecord } from "@/lib/types";

export function ClaimSummary({ record }: { record: ClaimRecord }) {
  const c = record.claim;
  const p = record.policy;
  const docs = c?.documents ?? record.input.documents ?? [];
  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2 xl:grid-cols-1">
      <section className="rounded-lg border border-border bg-card">
        <h3 className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">Claim</h3>
        {c ? (
          <dl className="divide-y divide-border text-sm">
            <Row k="Claimant" v={c.claimant_name} />
            <Row k="Vehicle" v={c.vehicle || "—"} />
            <Row k="Date of loss" v={longDate(c.date_of_loss)} />
            <Row k="Reported" v={longDate(c.reported_date)} />
            {c.location && <Row k="Location" v={c.location} />}
            <Row k="Claimed" v={<span className="tnum">{money2(c.claimed_amount)}</span>} />
            <Row k="Police report" v={c.police_report ? "On file" : "None"} />
          </dl>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">Fields will be extracted by the intake step.</p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card">
        <h3 className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">Loss description</h3>
        <p className="px-4 py-3 text-sm leading-relaxed text-foreground/90">{c?.loss_description ?? record.input.text ?? record.input.loss_description}</p>
      </section>

      {p && (
        <section className="rounded-lg border border-border bg-card">
          <h3 className="flex items-center justify-between border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">
            Policy <span className="font-mono">{p.policy_number}</span>
          </h3>
          <dl className="divide-y divide-border text-sm">
            <Row k="Term" v={`${longDate(p.start_date)} – ${longDate(p.end_date)}`} />
            <Row k="Premium" v={p.premium_paid ? "Paid" : <span className="text-danger">Past due</span>} />
            {Object.entries(p.coverages).map(([k, v]) => (
              <Row key={k} k={k[0].toUpperCase() + k.slice(1)} v={<span className="tnum">{money2(v.deductible)} ded · {money2(v.limit)} limit</span>} />
            ))}
            {!p.coverages.collision && <Row k="Collision" v={<span className="text-muted-foreground">Not carried</span>} />}
          </dl>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card">
        <h3 className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">Documents</h3>
        {docs.length ? (
          <ul className="divide-y divide-border">
            {docs.map((d) => (
              <li key={d} className="flex items-center gap-2 px-4 py-2 text-sm">
                {d.endsWith(".pdf") ? <FileText className="size-3.5 text-muted-foreground" /> : <Paperclip className="size-3.5 text-muted-foreground" />}
                <span className="truncate font-mono text-[12.5px]">{d}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">No documents attached.</p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card">
        <h3 className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">Activity</h3>
        <ol className="space-y-2.5 px-4 py-3">
          {[...record.audit].reverse().map((a, i) => (
            <li key={i} className="flex gap-2.5 text-xs">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-white/25" />
              <div>
                <p>
                  <span className="text-foreground">{a.action}</span> <span className="text-muted-foreground">· {a.actor}</span>
                </p>
                <p className="text-muted-foreground">
                  {relative(a.at)}
                  {a.note && ` · ${a.note}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 truncate text-right">{v}</dd>
    </div>
  );
}

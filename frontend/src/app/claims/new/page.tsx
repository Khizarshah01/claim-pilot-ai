"use client";

import { ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { ClaimInput } from "@/lib/types";
import { cn } from "@/lib/utils";

type FormState = {
  policy_number: string;
  claimant_name: string;
  vehicle: string;
  date_of_loss: string;
  reported_date: string;
  location: string;
  loss_description: string;
  claimed_amount: string;
  police_report: boolean;
  documents: string;
};

const EMPTY: FormState = {
  policy_number: "", claimant_name: "", vehicle: "", date_of_loss: "", reported_date: "",
  location: "", loss_description: "", claimed_amount: "", police_report: false, documents: "",
};

const SAMPLES: { key: string; label: string; hint: string; data: FormState }[] = [
  {
    key: "approve", label: "Clean approve", hint: "Rear-end, police report, fair estimate",
    data: {
      policy_number: "CP-1001", claimant_name: "Maya Chen", vehicle: "2023 Tesla Model 3",
      date_of_loss: "2026-11-23", reported_date: "2026-11-24", location: "Market St, San Francisco, CA",
      loss_description: "Rear-ended while stopped at a red light on Market St. The other driver admitted fault. Rear bumper, trunk lid and the left tail light are damaged.",
      claimed_amount: "4280", police_report: true, documents: "police_report_77120.pdf, body_shop_estimate.pdf, photos.zip",
    },
  },
  {
    key: "deny", label: "Deny for exclusion", hint: "Track day triggers racing exclusion B.2",
    data: {
      policy_number: "CP-1004", claimant_name: "Lucas Moreau", vehicle: "2019 Ford Mustang GT",
      date_of_loss: "2026-11-22", reported_date: "2026-11-23", location: "Thunderhill Raceway, Willows, CA",
      loss_description: "During a timed track day at Thunderhill Raceway I spun out in turn 5 and hit the tire barrier. Front bumper, hood, radiator and left headlight are damaged.",
      claimed_amount: "11900", police_report: false, documents: "photos.zip, shop_estimate.pdf",
    },
  },
  {
    key: "fraud", label: "Fraud flagged", hint: "New policy, vague story, inflated cost",
    data: {
      policy_number: "CP-1003", claimant_name: "Priya Raman", vehicle: "2022 Subaru Outback",
      date_of_loss: "2026-11-02", reported_date: "2026-11-20", location: "Seattle, WA",
      loss_description: "Car got damaged in parking lot.",
      claimed_amount: "18500", police_report: false, documents: "estimate.pdf",
    },
  },
];

const TEXT_SAMPLE =
  "Hi, this is Grace Kim, policy CP-1009. On 2026-11-24 a deer ran out on Highway 36 near Boulder and hit my 2023 Mazda CX-5. The front bumper, grille and right headlight are smashed. I filed a police report on 2026-11-24. The body shop quoted $4,950.";

export default function NewClaimPage() {
  return (
    <Suspense>
      <NewClaim />
    </Suspense>
  );
}

function NewClaim() {
  const router = useRouter();
  // ?sample=approve|deny|fraud preloads a sample, handy for demos
  const sampleKey = useSearchParams().get("sample");
  const preset = SAMPLES.find((s) => s.key === sampleKey);
  const [mode, setMode] = useState<"form" | "text">("form");
  const [form, setForm] = useState<FormState>(preset?.data ?? EMPTY);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(preset?.key ?? null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: ClaimInput =
        mode === "text"
          ? { text }
          : {
              ...form,
              claimed_amount: Number(form.claimed_amount),
              reported_date: form.reported_date || null,
              documents: form.documents.split(",").map((s) => s.trim()).filter(Boolean),
            };
      const rec = await api.createClaim(payload);
      router.push(`/claims/${rec.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create claim");
      setSubmitting(false);
    }
  };

  const valid = mode === "text" ? text.trim().length > 20 : !!(form.policy_number && form.date_of_loss && form.loss_description && form.claimed_amount);

  return (
    <div>
      <PageHeader title="New claim" description="Submit a first notice of loss. The agent runs as soon as it opens." />
      <div className="mx-auto grid max-w-5xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <form onSubmit={submit} className="rounded-lg border border-border bg-card">
          <div className="flex gap-1 border-b border-border p-1.5">
            {(["form", "text"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn("rounded-md px-3 py-1 text-xs transition-colors duration-150", mode === m ? "bg-white/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {m === "form" ? "Structured" : "Free text"}
              </button>
            ))}
          </div>

          {mode === "form" ? (
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <Field label="Policy number" value={form.policy_number} onChange={(v) => set("policy_number", v)} placeholder="CP-1001" mono />
              <Field label="Claimant" value={form.claimant_name} onChange={(v) => set("claimant_name", v)} placeholder="Full name" />
              <Field label="Vehicle" value={form.vehicle} onChange={(v) => set("vehicle", v)} placeholder="2023 Tesla Model 3" />
              <Field label="Location" value={form.location} onChange={(v) => set("location", v)} placeholder="City, State" />
              <Field label="Date of loss" type="date" value={form.date_of_loss} onChange={(v) => set("date_of_loss", v)} />
              <Field label="Reported" type="date" value={form.reported_date} onChange={(v) => set("reported_date", v)} />
              <Field label="Claimed amount (USD)" type="number" value={form.claimed_amount} onChange={(v) => set("claimed_amount", v)} placeholder="4280" mono />
              <Field label="Documents" value={form.documents} onChange={(v) => set("documents", v)} placeholder="estimate.pdf, photos.zip" />
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs text-muted-foreground">What happened</span>
                <textarea
                  rows={4}
                  value={form.loss_description}
                  onChange={(e) => set("loss_description", e.target.value)}
                  placeholder="Describe the incident and the damaged parts"
                  className="w-full resize-none rounded-md border border-input bg-white/[0.02] px-3 py-2 text-sm leading-relaxed outline-none transition-colors duration-150 placeholder:text-muted-foreground focus:border-primary/50"
                />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={form.police_report} onChange={(e) => set("police_report", e.target.checked)} className="size-3.5 accent-[var(--primary)]" />
                Police report filed
              </label>
            </div>
          ) : (
            <div className="space-y-2 p-4">
              <textarea
                rows={9}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste an email or call transcript. The intake step extracts policy, dates, amount and vehicle."
                className="w-full resize-none rounded-md border border-input bg-white/[0.02] px-3 py-2 text-sm leading-relaxed outline-none transition-colors duration-150 placeholder:text-muted-foreground focus:border-primary/50"
              />
              <button type="button" onClick={() => setText(TEXT_SAMPLE)} className="text-xs text-primary hover:underline">
                Insert example narrative
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-danger">{error}</p>
            <Button type="submit" disabled={!valid || submitting}>
              {submitting ? "Submitting…" : "Submit and run agent"} <ArrowRight />
            </Button>
          </div>
        </form>

        <aside className="space-y-2">
          <p className="px-1 text-xs font-medium text-muted-foreground">Load sample</p>
          {SAMPLES.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                setMode("form");
                setForm(s.data);
                setActive(s.key);
              }}
              className={cn(
                "w-full rounded-lg border bg-card px-3 py-2.5 text-left transition-colors duration-150 hover:bg-white/[0.03]",
                active === s.key ? "border-primary/40" : "border-border",
              )}
            >
              <p className="text-sm font-medium">{s.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
            </button>
          ))}
          <p className="px-1 pt-2 text-xs leading-relaxed text-muted-foreground">
            Policies CP-1001 to CP-1010 exist in the demo policy system. Try CP-1006 (premium past due) or CP-1005 (no collision coverage).
          </p>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean }) {
  return (
    <label>
      <span className="mb-1.5 block text-xs text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-8 w-full rounded-md border border-input bg-white/[0.02] px-3 text-sm outline-none transition-colors duration-150 placeholder:text-muted-foreground focus:border-primary/50 [color-scheme:dark]",
          mono && "tnum font-mono text-[13px]",
        )}
      />
    </label>
  );
}

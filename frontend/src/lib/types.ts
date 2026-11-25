export type Decision = "Approve" | "Deny" | "Review";
export type ClaimStatus = "pending" | "approved" | "denied" | "in_review";

export interface ClaimInput {
  text?: string | null;
  policy_number?: string | null;
  claimant_name?: string | null;
  vehicle?: string | null;
  date_of_loss?: string | null;
  reported_date?: string | null;
  location?: string | null;
  loss_description?: string | null;
  claimed_amount?: number | null;
  police_report?: boolean;
  documents?: string[];
}

export interface Claim {
  policy_number: string;
  claimant_name: string;
  vehicle: string;
  date_of_loss: string;
  reported_date: string;
  location: string;
  loss_description: string;
  claimed_amount: number;
  police_report: boolean;
  documents: string[];
}

export interface Policy {
  policy_number: string;
  holder: string;
  vehicle: string;
  start_date: string;
  end_date: string;
  premium_paid: boolean;
  coverages: Record<string, { deductible: number; limit: number }>;
  prior_claims: string[];
}

export interface Citation {
  clause_id: string;
  section: string;
  title: string;
  text: string;
  score: number;
}

export interface FraudFlag {
  code: string;
  label: string;
  weight: number;
  detail: string;
}

export interface TraceStep {
  node: string;
  label: string;
  status: "done" | "failed" | "skipped";
  started_at: string;
  duration_ms: number;
  summary: string;
  details: string[];
}

export interface EvaluationResult {
  decision: Decision;
  payout: number;
  confidence: number;
  risk_score: number;
  risk_level: "low" | "medium" | "high";
  coverage_type: "collision" | "comprehensive" | null;
  rationale: string;
  review_reasons: string[];
  policy_check: { passed: boolean; reason: string; checks: { name: string; passed: boolean; detail: string }[] } | null;
  citations: Citation[];
  cited_clauses: string[];
  fraud_flags: FraudFlag[];
  settlement: { approved_cost: number; deductible: number; limit: number; payout: number; capped: boolean } | null;
  trace: TraceStep[];
  mode: "demo" | "live";
  total_duration_ms: number;
}

export interface AuditEvent {
  at: string;
  actor: string;
  action: string;
  note: string;
}

export interface ClaimRecord {
  id: string;
  created_at: string;
  status: ClaimStatus;
  input: ClaimInput;
  claim: Claim | null;
  policy: Policy | null;
  result: EvaluationResult | null;
  audit: AuditEvent[];
}

export interface Stats {
  total: number;
  by_status: Record<ClaimStatus, number>;
  auto_decision_rate: number;
  approval_rate: number;
  total_payout: number;
  avg_decision_ms: number;
  avg_risk: number;
  timeline: { date: string; approved: number; denied: number; in_review: number; pending: number }[];
  top_flags: { label: string; count: number }[];
}

export const STEPS: { node: string; label: string; hint: string }[] = [
  { node: "intake", label: "Intake", hint: "Parse claim into structured fields" },
  { node: "policy_check", label: "Policy check", hint: "Existence, premium, coverage period" },
  { node: "retrieval", label: "Policy retrieval", hint: "Find governing clauses" },
  { node: "coverage", label: "Coverage decision", hint: "Reason over retrieved clauses" },
  { node: "fraud", label: "Fraud signals", hint: "Rule-based risk scoring" },
  { node: "settlement", label: "Settlement", hint: "Cost less deductible, capped at limit" },
  { node: "review_gate", label: "Human review gate", hint: "Route on risk and confidence" },
];

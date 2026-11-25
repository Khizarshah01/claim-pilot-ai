import type { ClaimInput, ClaimRecord, Stats, TraceStep } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listClaims: () => request<ClaimRecord[]>("/claims"),
  getClaim: (id: string) => request<ClaimRecord>(`/claims/${id}`),
  createClaim: (input: ClaimInput) => request<ClaimRecord>("/claims", { method: "POST", body: JSON.stringify(input) }),
  action: (id: string, action: "approve" | "deny" | "escalate", note = "") =>
    request<ClaimRecord>(`/claims/${id}/action`, { method: "POST", body: JSON.stringify({ action, note }) }),
  stats: () => request<Stats>("/stats"),
};

export type StreamEvent =
  | { event: "claim"; data: { id: string } }
  | { event: "step_start"; data: { node: string; label: string } }
  | { event: "step_end"; data: { step: TraceStep } }
  | { event: "result"; data: ClaimRecord }
  | { event: "error"; data: { message: string } };

/** POST /claims/evaluate and yield parsed SSE events as they arrive. */
export async function* evaluateStream(body: { claim_id?: string; claim?: ClaimInput }, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${API_URL}/claims/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Evaluation failed (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data) yield { event, data: JSON.parse(data) } as StreamEvent;
    }
  }
}

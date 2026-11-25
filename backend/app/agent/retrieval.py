"""Policy retrieval: BM25 over clause-level chunks of the policy document.

Lexical BM25 keeps the demo fully offline and makes every citation traceable to an exact
clause. Swapping in an embedding store only requires replacing `PolicyIndex.search`.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache

from app.config import DATA_DIR
from app.models import Citation, Claim, CoverageType

_TOKEN = re.compile(r"[a-z0-9]+")
_STOP = set(
    "a an and are as at be by for from has in is it its of on or our that the this to was we "
    "were will with you your any not if such may all which who i my me".split()
)


def tokenize(text: str) -> list[str]:
    toks = [t for t in _TOKEN.findall(text.lower()) if t not in _STOP and len(t) > 1]
    return [_stem(t) for t in toks]


def _stem(t: str) -> str:
    for suf in ("ing", "ed", "es", "s"):
        if t.endswith(suf) and len(t) - len(suf) >= 3:
            return t[: -len(suf)]
    return t


@dataclass
class Clause:
    clause_id: str
    section: str
    title: str
    text: str
    tokens: list[str]


def parse_policy_document(md: str) -> list[Clause]:
    clauses: list[Clause] = []
    section = ""
    current: dict | None = None
    for line in md.splitlines():
        if line.startswith("## "):
            section = line[3:].strip()
        elif line.startswith("### "):
            if current:
                clauses.append(_finish(current))
            head = line[4:].strip()
            cid, _, title = head.partition(" ")
            current = {"clause_id": cid, "section": section, "title": title, "lines": []}
        elif current is not None and line.strip():
            current["lines"].append(line.strip())
    if current:
        clauses.append(_finish(current))
    return clauses


def _finish(c: dict) -> Clause:
    text = " ".join(c["lines"])
    return Clause(
        clause_id=c["clause_id"],
        section=c["section"],
        title=c["title"],
        text=text,
        tokens=tokenize(f"{c['title']} {text}"),
    )


class PolicyIndex:
    def __init__(self, clauses: list[Clause], k1: float = 1.4, b: float = 0.75):
        self.clauses = clauses
        self.k1, self.b = k1, b
        self.avgdl = sum(len(c.tokens) for c in clauses) / max(len(clauses), 1)
        df: Counter[str] = Counter()
        for c in clauses:
            df.update(set(c.tokens))
        n = len(clauses)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.tf = [Counter(c.tokens) for c in clauses]

    def search(self, query: str, k: int = 5) -> list[tuple[Clause, float]]:
        q = tokenize(query)
        scored: list[tuple[Clause, float]] = []
        for clause, tf in zip(self.clauses, self.tf):
            dl = len(clause.tokens)
            s = 0.0
            for t in q:
                if t not in tf:
                    continue
                f = tf[t]
                s += self.idf[t] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * dl / self.avgdl))
            if s > 0:
                scored.append((clause, s))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:k]


@lru_cache
def get_index() -> PolicyIndex:
    return PolicyIndex(parse_policy_document((DATA_DIR / "policy_document.md").read_text()))


_COMPREHENSIVE_TERMS = (
    "theft", "stolen", "hail", "flood", "fire", "vandal", "deer", "animal", "tree", "branch",
    "windshield", "glass", "windstorm", "rock", "falling",
)


def classify_coverage(description: str) -> CoverageType:
    d = description.lower()
    return "comprehensive" if any(t in d for t in _COMPREHENSIVE_TERMS) else "collision"


def build_query(claim: Claim, coverage_type: CoverageType) -> str:
    return f"{claim.loss_description} {coverage_type} insuring agreement deductible limit exclusion"


def retrieve(claim: Claim, coverage_type: CoverageType, k: int = 4) -> list[Citation]:
    """Multi-query retrieval: a coverage query plus an exclusion probe over Part B only."""
    index = get_index()
    hits = index.search(build_query(claim, coverage_type), k=k)
    seen = {c.clause_id for c, _ in hits}
    probe = [(c, s) for c, s in index.search(claim.loss_description, k=len(index.clauses))
             if c.clause_id.startswith("B.") and c.clause_id not in seen][:2]
    hits = hits + probe
    top = max((s for _, s in hits), default=1.0)
    return [
        Citation(
            clause_id=c.clause_id,
            section=c.section,
            title=c.title,
            text=c.text,
            score=round(s / top, 3),
        )
        for c, s in hits
    ]

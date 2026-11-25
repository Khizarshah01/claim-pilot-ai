"use client";

import { motion } from "motion/react";

export function ConfidenceRing({ value, size = 72 }: { value: number; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 0.85 ? "var(--success)" : value >= 0.7 ? "var(--warning)" : "var(--danger)";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="tnum text-sm font-semibold tracking-tight">{Math.round(value * 100)}%</span>
      </div>
    </div>
  );
}

export function RiskGauge({ score }: { score: number }) {
  // half-circle gauge, 0-100
  const w = 132;
  const r = 54;
  const cx = w / 2;
  const cy = 62;
  const len = Math.PI * r;
  const color = score > 60 ? "var(--danger)" : score >= 30 ? "var(--warning)" : "var(--success)";
  const path = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <div className="relative" style={{ width: w, height: 72 }}>
      <svg width={w} height={72}>
        <path d={path} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth={6} strokeLinecap="round" />
        <motion.path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={len}
          initial={{ strokeDashoffset: len }}
          animate={{ strokeDashoffset: len * (1 - score / 100) }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        />
        {/* threshold tick at 60 */}
        {(() => {
          const a = Math.PI * (1 - 0.6);
          const x1 = cx + (r - 9) * Math.cos(a), y1 = cy - (r - 9) * Math.sin(a);
          const x2 = cx + (r + 5) * Math.cos(a), y2 = cy - (r + 5) * Math.sin(a);
          return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgb(255 255 255 / 0.35)" strokeWidth={1.5} />;
        })()}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <span className="tnum text-xl font-semibold tracking-tight">{score}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
    </div>
  );
}

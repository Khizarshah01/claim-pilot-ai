export function LogoMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--primary)" />
      <path d="M7 12.5l3.2 3.2L17 8.8" stroke="#04140d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

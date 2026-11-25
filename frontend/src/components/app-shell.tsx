"use client";

import { BarChart3, FilePlus2, Inbox, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { cn } from "@/lib/utils";
import { CommandPalette, useCommandPalette } from "./command-palette";
import { LogoMark } from "./logo";

const NAV = [
  { href: "/", label: "Inbox", icon: Inbox },
  { href: "/claims/new", label: "New claim", icon: FilePlus2 },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const palette = useCommandPalette();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="sticky top-0 z-30 flex shrink-0 items-center gap-1 border-b border-border bg-sidebar/95 px-3 py-2 backdrop-blur md:h-screen md:w-56 md:flex-col md:items-stretch md:border-r md:border-b-0 md:px-3 md:py-4">
        <Link href="/" className="mr-2 flex items-center gap-2 px-2 md:mr-0 md:mb-5">
          <LogoMark />
          <span className="text-sm font-semibold tracking-tight">ClaimPilot</span>
        </Link>
        <button
          onClick={() => palette.setOpen(true)}
          className="mb-3 hidden items-center gap-2 rounded-md border border-border bg-white/[0.02] px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors duration-150 hover:bg-white/[0.04] md:flex"
        >
          <Search className="size-3.5" />
          <span className="flex-1">Search</span>
          <kbd className="rounded border border-border px-1 text-[10px]">⌘K</kbd>
        </button>
        <Suspense fallback={<NavLinks pathname="" />}>
          <ActiveNav />
        </Suspense>
        <button onClick={() => palette.setOpen(true)} className="ml-auto rounded-md p-2 text-muted-foreground md:hidden" aria-label="Search">
          <Search className="size-4" />
        </button>
        <div className="mt-auto hidden rounded-md border border-border p-2.5 text-xs text-muted-foreground md:block">
          <div className="mb-1 flex items-center gap-1.5 text-foreground">
            <span className="size-1.5 rounded-full bg-primary" /> Demo mode
          </div>
          Seeded claims and canned LLM responses. No API keys required.
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
      <CommandPalette open={palette.open} setOpen={palette.setOpen} />
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-5 sm:px-6">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function ActiveNav() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string }) {
  const active = (href: string) =>
    href === "/" ? pathname === "/" || (pathname.startsWith("/claims/") && pathname !== "/claims/new") : pathname.startsWith(href);
  return (
    <nav className="flex gap-0.5 md:flex-col">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-150",
            active(href) ? "bg-white/[0.06] text-foreground" : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          <span className="hidden sm:inline">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

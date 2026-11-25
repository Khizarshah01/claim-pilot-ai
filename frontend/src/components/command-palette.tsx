"use client";

import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import { BarChart3, FilePlus2, Inbox, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { ClaimRecord } from "@/lib/types";
import { StatusPill } from "./status-pill";

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const router = useRouter();
  const [claims, setClaims] = useState<ClaimRecord[]>([]);

  useEffect(() => {
    if (open) api.listClaims().then(setClaims).catch(() => setClaims([]));
  }, [open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router, setOpen],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-white/10 bg-popover shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            <Command label="Search claims" loop>
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="size-4 text-muted-foreground" />
                <Command.Input
                  autoFocus
                  placeholder="Search claims, claimants, policies…"
                  className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
                />
                <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
              </div>
              <Command.List className="max-h-[360px] overflow-y-auto p-1.5">
                <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">No matching claims.</Command.Empty>
                <Command.Group heading="Navigate" className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
                  <PaletteItem onSelect={() => go("/")} icon={<Inbox className="size-4" />} label="Claims inbox" />
                  <PaletteItem onSelect={() => go("/claims/new")} icon={<FilePlus2 className="size-4" />} label="New claim" />
                  <PaletteItem onSelect={() => go("/analytics")} icon={<BarChart3 className="size-4" />} label="Analytics" />
                </Command.Group>
                <Command.Group heading="Claims" className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
                  {claims.map((c) => (
                    <Command.Item
                      key={c.id}
                      value={`${c.id} ${c.claim?.claimant_name ?? ""} ${c.claim?.policy_number ?? ""} ${c.claim?.vehicle ?? ""}`}
                      onSelect={() => go(`/claims/${c.id}`)}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm data-[selected=true]:bg-white/[0.06]"
                    >
                      <span className="tnum w-20 font-mono text-xs text-muted-foreground">{c.id}</span>
                      <span className="flex-1 truncate">{c.claim?.claimant_name ?? "Unparsed claim"}</span>
                      <span className="tnum text-xs text-muted-foreground">{money(c.claim?.claimed_amount)}</span>
                      <StatusPill status={c.status} />
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PaletteItem({ onSelect, icon, label }: { onSelect: () => void; icon: React.ReactNode; label: string }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-foreground"
    >
      {icon}
      {label}
    </Command.Item>
  );
}

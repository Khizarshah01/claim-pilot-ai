"use client";

import { AnimatePresence, motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { subscribeInFlight } from "@/lib/api";

/** Shown when an API request takes more than 3s, e.g. while a free-tier host wakes from sleep. */
export function WakingHint() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeInFlight((n) => {
      clearTimeout(timer);
      if (n > 0) timer = setTimeout(() => setSlow(true), 3000);
      else setSlow(false);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  return (
    <AnimatePresence>
      {slow && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.16 }}
          role="status"
          className="fixed right-4 bottom-4 left-4 z-40 flex items-start gap-2.5 rounded-lg border border-border bg-popover px-3.5 py-3 text-sm shadow-xl shadow-black/40 sm:left-auto sm:max-w-sm"
        >
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
          <div>
            <p className="font-medium">Waking up the demo API</p>
            <p className="mt-0.5 text-xs text-muted-foreground">It runs on a free host that sleeps when idle. The first load can take up to a minute.</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

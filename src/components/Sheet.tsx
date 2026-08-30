"use client";

/**
 * A bottom sheet on a phone, a centred panel on a wider screen.
 *
 * Closes on Escape and on a backdrop click, traps nothing else — the app has
 * no nested dialogs, so a focus trap would be more machinery than the job
 * needs. Body scroll is locked while one is open.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, type ReactNode } from "react";

import { Button, cn } from "./ui";

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-ink/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn(
              "relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface",
              "rounded-t-2xl sm:rounded-2xl sm:border sm:border-rule sm:shadow-xl",
              wide ? "sm:max-w-2xl" : "sm:max-w-md",
            )}
            initial={reduced ? { opacity: 0 } : { y: "6%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { y: "6%", opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2, ease: [0.22, 0.9, 0.3, 1] }}
          >
            <header className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
                {subtitle ? (
                  <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{subtitle}</p>
                ) : null}
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
                Close
              </Button>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>

            {footer ? (
              <footer className="border-t border-rule bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

"use client";

/**
 * Adding an expense — the two ways in.
 *
 * Photographing a receipt is the fast path; typing is always available and
 * never hidden behind a failure. The photo path hands off to the review
 * screen, where the confidence rules live.
 */

import { useState } from "react";

import { useLedger } from "@/store/useLedger";

import { ManualExpenseForm } from "./ExpenseForm";
import { ReceiptFlow } from "./ReceiptFlow";
import { Sheet } from "./Sheet";
import { cn } from "./ui";

type Mode = "choose" | "manual" | "receipt";

export function AddExpenseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = useLedger((s) => s.settings.today);
  const expenses = useLedger((s) => s.expenses);
  const addExpense = useLedger((s) => s.addExpense);
  const [mode, setMode] = useState<Mode>("choose");

  const close = () => {
    onClose();
    // Let the exit animation finish before resetting, so the panel does not
    // visibly flip back to the chooser on its way out.
    setTimeout(() => setMode("choose"), 220);
  };

  const knownCategories = Array.from(new Set(expenses.map((e) => e.category)));

  return (
    <Sheet
      open={open}
      onClose={close}
      wide={mode === "receipt"}
      title={
        mode === "receipt"
          ? "Check what was read"
          : mode === "manual"
            ? "Type in an expense"
            : "Add an expense"
      }
      subtitle={
        mode === "choose"
          ? "Photograph the receipt, or type it in — both end up in the same ledger."
          : undefined
      }
    >
      {mode === "choose" ? (
        <div className="grid gap-3">
          <ChoiceButton
            title="Photograph a receipt"
            body="Reads the amount, date and shop from the picture. You check every field before it saves."
            onClick={() => setMode("receipt")}
          />
          <ChoiceButton
            title="Type it in"
            body="Four fields. Faster than a photo when you already know the number."
            onClick={() => setMode("manual")}
          />
        </div>
      ) : null}

      {mode === "manual" ? (
        <ManualExpenseForm
          today={today}
          knownCategories={knownCategories}
          onSubmit={(v) => {
            addExpense({ ...v, source: "manual" });
            close();
          }}
          onCancel={() => setMode("choose")}
        />
      ) : null}

      {mode === "receipt" ? (
        <ReceiptFlow
          today={today}
          knownCategories={knownCategories}
          onSaved={close}
          onBack={() => setMode("choose")}
        />
      ) : null}
    </Sheet>
  );
}

function ChoiceButton({
  title,
  body,
  onClick,
}: {
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border border-rule-strong bg-surface px-4 py-3.5 text-left",
        "transition-colors hover:bg-sunk",
      )}
    >
      <p className="text-[14px] font-medium text-ink">{title}</p>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-3">{body}</p>
    </button>
  );
}

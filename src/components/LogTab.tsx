"use client";

/**
 * Every expense, newest first, grouped by month.
 *
 * Editing here is the fastest way to check the constraint that the insights
 * move when the numbers move: change one amount and the dashboard, the
 * forecast and every pocket date shift with it.
 */

import { useState } from "react";

import { formatDate, monthKeyOf, monthLabel } from "@/lib/dates";
import type { Forecast } from "@/lib/forecast";
import { toPaisa } from "@/lib/money";
import { useLedger } from "@/store/useLedger";
import type { Expense } from "@/lib/types";

import { ManualExpenseForm } from "./ExpenseForm";
import { Sheet } from "./Sheet";
import { Button, Card, CardHead, EmptyState, Pill, Taka } from "./ui";

export function LogTab({ fc, onAdd }: { fc: Forecast; onAdd: () => void }) {
  const expenses = useLedger((s) => s.expenses);
  const updateExpense = useLedger((s) => s.updateExpense);
  const removeExpense = useLedger((s) => s.removeExpense);
  const [editing, setEditing] = useState<Expense | null>(null);

  const recurringKeys = new Set(
    fc.recurring.map((r) => `${r.shop.toLowerCase()}|${r.category.toLowerCase()}`),
  );

  const sorted = [...expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const months: { key: string; rows: Expense[] }[] = [];
  for (const e of sorted) {
    const key = monthKeyOf(e.date);
    let bucket = months.find((m) => m.key === key);
    if (!bucket) months.push((bucket = { key, rows: [] }));
    bucket.rows.push(e);
  }

  if (expenses.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nothing recorded yet"
          body="Add your first expense by photographing a receipt or typing it in. Two months of history is what makes the forecast and the month-on-month comparison work."
          action={
            <Button variant="primary" onClick={onAdd}>
              Add an expense
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <>
      {months.map((m) => {
        const total = m.rows.reduce((s, e) => s + e.amount, 0);
        return (
          <Card key={m.key}>
            <CardHead
              title={monthLabel(m.key)}
              hint={`${m.rows.length} expense${m.rows.length === 1 ? "" : "s"}`}
              right={<Taka value={total} className="text-[15px] font-semibold text-ink" />}
            />
            <ul className="divide-y divide-rule border-t border-rule">
              {m.rows.map((e) => {
                const isRecurring = recurringKeys.has(
                  `${e.shop.toLowerCase()}|${e.category.toLowerCase()}`,
                );
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => setEditing(e)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunk"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-[14px] font-medium text-ink">
                            {e.shop}
                          </span>
                          {isRecurring ? <Pill>recurring</Pill> : null}
                          {e.source === "receipt" ? <Pill>from receipt</Pill> : null}
                        </div>
                        <p className="mt-0.5 text-[12px] text-ink-3">
                          {e.category} · {formatDate(e.date, "long")}
                        </p>
                      </div>
                      <Taka
                        value={e.amount}
                        decimals={2}
                        className="text-[14px] font-medium text-ink"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit expense"
        subtitle="Changing an amount moves the dashboard, the forecast and every pocket date."
      >
        {editing ? (
          <>
            <ManualExpenseForm
              today={fc.today}
              knownCategories={fc.categories.map((c) => c.category)}
              initial={{
                amount: (editing.amount / 100).toFixed(2),
                date: editing.date,
                shop: editing.shop,
                category: editing.category,
              }}
              submitLabel="Save changes"
              onSubmit={(v) => {
                updateExpense(editing.id, {
                  amount: v.amount,
                  date: v.date,
                  shop: v.shop,
                  category: v.category,
                });
                setEditing(null);
              }}
            />
            <div className="mt-4 border-t border-rule pt-4">
              <Button
                variant="danger"
                className="w-full"
                onClick={() => {
                  removeExpense(editing.id);
                  setEditing(null);
                }}
              >
                Delete this expense
              </Button>
            </div>
          </>
        ) : null}
      </Sheet>
    </>
  );
}

/** Exported for the receipt flow, which builds the same shape. */
export function draftToExpense(v: {
  amount: string;
  date: string;
  shop: string;
  category: string;
}) {
  return {
    amount: toPaisa(v.amount),
    date: v.date,
    shop: v.shop.trim(),
    category: v.category,
  };
}

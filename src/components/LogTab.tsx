"use client";

/**
 * Every expense, newest first, grouped by month.
 *
 * A dense table from `sm` up and stacked rows on a phone. Editing here is the
 * fastest way to check the constraint that the insights move when the numbers
 * move: change one amount and the dashboard, the forecast and every pocket date
 * shift with it.
 */

import { useState } from "react";

import { formatDate, monthKeyOf, monthLabel } from "@/lib/dates";
import type { Forecast } from "@/lib/forecast";
import { useLedger } from "@/store/useLedger";
import type { Expense } from "@/lib/types";

import { ManualExpenseForm } from "./ExpenseForm";
import { Sheet } from "./Sheet";
import { Button, Card, CardHead, EmptyState, Pill, Taka, cn } from "./ui";

export function LogTab({ fc, onAdd }: { fc: Forecast; onAdd: () => void }) {
  const expenses = useLedger((s) => s.expenses);
  const updateExpense = useLedger((s) => s.updateExpense);
  const removeExpense = useLedger((s) => s.removeExpense);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [query, setQuery] = useState("");

  const recurringKeys = new Set(
    fc.recurring.map((r) => `${r.shop.toLowerCase()}|${r.category.toLowerCase()}`),
  );

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? expenses.filter(
        (e) =>
          e.shop.toLowerCase().includes(needle) || e.category.toLowerCase().includes(needle),
      )
    : expenses;

  const sorted = [...filtered].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by shop or category"
            aria-label="Filter expenses"
            className="h-10 w-full rounded-lg border border-rule-strong bg-surface px-3 text-[13px] text-ink placeholder:text-ink-3/70"
          />
        </div>
        <p className="text-[12px] text-ink-3">
          {filtered.length} of {expenses.length} expense
          {expenses.length === 1 ? "" : "s"}
          {needle ? ` matching “${query.trim()}”` : ""}
        </p>
      </div>

      {months.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing matches that"
            body="No expense has a shop or category containing what you typed. Clear the filter to see everything again."
            action={
              <Button variant="secondary" onClick={() => setQuery("")}>
                Clear the filter
              </Button>
            }
          />
        </Card>
      ) : null}

      {months.map((m) => {
        const total = m.rows.reduce((s, e) => s + e.amount, 0);
        return (
          <Card key={m.key}>
            <CardHead
              title={monthLabel(m.key)}
              hint={`${m.rows.length} expense${m.rows.length === 1 ? "" : "s"}`}
              right={
                <span className="figure text-[17px] text-ink">
                  <Taka value={total} />
                </span>
              }
            />

            {/* Table from sm up; stacked rows on a phone. */}
            <div className="border-t border-rule">
              <table className="w-full">
                <thead className="hidden sm:table-header-group">
                  <tr className="border-b border-rule">
                    <th className="eyebrow px-5 py-2 text-left font-semibold">Shop</th>
                    <th className="eyebrow px-3 py-2 text-left font-semibold">Category</th>
                    <th className="eyebrow px-3 py-2 text-left font-semibold">Date</th>
                    <th className="eyebrow px-5 py-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {m.rows.map((e) => {
                    const isRecurring = recurringKeys.has(
                      `${e.shop.toLowerCase()}|${e.category.toLowerCase()}`,
                    );
                    return (
                      <tr
                        key={e.id}
                        tabIndex={0}
                        role="button"
                        onClick={() => setEditing(e)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            setEditing(e);
                          }
                        }}
                        className={cn(
                          "cursor-pointer border-b border-rule transition-colors last:border-0",
                          "hover:bg-sunk focus-visible:bg-sunk",
                          "flex flex-col px-5 py-2.5 sm:table-row sm:px-0 sm:py-0",
                        )}
                      >
                        <td className="pb-0.5 sm:table-cell sm:px-5 sm:py-2.5">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[13.5px] font-medium text-ink">
                              {e.shop}
                            </span>
                            {isRecurring ? <Pill>recurring</Pill> : null}
                            {e.source === "receipt" ? <Pill>from receipt</Pill> : null}
                          </span>
                        </td>
                        <td className="sm:table-cell sm:px-3 sm:py-2.5">
                          <span className="inline-block rounded bg-sunk px-1.5 py-0.5 text-[11px] text-ink-2 sm:bg-transparent sm:px-0 sm:text-[12.5px]">
                            {e.category}
                          </span>
                          <span className="ml-1.5 text-[11.5px] text-ink-3 sm:hidden">
                            {formatDate(e.date, "long")}
                          </span>
                        </td>
                        <td className="hidden text-[12.5px] text-ink-3 sm:table-cell sm:px-3 sm:py-2.5">
                          {formatDate(e.date, "long")}
                        </td>
                        <td className="pt-1 text-left sm:table-cell sm:px-5 sm:py-2.5 sm:text-right">
                          <span className="tnum text-[13.5px] font-semibold text-ink">
                            <Taka value={e.amount} decimals={2} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
    </div>
  );
}

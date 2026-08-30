"use client";

/**
 * Typing an expense in by hand.
 *
 * This is the path that keeps requirement 1 alive whatever happens to the
 * camera or the network, so it exists on its own terms rather than as a
 * fallback bolted onto the receipt flow.
 */

import { useState } from "react";

import { CATEGORIES } from "@/lib/types";
import { monthKeyOf } from "@/lib/dates";
import { toPaisa } from "@/lib/money";
import { Button, Input, Label, Select } from "./ui";

export type ExpenseDraft = {
  amount: string;
  date: string;
  shop: string;
  category: string;
};

export function validateDraft(d: ExpenseDraft) {
  const errors: Partial<Record<keyof ExpenseDraft, string>> = {};
  const amount = Number(d.amount);
  if (!d.amount.trim()) errors.amount = "Enter the amount";
  else if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Must be more than zero";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) errors.date = "Pick a date";
  if (!d.shop.trim()) errors.shop = "Where was it spent?";
  if (!d.category.trim()) errors.category = "Pick a category";
  return errors;
}

export function ExpenseFields({
  draft,
  onChange,
  errors,
  categories,
  autoFocusAmount = false,
}: {
  draft: ExpenseDraft;
  onChange: (patch: Partial<ExpenseDraft>) => void;
  errors: Partial<Record<keyof ExpenseDraft, string>>;
  categories: string[];
  autoFocusAmount?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="ex-amount">Amount</Label>
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">
            ৳
          </span>
          <Input
            id="ex-amount"
            inputMode="decimal"
            type="number"
            step="0.01"
            min="0"
            autoFocus={autoFocusAmount}
            className="pl-7 text-[17px] font-medium"
            placeholder="0.00"
            value={draft.amount}
            invalid={Boolean(errors.amount)}
            onChange={(e) => onChange({ amount: e.target.value })}
          />
        </div>
        {errors.amount ? <p className="mt-1 text-[12px] text-out">{errors.amount}</p> : null}
      </div>

      <div>
        <Label htmlFor="ex-shop">Shop</Label>
        <Input
          id="ex-shop"
          className="mt-1.5"
          placeholder="Meena Bazar"
          autoComplete="off"
          value={draft.shop}
          invalid={Boolean(errors.shop)}
          onChange={(e) => onChange({ shop: e.target.value })}
        />
        {errors.shop ? <p className="mt-1 text-[12px] text-out">{errors.shop}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ex-date">Date</Label>
          <Input
            id="ex-date"
            type="date"
            className="mt-1.5"
            value={draft.date}
            invalid={Boolean(errors.date)}
            onChange={(e) => onChange({ date: e.target.value })}
          />
          {errors.date ? <p className="mt-1 text-[12px] text-out">{errors.date}</p> : null}
        </div>
        <div>
          <Label htmlFor="ex-category">Category</Label>
          <Select
            id="ex-category"
            className="mt-1.5"
            value={draft.category}
            onChange={(e) => onChange({ category: e.target.value })}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}

export function ManualExpenseForm({
  today,
  knownCategories,
  initial,
  submitLabel = "Save expense",
  onSubmit,
  onCancel,
}: {
  today: string;
  knownCategories: string[];
  initial?: Partial<ExpenseDraft>;
  submitLabel?: string;
  onSubmit: (v: { amount: number; date: string; shop: string; category: string }) => void;
  onCancel?: () => void;
}) {
  const categories = Array.from(new Set([...CATEGORIES, ...knownCategories]));
  const [draft, setDraft] = useState<ExpenseDraft>({
    amount: initial?.amount ?? "",
    date: initial?.date ?? today,
    shop: initial?.shop ?? "",
    category: initial?.category ?? categories[0],
  });
  const [touched, setTouched] = useState(false);

  const errors = validateDraft(draft);
  const valid = Object.keys(errors).length === 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!valid) return;
        onSubmit({
          amount: toPaisa(draft.amount),
          date: draft.date,
          shop: draft.shop.trim(),
          category: draft.category,
        });
      }}
    >
      <ExpenseFields
        draft={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        errors={touched ? errors : {}}
        categories={categories}
        autoFocusAmount
      />

      {monthKeyOf(draft.date) !== monthKeyOf(today) ? (
        <p className="mt-3 rounded-lg bg-sunk px-3 py-2 text-[12px] leading-snug text-ink-2">
          This date is outside the month you are viewing, so it will not appear in this
          month&apos;s dashboard.
        </p>
      ) : null}

      <div className="mt-5 flex gap-2">
        <Button type="submit" variant="primary" className="flex-1" disabled={touched && !valid}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

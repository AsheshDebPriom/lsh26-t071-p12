"use client";

/**
 * Requirement 1, the photograph half — and the constraint that goes with it.
 *
 * The rule, stated literally: a field read at or above the confidence
 * threshold is pre-filled and shown as read; a field below it renders **empty**,
 * marked in the uncertainty colour, saying plainly that it could not be read.
 * An amount the reader is not sure of is never filled in. The picture stays on
 * screen beside the fields so the number can be checked against the paper, and
 * Save stays disabled until every field has been confirmed by hand.
 *
 * The amber used here is reserved for this state and appears nowhere else in
 * the application.
 */

import { useRef, useState } from "react";

import { formatDate, monthKeyOf } from "@/lib/dates";
import { toPaisa } from "@/lib/money";
import { CATEGORIES, type ReceiptField, type ReceiptResponse } from "@/lib/types";
import { useLedger } from "@/store/useLedger";

import { Button, Input, Label, Pill, Select, cn } from "./ui";

/** At or above this a field is trusted enough to pre-fill. Below it, never. */
export const CONFIDENCE_THRESHOLD = 0.8;

export type ReceiptFlowProps = {
  today: string;
  knownCategories: string[];
  onSaved: () => void;
  onBack: () => void;
};

type Stage =
  | { kind: "pick" }
  | { kind: "reading" }
  | { kind: "failed"; message: string; canRetry: boolean }
  | { kind: "review"; response: Extract<ReceiptResponse, { ok: true }> };

type FieldState = {
  value: string;
  confirmed: boolean;
  /** True when the read came back below threshold and the box started empty. */
  wasUncertain: boolean;
  confidence: number;
};

export function ReceiptFlow({ today, knownCategories, onSaved, onBack }: ReceiptFlowProps) {
  const addExpense = useLedger((s) => s.addExpense);
  const expenses = useLedger((s) => s.expenses);

  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [preview, setPreview] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<ReceiptField, FieldState> | null>(null);
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [categorySource, setCategorySource] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const categories = Array.from(new Set([...CATEGORIES, ...knownCategories]));

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setStage({ kind: "failed", message: "That file is not a picture.", canRetry: true });
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
    }).catch(() => null);

    if (!dataUrl) {
      setStage({ kind: "failed", message: "That picture could not be opened.", canRetry: true });
      return;
    }

    setPreview(dataUrl);
    setStage({ kind: "reading" });

    try {
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: dataUrl.split(",")[1] ?? "",
          mimeType: file.type,
        }),
      });
      const json = (await res.json()) as ReceiptResponse;

      if (!json.ok) {
        setStage({ kind: "failed", message: json.error, canRetry: json.code !== "no_key" });
        return;
      }

      const { read } = json;
      const pass = (c: number) => c >= CONFIDENCE_THRESHOLD;

      setFields({
        // The constraint, in code: below the threshold the box starts empty.
        amount: {
          value:
            read.amount.value !== null && pass(read.amount.confidence)
              ? read.amount.value.toFixed(2)
              : "",
          confirmed: false,
          wasUncertain: !(read.amount.value !== null && pass(read.amount.confidence)),
          confidence: read.amount.confidence,
        },
        date: {
          value:
            read.date.value !== null && pass(read.date.confidence) ? read.date.value : "",
          confirmed: false,
          wasUncertain: !(read.date.value !== null && pass(read.date.confidence)),
          confidence: read.date.confidence,
        },
        shop: {
          value: read.shop.value !== null && pass(read.shop.confidence) ? read.shop.value : "",
          confirmed: false,
          wasUncertain: !(read.shop.value !== null && pass(read.shop.confidence)),
          confidence: read.shop.confidence,
        },
      });

      // The category is not read from the picture. If this shop is already in
      // the ledger, its usual category is offered — that comes from the user's
      // own history, not from the model.
      const shopName = read.shop.value?.trim().toLowerCase();
      const seen = shopName
        ? expenses.filter((e) => e.shop.trim().toLowerCase() === shopName)
        : [];
      if (seen.length > 0) {
        setCategory(seen[seen.length - 1].category);
        setCategorySource(seen[seen.length - 1].shop);
      } else {
        setCategorySource(null);
      }

      setStage({ kind: "review", response: json });
    } catch {
      setStage({
        kind: "failed",
        message: "The reader could not be reached. Check your connection, or type the expense in.",
        canRetry: true,
      });
    }
  }

  function reset() {
    setPreview(null);
    setFields(null);
    setCategorySource(null);
    setStage({ kind: "pick" });
  }

  /* ---------------- pick ---------------- */

  if (stage.kind === "pick" || stage.kind === "failed") {
    return (
      <div className="space-y-4">
        {stage.kind === "failed" ? (
          <div className="rounded-lg border border-out/30 bg-out-soft px-3 py-2.5">
            <p className="text-[13px] font-medium text-out">Could not read that receipt</p>
            <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{stage.message}</p>
          </div>
        ) : null}

        <button
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-rule-strong bg-sunk px-4 py-8 text-center transition-colors hover:bg-surface"
        >
          <span className="text-[14px] font-medium text-ink">Take or choose a photo</span>
          <span className="max-w-xs text-[12.5px] leading-snug text-ink-3">
            The whole receipt in frame and in focus reads best. JPEG, PNG or WebP, up to 5MB.
          </span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void handleFile(f);
          }}
        />

        <p className="text-[12px] leading-relaxed text-ink-3">
          Whatever is read is shown to you before anything is saved. Any field the reader is
          not confident about is left blank for you to fill in — an amount is never guessed.
        </p>

        <Button variant="secondary" className="w-full" onClick={onBack}>
          Type it in instead
        </Button>
      </div>
    );
  }

  /* ---------------- reading ---------------- */

  if (stage.kind === "reading") {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="The receipt being read"
              className="h-40 w-28 shrink-0 rounded-lg border border-rule object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1 space-y-3">
            {(["Amount", "Date", "Shop"] as const).map((label, i) => (
              <div key={label}>
                <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3">
                  {label}
                </p>
                <div
                  className="mt-1.5 h-9 animate-pulse rounded-lg bg-sunk"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              </div>
            ))}
          </div>
        </div>
        <p className="text-center text-[13px] text-ink-2" aria-live="polite">
          Reading the receipt…
        </p>
        <p className="text-center text-[12px] text-ink-3">
          This usually takes a few seconds.
        </p>
      </div>
    );
  }

  /* ---------------- review ---------------- */

  const f = fields!;
  const set = (k: ReceiptField, patch: Partial<FieldState>) =>
    setFields((prev) => (prev ? { ...prev, [k]: { ...prev[k], ...patch } } : prev));

  const amountValid = Number(f.amount.value) > 0;
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(f.date.value);
  const shopValid = f.shop.value.trim().length > 0;
  const allConfirmed = f.amount.confirmed && f.date.confirmed && f.shop.confirmed;
  const canSave = amountValid && dateValid && shopValid && allConfirmed;
  const uncertainCount = (["amount", "date", "shop"] as ReceiptField[]).filter(
    (k) => f[k].wasUncertain,
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,11rem)_1fr]">
        {/* The picture stays beside the fields so the figure can be checked
            against the paper without leaving the screen. */}
        <div className="sm:sticky sm:top-0 sm:self-start">
          {preview ? (
            <a href={preview} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="The receipt you photographed"
                className="max-h-56 w-full rounded-lg border border-rule object-contain bg-sunk sm:max-h-72"
              />
            </a>
          ) : null}
          <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
            Tap the picture to see it full size.
          </p>
        </div>

        <div className="space-y-3">
          {uncertainCount > 0 ? (
            <div className="rounded-lg border border-uncertain-rule bg-uncertain-soft px-3 py-2.5">
              <p className="text-[12.5px] font-medium text-uncertain">
                {uncertainCount} of 3 fields could not be read confidently
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-ink-2">
                Those boxes are left empty rather than filled with a guess. Type them in from
                the picture.
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-sunk px-3 py-2.5">
              <p className="text-[12.5px] text-ink-2">
                All three fields were read confidently. Check each one against the picture and
                confirm it.
              </p>
            </div>
          )}

          <ReadField
            id="rf-amount"
            label="Amount"
            state={f.amount}
            valid={amountValid}
            prefix="৳"
            inputProps={{ type: "number", inputMode: "decimal", step: "0.01", min: "0" }}
            placeholder={f.amount.wasUncertain ? "Read it off the receipt" : "0.00"}
            onChange={(v) => set("amount", { value: v, confirmed: false })}
            onConfirm={() => set("amount", { confirmed: !f.amount.confirmed })}
          />

          <ReadField
            id="rf-date"
            label="Date"
            state={f.date}
            valid={dateValid}
            inputProps={{ type: "date" }}
            onChange={(v) => set("date", { value: v, confirmed: false })}
            onConfirm={() => set("date", { confirmed: !f.date.confirmed })}
          />

          <ReadField
            id="rf-shop"
            label="Shop"
            state={f.shop}
            valid={shopValid}
            placeholder={f.shop.wasUncertain ? "Read it off the receipt" : "Shop name"}
            onChange={(v) => set("shop", { value: v, confirmed: false })}
            onConfirm={() => set("shop", { confirmed: !f.shop.confirmed })}
          />

          <div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="rf-category">Category</Label>
              <span className="text-[11px] text-ink-3">
                {categorySource
                  ? `matched to your past ${categorySource} entries`
                  : "not read from the receipt"}
              </span>
            </div>
            <Select
              id="rf-category"
              className="mt-1.5"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
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

      {stage.response.read.note ? (
        <p className="rounded-lg bg-sunk px-3 py-2 text-[12px] leading-snug text-ink-2">
          Reader&apos;s note: {stage.response.read.note}
        </p>
      ) : null}

      {dateValid && monthKeyOf(f.date.value) !== monthKeyOf(today) ? (
        <p className="rounded-lg bg-sunk px-3 py-2 text-[12px] leading-snug text-ink-2">
          {formatDate(f.date.value, "long")} is outside the month you are viewing, so this
          will not appear in this month&apos;s dashboard.
        </p>
      ) : null}

      <div className="space-y-2 border-t border-rule pt-3">
        <Button
          variant="primary"
          className="w-full"
          disabled={!canSave}
          onClick={() => {
            const corrected = (["amount", "date", "shop"] as ReceiptField[]).filter(
              (k) => f[k].wasUncertain,
            );
            addExpense({
              amount: toPaisa(f.amount.value),
              date: f.date.value,
              shop: f.shop.value.trim(),
              category,
              source: "receipt",
              correctedFields: corrected.length > 0 ? corrected : undefined,
            });
            onSaved();
          }}
        >
          {canSave
            ? "Save expense"
            : allConfirmed
              ? "Fill in the missing fields"
              : `Confirm all three fields to save (${
                  [f.amount.confirmed, f.date.confirmed, f.shop.confirmed].filter(Boolean).length
                }/3)`}
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={reset}>
            Use a different photo
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Type it in
          </Button>
        </div>
        <p className="text-[11.5px] leading-snug text-ink-3">
          Read by {stage.response.model}. Nothing is saved until you confirm each field.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ReadField({
  id,
  label,
  state,
  valid,
  prefix,
  placeholder,
  inputProps,
  onChange,
  onConfirm,
}: {
  id: string;
  label: string;
  state: FieldState;
  valid: boolean;
  prefix?: string;
  placeholder?: string;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  onChange: (v: string) => void;
  onConfirm: () => void;
}) {
  const uncertain = state.wasUncertain;

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        uncertain ? "border-uncertain-rule bg-uncertain-soft" : "border-rule bg-surface",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {uncertain ? (
          <Pill tone="uncertain">could not be read</Pill>
        ) : (
          <Pill>read · {Math.round(state.confidence * 100)}% sure</Pill>
        )}
      </div>

      <div className="relative mt-1.5">
        {prefix ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">
            {prefix}
          </span>
        ) : null}
        <Input
          id={id}
          value={state.value}
          placeholder={placeholder}
          className={cn(
            prefix ? "pl-7" : "",
            uncertain ? "border-uncertain-rule" : "",
            label === "Amount" ? "text-[17px] font-medium" : "",
          )}
          onChange={(e) => onChange(e.target.value)}
          {...inputProps}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11.5px] leading-snug text-ink-3">
          {uncertain
            ? "Left blank on purpose — the reader was not sure enough to fill this in."
            : "Check this against the picture."}
        </p>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!valid}
          aria-pressed={state.confirmed}
          className={cn(
            "shrink-0 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors",
            "disabled:cursor-not-allowed disabled:opacity-45",
            state.confirmed
              ? "border-in bg-in text-white"
              : "border-rule-strong bg-surface text-ink hover:bg-sunk",
          )}
        >
          {state.confirmed ? "Confirmed" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

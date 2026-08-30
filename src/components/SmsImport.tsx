"use client";

/**
 * Importing a month of mobile money in one paste.
 *
 * In Dhaka most spending is a bKash or Nagad confirmation, not a paper receipt.
 * Those messages parse locally and deterministically, so this path needs no API
 * key, no network and no waiting — the review list appears as you paste.
 *
 * It keeps the receipt screen's discipline. A message whose amount could not be
 * read is shown in the reserved amber and is never imported with a guessed
 * figure. Money coming in is recognised and excluded, with the count stated, so
 * nothing disappears silently. A message already imported is marked and skipped
 * by its transaction id.
 */

import { useState } from "react";

import { formatDate } from "@/lib/dates";
import {
  categoryFromHistory,
  parseMessages,
  type ParsedMessage,
} from "@/lib/mobileMoney";
import { useLedger } from "@/store/useLedger";
import { CATEGORIES } from "@/lib/types";

import { Button, Pill, Select, Taka, cn } from "./ui";

const EXAMPLE = `Payment Tk 450.00 to Meena Bazar is successful. Fee Tk 0.00. Balance Tk 4,550.00. TrxID BKA7X2M9Q1 at 03/04/2026 10:15
Nagad: Payment successful. Amount: Tk 1,326.00, Merchant: Star Cineplex, TxnID: NGD77213
Rocket: Bill Pay Tk 2,599.50 to DESCO successful. TxnID RKT88120 at 07/04/2026
You have received Tk 50,000.00 from 01712345678. TrxID BKB1122Z at 01/04/2026`;

type Row = {
  message: ParsedMessage;
  include: boolean;
  shop: string;
  category: string;
  date: string;
  /** True when the message carried no date and the viewing date was used. */
  dateAssumed: boolean;
  duplicate: boolean;
};

/** Says why nothing can be imported, rather than guessing at one reason. */
function buttonReason(rows: Row[] | null): string {
  if (!rows || rows.length === 0) return "Nothing to import yet";
  if (rows.every((r) => r.duplicate)) return "All of these are already in your ledger";
  if (rows.some((r) => r.include && !r.shop.trim())) return "Name each payment to import";
  return "Tick the ones to import";
}

export function SmsImport({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const today = useLedger((s) => s.settings.today);
  const expenses = useLedger((s) => s.expenses);
  const addExpense = useLedger((s) => s.addExpense);

  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<ReturnType<typeof parseMessages> | null>(null);

  const categories = Array.from(
    new Set([...CATEGORIES, ...expenses.map((e) => e.category)]),
  );

  function read(next: string) {
    setText(next);
    if (!next.trim()) {
      setRows(null);
      setSummary(null);
      return;
    }
    const parsed = parseMessages(next);
    setSummary(parsed);
    setRows(
      parsed.usable.map((m) => {
        const duplicate = Boolean(
          m.reference && expenses.some((e) => e.reference === m.reference),
        );
        return {
          message: m,
          include: !duplicate,
          shop: m.shop ?? "",
          category: categoryFromHistory(m.shop, expenses) ?? categories[0],
          date: m.date ?? today,
          dateAssumed: m.date === null,
          duplicate,
        };
      }),
    );
  }

  const chosen = rows?.filter((r) => r.include && r.shop.trim()) ?? [];

  function importAll() {
    for (const r of chosen) {
      addExpense({
        amount: r.message.amount!,
        date: r.date,
        shop: r.shop.trim(),
        category: r.category,
        source: "sms",
        ...(r.message.reference ? { reference: r.message.reference } : {}),
      });
    }
    onDone();
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          Paste your bKash, Nagad, Rocket or Upay messages — one per line, as many as you
          like. They are read here on your phone: nothing is uploaded and no key is needed.
        </p>
        <textarea
          value={text}
          onChange={(e) => read(e.target.value)}
          rows={5}
          autoFocus
          placeholder="Paste your messages here…"
          aria-label="Mobile money messages"
          className="mt-2.5 w-full resize-y rounded-lg border border-rule-strong bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-ink placeholder:text-ink-3/70"
        />
        {!text.trim() ? (
          <button
            onClick={() => read(EXAMPLE)}
            className="mt-1.5 text-[12px] text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            Try it with four example messages
          </button>
        ) : null}
      </div>

      {summary ? (
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={rows && rows.length > 0 ? "in" : "neutral"}>
            {rows?.length ?? 0} to import
          </Pill>
          {summary.incoming.length > 0 ? (
            <Pill>{summary.incoming.length} money in — skipped</Pill>
          ) : null}
          {summary.unreadable.length > 0 ? (
            <Pill tone="uncertain">{summary.unreadable.length} could not be read</Pill>
          ) : null}
          {summary.ignored > 0 ? <Pill>{summary.ignored} not a message</Pill> : null}
        </div>
      ) : null}

      {summary && summary.incoming.length > 0 ? (
        <p className="rounded-lg bg-sunk px-3 py-2 text-[12px] leading-snug text-ink-2">
          Money coming in was recognised and left out — this is a record of spending, and
          filing a credit as an expense would be worse than skipping it.
        </p>
      ) : null}

      {summary && summary.unreadable.length > 0 ? (
        <div className="rounded-lg border border-uncertain-rule bg-uncertain-soft px-3 py-2.5">
          <p className="text-[12.5px] font-medium text-uncertain">
            {summary.unreadable.length} message
            {summary.unreadable.length === 1 ? "" : "s"} had no amount that could be read
          </p>
          <p className="mt-1 text-[12px] leading-snug text-ink-2">
            Left out rather than imported with a guessed figure. Add {summary.unreadable.length === 1 ? "it" : "them"} by
            hand if {summary.unreadable.length === 1 ? "it was" : "they were"} real.
          </p>
          <ul className="mt-1.5 space-y-1">
            {summary.unreadable.slice(0, 3).map((u, i) => (
              <li key={i} className="truncate text-[11.5px] text-ink-3">
                {u}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {rows && rows.length > 0 ? (
        <ul className="divide-y divide-rule rounded-lg border border-rule">
          {rows.map((r, i) => (
            <li key={i} className={cn("px-3 py-2.5", !r.include && "opacity-55")}>
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={r.include}
                  aria-label={`Import ${r.shop || "this message"}`}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#1a1817]"
                  onChange={(e) =>
                    setRows((prev) =>
                      prev!.map((x, k) => (k === i ? { ...x, include: e.target.checked } : x)),
                    )
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <input
                      value={r.shop}
                      placeholder="Name this payment"
                      aria-label="Shop"
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13.5px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-uncertain"
                      onChange={(e) =>
                        setRows((prev) =>
                          prev!.map((x, k) => (k === i ? { ...x, shop: e.target.value } : x)),
                        )
                      }
                    />
                    <span className="tnum shrink-0 text-[13.5px] font-semibold text-ink">
                      <Taka value={r.message.amount!} decimals={2} />
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Select
                      value={r.category}
                      aria-label="Category"
                      className="h-7 w-auto rounded border-rule px-1.5 text-[11.5px]"
                      onChange={(e) =>
                        setRows((prev) =>
                          prev!.map((x, k) => (k === i ? { ...x, category: e.target.value } : x)),
                        )
                      }
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                    <span className="text-[11.5px] text-ink-3">
                      {formatDate(r.date, "long")}
                    </span>
                    {r.dateAssumed ? <Pill tone="uncertain">no date in message</Pill> : null}
                    {r.duplicate ? <Pill>already imported</Pill> : null}
                    <span className="text-[11px] text-ink-3">{r.message.provider}</span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-2 border-t border-rule pt-3">
        <Button
          variant="primary"
          className="w-full"
          disabled={chosen.length === 0}
          onClick={importAll}
        >
          {chosen.length > 0
            ? `Import ${chosen.length} expense${chosen.length === 1 ? "" : "s"}`
            : buttonReason(rows)}
        </Button>
        <Button variant="secondary" className="w-full" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

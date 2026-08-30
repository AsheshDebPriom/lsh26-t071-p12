"use client";

/**
 * Requirement 2 — the monthly dashboard.
 *
 * Total spent against salary, a breakdown by category, the largest expenses,
 * and the change against last month.
 *
 * Laid out as a dashboard rather than a stack: a row of four figures across the
 * top, then a two-column grid. The category bars live in a fixed-width track
 * beside their labels, so a 3% category is a short bar in a short track rather
 * than a sliver stranded at the end of a 700px rule.
 *
 * Charts are one hue on purpose. Identity comes from the row label, not from
 * colour, so no categorical palette is cycled. Colour does one job: money out in
 * crimson, money in in steel blue, each always carrying a sign or an arrow so it
 * never means anything on its own.
 */

import { formatDate, monthName } from "@/lib/dates";
import type { Forecast } from "@/lib/forecast";
import { pctChange, type Paisa } from "@/lib/money";
import type { Expense } from "@/lib/types";

import { Card, CardHead, Delta, EmptyState, Taka, cn } from "./ui";

export function DashboardTab({ fc, expenses }: { fc: Forecast; expenses: Expense[] }) {
  if (fc.isEmpty) {
    return (
      <Card>
        <EmptyState
          title="No spending recorded yet"
          body="Once there are expenses in the ledger this screen shows the month against your salary, where the money went, and how it compares with last month."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <KpiRow fc={fc} />
      <SalaryMeter fc={fc} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <CategoryBreakdown fc={fc} />
        <div className="space-y-4">
          <LargestExpenses fc={fc} expenses={expenses} />
          <MonthOverMonth fc={fc} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The four figures that lead the page                                 */
/* ------------------------------------------------------------------ */

function KpiRow({ fc }: { fc: Forecast }) {
  const over = fc.endOfMonthPosition < 0;
  const share = fc.salary > 0 ? Math.round((fc.spentSoFar / fc.salary) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label="Spent so far"
        value={fc.spentSoFar}
        note={`${share}% of salary · day ${fc.daysElapsed} of ${fc.daysInMonth}`}
        lead
      />
      <Kpi
        label="Forecast for the rest"
        value={fc.projectedRemaining}
        note={`${fc.daysRemaining} ${fc.daysRemaining === 1 ? "day" : "days"} still to run`}
      />
      <Kpi
        label="Projected month total"
        value={fc.projectedMonthTotal}
        note={`against a ৳${(fc.salary / 100).toLocaleString("en-US")} salary`}
      />
      <Kpi
        label={over ? "Short at month end" : "Clear at month end"}
        value={Math.abs(fc.endOfMonthPosition)}
        note={over ? "spending outruns salary" : "left once the month plays out"}
        tone={over ? "out" : "in"}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  note,
  tone,
  lead,
}: {
  label: string;
  value: Paisa;
  note: string;
  tone?: "in" | "out";
  lead?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-rule bg-surface px-4 py-3.5 shadow-lift-1",
        tone === "out" && "border-out/25 bg-out-soft/40",
        tone === "in" && "border-in/25 bg-in-soft/40",
      )}
    >
      <p className="eyebrow">{label}</p>
      <p
        className={cn(
          "figure mt-2 leading-none",
          lead ? "text-[30px] lg:text-[34px]" : "text-[24px] lg:text-[27px]",
          tone === "out" ? "text-out" : tone === "in" ? "text-in" : "text-ink",
        )}
      >
        <Taka value={value} />
      </p>
      <p className="mt-2 text-[11.5px] leading-snug text-ink-3">{note}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Total spent against salary                                          */
/* ------------------------------------------------------------------ */

function SalaryMeter({ fc }: { fc: Forecast }) {
  const salary = Math.max(fc.salary, 1);
  const spentPct = Math.min(100, (fc.spentSoFar / salary) * 100);
  const projectedPct = Math.min(Math.max(0, 100 - spentPct), (fc.projectedRemaining / salary) * 100);
  const leftPct = Math.max(0, 100 - spentPct - projectedPct);

  return (
    <Card className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-[14px] font-semibold tracking-tight text-ink">
          The month against your salary
        </h2>
        <p className="text-[12px] text-ink-3">
          Solid is spent · hatched is forecast · the remainder is what would be left
        </p>
      </div>

      <div
        className="mt-3.5 flex h-4 w-full gap-[3px] overflow-hidden rounded-full bg-sunk"
        role="img"
        aria-label={`Spent ${Math.round(spentPct)} percent of salary, with a further ${Math.round(projectedPct)} percent forecast for the rest of the month`}
      >
        <div
          className="h-full rounded-full bg-bar transition-[width] duration-300"
          style={{ width: `${spentPct}%` }}
        />
        {projectedPct > 0.4 ? (
          <div
            className="hatch h-full rounded-full transition-[width] duration-300"
            style={{ width: `${projectedPct}%` }}
          />
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        <Legend swatch="bg-bar" label="Spent" value={fc.spentSoFar} pct={spentPct} />
        <Legend swatch="hatch" label="Still forecast" value={fc.projectedRemaining} pct={projectedPct} />
        <Legend
          swatch="bg-sunk border border-rule-strong"
          label={fc.endOfMonthPosition < 0 ? "Overspent" : "Would be left"}
          value={Math.abs(fc.endOfMonthPosition)}
          pct={leftPct}
          tone={fc.endOfMonthPosition < 0 ? "out" : "in"}
        />
      </div>
    </Card>
  );
}

function Legend({
  swatch,
  label,
  value,
  pct,
  tone,
}: {
  swatch: string;
  label: string;
  value: Paisa;
  pct: number;
  tone?: "in" | "out";
}) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", swatch)} />
      <span className="text-[12px] text-ink-3">{label}</span>
      <span
        className={cn(
          "tnum text-[13px] font-semibold",
          tone === "out" ? "text-out" : tone === "in" ? "text-in" : "text-ink",
        )}
      >
        <Taka value={value} />
      </span>
      <span className="tnum text-[11px] text-ink-3">{Math.round(pct)}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Breakdown by category                                               */
/* ------------------------------------------------------------------ */

function CategoryBreakdown({ fc }: { fc: Forecast }) {
  const rows = [...fc.categories].sort((a, b) => b.spentThisMonth - a.spentThisMonth);
  const max = Math.max(...rows.map((r) => Math.max(r.spentThisMonth, r.prevMonthTotal)), 1);
  const prev = monthName(fc.prevMonthKey);

  return (
    <Card>
      <CardHead
        title="Where the money went"
        hint={`Spent so far this month, against the same days of ${prev}. The rule on each track marks that category's whole ${prev} total.`}
        right={
          <span className="figure text-[17px] text-ink">
            <Taka value={fc.spentSoFar} />
          </span>
        }
      />

      <ul className="border-t border-rule px-5 py-1">
        {rows.map((r) => {
          const width = (r.spentThisMonth / max) * 100;
          const prevMark = (r.prevMonthTotal / max) * 100;
          const share = fc.spentSoFar > 0 ? (r.spentThisMonth / fc.spentSoFar) * 100 : 0;
          // Like-for-like: this month so far against the same days of last
          // month. Comparing a part-month against a whole one would show every
          // untouched category as a saving it has not actually made.
          const delta = r.spentThisMonth - r.prevMonthToDate;

          return (
            <li
              key={r.category}
              className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-2.5 last:border-0"
            >
              <span className="truncate text-[13px] font-medium text-ink">{r.category}</span>

              <span className="relative block h-2.5 w-full rounded-full bg-sunk">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-bar transition-[width] duration-300"
                  style={{ width: `${width}%` }}
                />
                {r.prevMonthTotal > 0 ? (
                  <span
                    aria-hidden
                    title={`${prev}: ৳${(r.prevMonthTotal / 100).toLocaleString("en-US")}`}
                    className="absolute top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-ink-3"
                    style={{ left: `calc(${Math.min(100, prevMark)}% - 1px)` }}
                  />
                ) : null}
              </span>

              <span className="flex w-[8.5rem] items-baseline justify-end gap-2 sm:w-[11rem]">
                <span className="tnum text-[11px] text-ink-3">{Math.round(share)}%</span>
                <span className="tnum w-[4.5rem] text-right text-[13.5px] font-semibold text-ink">
                  <Taka value={r.spentThisMonth} />
                </span>
                <span
                  className="hidden w-[4rem] justify-end sm:flex"
                  title={`Same ${fc.daysElapsed} days of ${prev}: ৳${(r.prevMonthToDate / 100).toLocaleString("en-US")}`}
                >
                  {r.prevMonthToDate > 0 || r.spentThisMonth > 0 ? (
                    <Delta value={delta} />
                  ) : null}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Largest expenses                                                    */
/* ------------------------------------------------------------------ */

function LargestExpenses({ fc, expenses }: { fc: Forecast; expenses: Expense[] }) {
  const rows = expenses
    .filter((e) => e.date.startsWith(fc.monthKey))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHead title="Largest expenses" />
        <EmptyState
          title={`Nothing recorded in ${monthName(fc.monthKey)} yet`}
          body="The five biggest things you paid for this month will be listed here."
        />
      </Card>
    );
  }

  const top = rows[0].amount;
  const share =
    fc.spentSoFar > 0 ? (rows.reduce((s, e) => s + e.amount, 0) / fc.spentSoFar) * 100 : 0;

  return (
    <Card>
      <CardHead
        title="Largest expenses"
        hint={`These ${rows.length} are ${Math.round(share)}% of the month so far.`}
      />
      <ol className="border-t border-rule px-5 py-1">
        {rows.map((e, i) => (
          <li
            key={e.id}
            className="flex items-center gap-3 border-b border-rule py-2.5 last:border-0"
          >
            <span className="tnum w-4 shrink-0 text-[11.5px] text-ink-3">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-ink">{e.shop}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-3">
                <span className="rounded bg-sunk px-1.5 py-0.5">{e.category}</span>
                {formatDate(e.date, "long")}
              </p>
            </div>
            <div className="hidden h-1.5 w-16 shrink-0 rounded-full bg-sunk sm:block">
              <div
                className="h-full rounded-full bg-bar"
                style={{ width: `${(e.amount / top) * 100}%` }}
              />
            </div>
            <span className="tnum shrink-0 text-[13.5px] font-semibold text-ink">
              <Taka value={e.amount} decimals={2} />
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Change against last month                                           */
/* ------------------------------------------------------------------ */

function MonthOverMonth({ fc }: { fc: Forecast }) {
  const prev = monthName(fc.prevMonthKey);
  const sameSlice = fc.spentSoFar - fc.prevMonthToDate;
  const wholeMonth = fc.projectedMonthTotal - fc.prevMonthTotal;
  const slicePct = pctChange(fc.prevMonthToDate, fc.spentSoFar);

  return (
    <Card>
      <CardHead
        title={`Against ${prev}`}
        hint="Two comparisons, because only one of them is fair mid-month."
      />

      <div className="grid gap-3 border-t border-rule px-5 py-4 sm:grid-cols-2">
        <Comparison
          label={`Both months to day ${fc.daysElapsed}`}
          now={fc.spentSoFar}
          then={fc.prevMonthToDate}
          delta={sameSlice}
          suffix={slicePct !== null ? `(${Math.abs(Math.round(slicePct))}%)` : undefined}
        />
        <Comparison
          label="Whole month, once forecast"
          now={fc.projectedMonthTotal}
          then={fc.prevMonthTotal}
          delta={wholeMonth}
        />
      </div>
    </Card>
  );
}

function Comparison({
  label,
  now,
  then,
  delta,
  suffix,
}: {
  label: string;
  now: Paisa;
  then: Paisa;
  delta: Paisa;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg bg-sunk px-3.5 py-3">
      <p className="eyebrow">{label}</p>
      <p className="figure mt-2 text-[22px] leading-none text-ink">
        <Taka value={now} />
      </p>
      <p className="mt-1.5 text-[11.5px] text-ink-3">
        from <Taka value={then} />
      </p>
      <div className="mt-2">
        <Delta value={delta} suffix={suffix} />
      </div>
    </div>
  );
}

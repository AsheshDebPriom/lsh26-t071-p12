"use client";

/**
 * Requirement 2 — the monthly dashboard.
 *
 * Total spent against salary, a breakdown by category, the largest expenses,
 * and the change against last month.
 *
 * Charts here are deliberately one hue. Identity comes from the row label
 * beside each bar, not from colour, so no categorical palette is cycled and
 * nothing depends on telling ten hues apart. Colour is left to do one job:
 * money out in crimson, money in in steel blue, each always accompanied by a
 * sign or an arrow so it never carries meaning alone.
 */

import { formatDate, monthName } from "@/lib/dates";
import type { Forecast } from "@/lib/forecast";
import { pctChange, type Paisa } from "@/lib/money";
import type { Expense } from "@/lib/types";

import { Card, CardHead, Delta, EmptyState, Pill, Taka, cn } from "./ui";

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
    <>
      <SpentAgainstSalary fc={fc} />
      <CategoryBreakdown fc={fc} />
      <LargestExpenses fc={fc} expenses={expenses} />
      <MonthOverMonth fc={fc} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Total spent against salary                                          */
/* ------------------------------------------------------------------ */

function SpentAgainstSalary({ fc }: { fc: Forecast }) {
  const salary = Math.max(fc.salary, 1);
  const spentPct = Math.min(100, (fc.spentSoFar / salary) * 100);
  const projectedPct = Math.min(100 - spentPct, (fc.projectedRemaining / salary) * 100);
  const over = fc.projectedMonthTotal > fc.salary;
  const left = fc.salary - fc.spentSoFar;

  return (
    <Card>
      <CardHead
        title={`Spent in ${monthName(fc.monthKey)}`}
        hint={`against a ৳${(fc.salary / 100).toLocaleString("en-US")} salary`}
        right={
          <Pill tone={over ? "out" : "neutral"}>
            {Math.round((fc.spentSoFar / salary) * 100)}% of salary
          </Pill>
        }
      />

      <div className="px-4 pb-4">
        <p className="text-[34px] font-semibold leading-none tracking-tight text-ink">
          <Taka value={fc.spentSoFar} />
        </p>
        <p className="mt-1.5 text-[13px] text-ink-2">
          {left >= 0 ? (
            <>
              <Taka value={left} className="font-medium text-ink" /> of salary not yet spent
            </>
          ) : (
            <>
              <Taka value={-left} className="font-medium text-out" /> past your salary already
            </>
          )}
        </p>

        {/* One bar, three parts: spent, forecast for the rest of the month, and
            what would be left. The forecast part is hatched as well as lighter,
            because its fill sits below 3:1 against the surface on purpose. */}
        <div
          className="mt-4 flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-sunk"
          role="img"
          aria-label={`Spent ${Math.round(spentPct)} percent of salary, with a further ${Math.round(projectedPct)} percent forecast for the rest of the month`}
        >
          <div className="h-full rounded-full bg-bar" style={{ width: `${spentPct}%` }} />
          {projectedPct > 0.5 ? (
            <div
              className="hatch h-full rounded-full"
              style={{ width: `${projectedPct}%` }}
            />
          ) : null}
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-rule pt-3">
          <Figure label="Spent so far" value={fc.spentSoFar} />
          <Figure label="Forecast for the rest" value={fc.projectedRemaining} muted />
          <Figure
            label={over ? "Short at month end" : "Clear at month end"}
            value={Math.abs(fc.endOfMonthPosition)}
            tone={over ? "out" : "in"}
          />
        </dl>
      </div>
    </Card>
  );
}

function Figure({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: Paisa;
  tone?: "in" | "out";
  muted?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] leading-tight text-ink-3">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-[15px] font-semibold tracking-tight",
          tone === "out" ? "text-out" : tone === "in" ? "text-in" : muted ? "text-ink-2" : "text-ink",
        )}
      >
        <Taka value={value} />
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Breakdown by category                                               */
/* ------------------------------------------------------------------ */

function CategoryBreakdown({ fc }: { fc: Forecast }) {
  const rows = [...fc.categories].sort((a, b) => b.spentThisMonth - a.spentThisMonth);
  const max = Math.max(...rows.map((r) => Math.max(r.spentThisMonth, r.prevMonthTotal)), 1);

  return (
    <Card>
      <CardHead
        title="Where the money went"
        hint={`Spent so far this month, with last month's total marked for comparison.`}
        right={<Taka value={fc.spentSoFar} className="text-[15px] font-semibold text-ink" />}
      />

      <ul className="border-t border-rule px-4 py-3">
        {rows.map((r) => {
          const width = (r.spentThisMonth / max) * 100;
          const prevMark = (r.prevMonthTotal / max) * 100;
          const share = fc.spentSoFar > 0 ? (r.spentThisMonth / fc.spentSoFar) * 100 : 0;
          return (
            <li key={r.category} className="py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] font-medium text-ink">{r.category}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="tnum text-[11px] text-ink-3">{Math.round(share)}%</span>
                  <Taka
                    value={r.spentThisMonth}
                    className="text-[13px] font-medium text-ink"
                  />
                </span>
              </div>
              <div className="relative mt-1.5 h-2 w-full rounded-full bg-sunk">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-bar"
                  style={{ width: `${width}%` }}
                />
                {r.prevMonthTotal > 0 ? (
                  <span
                    aria-hidden
                    title={`Last month: ৳${(r.prevMonthTotal / 100).toLocaleString("en-US")}`}
                    className="absolute top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-ink-3"
                    style={{ left: `calc(${Math.min(100, prevMark)}% - 1px)` }}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-rule px-4 py-2.5 text-[11.5px] leading-snug text-ink-3">
        The thin mark on each bar is that category&apos;s whole total for{" "}
        {monthName(fc.prevMonthKey)}. A bar short of its mark is a category running below
        last month with {fc.daysRemaining} days still to go.
      </p>
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
  const share = fc.spentSoFar > 0 ? (rows.reduce((s, e) => s + e.amount, 0) / fc.spentSoFar) * 100 : 0;

  return (
    <Card>
      <CardHead
        title="Largest expenses"
        hint={`These ${rows.length} account for ${Math.round(share)}% of the month so far.`}
      />
      <ol className="divide-y divide-rule border-t border-rule">
        {rows.map((e, i) => (
          <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="tnum w-4 shrink-0 text-[12px] text-ink-3">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink">{e.shop}</p>
              <p className="mt-0.5 text-[12px] text-ink-3">
                {e.category} · {formatDate(e.date, "long")}
              </p>
            </div>
            <div className="w-20 shrink-0 sm:w-28">
              <div className="h-1.5 w-full rounded-full bg-sunk">
                <div
                  className="h-full rounded-full bg-bar"
                  style={{ width: `${(e.amount / top) * 100}%` }}
                />
              </div>
            </div>
            <Taka value={e.amount} decimals={2} className="text-[14px] font-medium text-ink" />
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

  const rows = [...fc.categories]
    .map((c) => ({ c, delta: c.projectedMonthTotal - c.prevMonthTotal }))
    .filter((r) => Math.abs(r.delta) >= 1000)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return (
    <Card>
      <CardHead
        title={`Against ${prev}`}
        hint="Two comparisons: the same days side by side, and this whole month once the forecast plays out."
      />

      <div className="grid gap-3 border-t border-rule px-4 py-3 sm:grid-cols-2">
        <div className="rounded-lg bg-sunk px-3 py-2.5">
          <p className="text-[11px] text-ink-3">
            By day {fc.daysElapsed}, both months
          </p>
          <p className="mt-1 text-[17px] font-semibold tracking-tight text-ink">
            <Taka value={fc.spentSoFar} />
            <span className="ml-1.5 text-[12px] font-normal text-ink-3">
              vs <Taka value={fc.prevMonthToDate} />
            </span>
          </p>
          <div className="mt-1.5">
            <Delta
              value={sameSlice}
              suffix={slicePct !== null ? `(${Math.abs(Math.round(slicePct))}%)` : undefined}
            />
          </div>
        </div>

        <div className="rounded-lg bg-sunk px-3 py-2.5">
          <p className="text-[11px] text-ink-3">Whole month, once forecast</p>
          <p className="mt-1 text-[17px] font-semibold tracking-tight text-ink">
            <Taka value={fc.projectedMonthTotal} />
            <span className="ml-1.5 text-[12px] font-normal text-ink-3">
              vs <Taka value={fc.prevMonthTotal} />
            </span>
          </p>
          <div className="mt-1.5">
            <Delta value={wholeMonth} />
          </div>
        </div>
      </div>

      {rows.length > 0 ? (
        <ul className="divide-y divide-rule border-t border-rule">
          {rows.map(({ c, delta }) => (
            <li key={c.category} className="flex items-center justify-between gap-3 px-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">{c.category}</p>
                <p className="mt-0.5 tnum text-[11.5px] text-ink-3">
                  <Taka value={c.projectedMonthTotal} /> forecast ·{" "}
                  <Taka value={c.prevMonthTotal} /> in {prev}
                </p>
              </div>
              <Delta value={delta} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-rule px-4 py-3 text-[12.5px] text-ink-3">
          No category moves by more than ৳10 against {prev}.
        </p>
      )}
    </Card>
  );
}

"use client";

/**
 * Requirement 3 — the forecast and the written insights.
 *
 * Expected spending for the rest of the month, the expected position at month
 * end, and insights that name categories and amounts. Every sentence on this
 * screen is a template with computed numbers in it, so editing any expense
 * moves all of them. None of it is stored advice and none of it is model text.
 */

import { monthName } from "@/lib/dates";
import type { Forecast } from "@/lib/forecast";
import { buildInsights, type Insight } from "@/lib/insights";
import type { PocketSimulation } from "@/lib/pockets";
import type { Expense, Pocket } from "@/lib/types";

import { WhatIfControl } from "./WhatIfControl";
import { AnimatedTaka, Card, CardHead, EmptyState, Pill, Taka, cn } from "./ui";

export function ForecastTab({
  fc,
  sim,
  expenses,
  pockets,
  baseline,
}: {
  fc: Forecast;
  sim: PocketSimulation;
  expenses: Expense[];
  pockets: Pocket[];
  baseline: PocketSimulation;
}) {
  if (fc.isEmpty) {
    return (
      <Card>
        <EmptyState
          title="Nothing to forecast yet"
          body="The forecast is built from your own spending. Record a few expenses and this screen will project the rest of the month and say what it means."
        />
      </Card>
    );
  }

  const insights = buildInsights(fc, sim, pockets, expenses);

  return (
    <>
      <MonthEndPosition fc={fc} />
      <Insights insights={insights} />
      <WhatIfControl fc={fc} sim={sim} pockets={pockets} baseline={baseline} />
      <RestOfMonthByCategory fc={fc} />
      <HowItWorks fc={fc} />
    </>
  );
}

/* ------------------------------------------------------------------ */

function MonthEndPosition({ fc }: { fc: Forecast }) {
  const short = fc.endOfMonthPosition < 0;
  const month = monthName(fc.monthKey);

  return (
    <Card>
      <CardHead
        title={`Where ${month} ends`}
        hint={`${fc.daysRemaining} ${fc.daysRemaining === 1 ? "day" : "days"} left, projected from your own spending`}
        right={<Pill tone={short ? "out" : "in"}>{short ? "short" : "clear"}</Pill>}
      />

      <div className="px-4 pb-4">
        <p
          className={cn(
            "text-[34px] font-semibold leading-none tracking-tight",
            short ? "text-out" : "text-in",
          )}
        >
          <AnimatedTaka value={Math.abs(fc.endOfMonthPosition)} />
        </p>
        <p className="mt-1.5 text-[13px] text-ink-2">
          expected to be {short ? "short at the end of" : "left at the end of"} {month}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-rule pt-3 sm:grid-cols-4">
          <Row label="Salary" value={fc.salary} />
          <Row label="Spent so far" value={fc.spentSoFar} />
          <Row
            label="Forecast for the rest"
            value={fc.projectedRemaining}
            animated
            emphasis
          />
          <Row label="Projected month total" value={fc.projectedMonthTotal} animated />
        </div>

        <p className="mt-3 rounded-lg bg-sunk px-3 py-2 text-[12px] leading-relaxed text-ink-2">
          Of the <Taka value={fc.projectedRemaining} /> still expected,{" "}
          <Taka value={fc.categories.reduce((s, c) => s + c.fixedRemaining, 0)} /> is monthly
          charges that have not landed yet and the rest is day-to-day spending at{" "}
          <Taka value={Math.round(fc.categories.reduce((s, c) => s + c.dailyRate, 0))} /> a
          day.
        </p>
      </div>
    </Card>
  );
}

function Row({
  label,
  value,
  animated,
  emphasis,
}: {
  label: string;
  value: number;
  animated?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] leading-tight text-ink-3">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[15px] font-semibold tracking-tight",
          emphasis ? "text-ink" : "text-ink-2",
        )}
      >
        {animated ? <AnimatedTaka value={value} /> : <Taka value={value} />}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Insights({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <Card>
      <CardHead
        title="What the numbers say"
        hint="Each line is written from your figures as they stand. Change an expense and every line changes with it."
      />
      <ul className="divide-y divide-rule border-t border-rule">
        {insights.map((i) => (
          <li key={i.id} className="flex gap-3 px-4 py-3">
            <span
              aria-hidden
              className={cn(
                "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
                i.tone === "warn" ? "bg-out" : i.tone === "good" ? "bg-in" : "bg-ink-3",
              )}
            />
            <p className="text-[13.5px] leading-relaxed text-ink">{i.text}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function RestOfMonthByCategory({ fc }: { fc: Forecast }) {
  const rows = [...fc.categories]
    .filter((c) => c.projectedRemaining > 0 || c.spentThisMonth > 0)
    .sort((a, b) => b.projectedRemaining - a.projectedRemaining);
  const max = Math.max(...rows.map((r) => r.projectedMonthTotal), 1);

  return (
    <Card>
      <CardHead
        title={`The rest of ${monthName(fc.monthKey)}`}
        hint="Solid is already spent. Hatched is what the forecast still expects."
        right={
          <AnimatedTaka
            value={fc.projectedRemaining}
            className="text-[15px] font-semibold text-ink"
          />
        }
      />
      <ul className="border-t border-rule px-4 py-3">
        {rows.map((r) => (
          <li key={r.category} className="py-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[13px] font-medium text-ink">
                  {r.category}
                </span>
                {r.cutPercent > 0 ? <Pill>−{r.cutPercent}%</Pill> : null}
              </span>
              <span className="shrink-0 text-[13px] text-ink-2">
                <Taka value={r.spentThisMonth} /> +{" "}
                <AnimatedTaka
                  value={r.projectedRemaining}
                  className="font-medium text-ink"
                />
              </span>
            </div>
            <div className="mt-1.5 flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-sunk">
              <div
                className="h-full rounded-full bg-bar"
                style={{ width: `${(r.spentThisMonth / max) * 100}%` }}
              />
              <div
                className="hatch h-full rounded-full transition-[width] duration-200"
                style={{ width: `${(r.projectedRemaining / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function HowItWorks({ fc }: { fc: Forecast }) {
  const charges = fc.monthlyCharges;
  return (
    <Card>
      <CardHead
        title="How the forecast is built"
        hint="No black box — this is the whole method."
      />
      <div className="space-y-2.5 border-t border-rule px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
        <p>
          Spending is split in two. A shop that billed once last month for a material
          amount is treated as a <strong className="font-medium text-ink">monthly charge</strong>
          : if it has already been paid this month it adds nothing more, and if it has not it
          is expected once before month end. Everything else is{" "}
          <strong className="font-medium text-ink">day-to-day spending</strong>, projected
          from a daily rate.
        </p>
        <p>
          The daily rate blends this month with last month, weighted by how much of the
          month has actually happened — today is day {fc.daysElapsed} of {fc.daysInMonth}, so
          this month carries{" "}
          <span className="tnum font-medium text-ink">
            {Math.round((fc.daysElapsed / fc.daysInMonth) * 100)}%
          </span>{" "}
          of the weight and {monthName(fc.prevMonthKey)} carries the rest.
        </p>
        <p>
          Rent is why this matters. It is paid in the first days of the month, so
          extrapolating it from a daily rate on day {fc.daysElapsed} would forecast it at
          nearly double.
        </p>
      </div>

      {charges.length > 0 ? (
        <>
          <p className="border-t border-rule px-4 pt-3 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3">
            Monthly charges found
          </p>
          <ul className="divide-y divide-rule px-4 pb-3">
            {charges.map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-[13px] text-ink">
                    <span className="font-medium">{m.shop}</span>
                    <span className="text-ink-3">{m.category}</span>
                    {m.confirmedRecurring ? <Pill>recurring</Pill> : null}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">
                    {m.paidThisMonth
                      ? `paid on the ${m.thisDay}${ordinal(m.thisDay!)} — nothing more expected`
                      : m.remainingThisMonth > 0
                        ? `usually the ${m.prevDay}${ordinal(m.prevDay)} — still expected`
                        : `usually the ${m.prevDay}${ordinal(m.prevDay)} — overdue, treated as skipped`}
                  </p>
                </div>
                <Taka
                  value={m.expectedMonthly}
                  className="shrink-0 text-[13px] font-medium text-ink"
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

"use client";

/**
 * Requirement 3 — the forecast and the written insights.
 *
 * Expected spending for the rest of the month, the expected position at month
 * end, and insights that name categories and amounts. Every sentence here is a
 * template with computed numbers in it, so editing any expense moves all of
 * them. None of it is stored advice and none of it is model text.
 *
 * The insights are not a flat list of ten identical rows. The two the
 * requirement names lead at full width; the rest fall into a two-column grid
 * ranked by how much money each is about, so the page can be scanned instead of
 * read top to bottom.
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
  const headline = insights.filter((i) => i.pinned);
  const rest = insights.filter((i) => !i.pinned);

  return (
    <div className="space-y-4">
      <MonthEndPosition fc={fc} />

      <section aria-label="What the numbers say">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">
            What the numbers say
          </h2>
          <p className="text-[12px] text-ink-3">
            Written from your figures as they stand — change an expense and every line
            changes with it.
          </p>
        </div>

        <div className="space-y-2.5">
          {headline.map((i) => (
            <HeadlineInsight key={i.id} insight={i} />
          ))}
          <div className="grid gap-2.5 lg:grid-cols-2">
            {rest.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        </div>
      </section>

      <WhatIfControl fc={fc} sim={sim} pockets={pockets} baseline={baseline} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <RestOfMonthByCategory fc={fc} />
        <HowItWorks fc={fc} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MonthEndPosition({ fc }: { fc: Forecast }) {
  const short = fc.endOfMonthPosition < 0;
  const month = monthName(fc.monthKey);
  const fixedLeft = fc.categories.reduce((s, c) => s + c.fixedRemaining, 0);
  const dailyLeft = fc.projectedRemaining - fixedLeft;

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        {/* The answer */}
        <div
          className={cn(
            "border-b border-rule px-5 py-5 lg:border-b-0 lg:border-r",
            short ? "bg-out-soft/45" : "bg-in-soft/45",
          )}
        >
          <div className="flex items-center gap-2">
            <p className="eyebrow">Where {month} ends</p>
            <Pill tone={short ? "out" : "in"}>{short ? "short" : "clear"}</Pill>
          </div>
          <p
            className={cn(
              "figure mt-3 text-[40px] leading-none lg:text-[46px]",
              short ? "text-out" : "text-in",
            )}
          >
            <AnimatedTaka value={Math.abs(fc.endOfMonthPosition)} />
          </p>
          <p className="mt-2.5 text-[13.5px] leading-snug text-ink-2">
            expected to be {short ? "short at the end of" : "left at the end of"} {month},
            with {fc.daysRemaining} {fc.daysRemaining === 1 ? "day" : "days"} still to run.
          </p>

          {/* The same answer expressed as a daily rate, which is the form it can
              actually be acted on. */}
          {fc.daysRemaining > 0 ? <DailyRate fc={fc} /> : null}
        </div>

        {/* The working */}
        <div className="px-5 py-5">
          <p className="eyebrow">How that is reached</p>
          <dl className="mt-3 space-y-2">
            <WorkingRow label="Salary" value={fc.salary} />
            <WorkingRow label="Spent so far" value={-fc.spentSoFar} />
            <WorkingRow label="Forecast for the rest" value={-fc.projectedRemaining} animated />
            <div className="border-t border-rule pt-2">
              <WorkingRow
                label={short ? "Short at month end" : "Clear at month end"}
                value={fc.endOfMonthPosition}
                animated
                strong
              />
            </div>
          </dl>
          <p className="mt-3 rounded-lg bg-sunk px-3 py-2.5 text-[12px] leading-relaxed text-ink-2">
            Of the <Taka value={fc.projectedRemaining} /> still expected,{" "}
            <Taka value={fixedLeft} /> is monthly charges that have not landed yet and{" "}
            <Taka value={dailyLeft} /> is day-to-day spending.
          </p>
        </div>
      </div>
    </Card>
  );
}

/**
 * What is left per day against what is being spent per day. The gap between the
 * two is the whole decision, so both sit on one baseline.
 */
function DailyRate({ fc }: { fc: Forecast }) {
  const left = fc.salary - fc.spentSoFar;
  const affordable = Math.max(0, Math.round(left / fc.daysRemaining));
  const running = Math.round(fc.burnRateSoFar);
  const overspending = running > affordable;
  const scale = Math.max(affordable, running, 1);

  return (
    <div className="mt-5 border-t border-rule/70 pt-4">
      <p className="eyebrow">Per day, for the {fc.daysRemaining} days left</p>
      <div className="mt-3 space-y-3">
        <RateBar
          label="You have been spending"
          value={running}
          pct={(running / scale) * 100}
          tone={overspending ? "out" : undefined}
        />
        <RateBar
          label={left <= 0 ? "Salary already spent" : "You can afford"}
          value={affordable}
          pct={(affordable / scale) * 100}
          tone="in"
        />
      </div>
      <p className="mt-3 text-[12px] leading-snug text-ink-2">
        {overspending ? (
          <>
            <Taka value={running - affordable} className="font-semibold text-out" /> a day
            over what {month0(fc)} can carry.
          </>
        ) : (
          <>
            <Taka value={affordable - running} className="font-semibold text-in" /> a day of
            room at your current pace.
          </>
        )}
      </p>
    </div>
  );
}

function month0(fc: Forecast) {
  return monthName(fc.monthKey);
}

function RateBar({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: number;
  pct: number;
  tone?: "in" | "out";
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-ink-2">{label}</span>
        <span
          className={cn(
            "tnum text-[14px] font-semibold",
            tone === "out" ? "text-out" : tone === "in" ? "text-in" : "text-ink",
          )}
        >
          <Taka value={value} />
          <span className="text-[11px] font-normal text-ink-3"> /day</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full rounded-full bg-surface/70">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            tone === "out" ? "bg-out" : tone === "in" ? "bg-in" : "bg-bar",
          )}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function WorkingRow({
  label,
  value,
  animated,
  strong,
}: {
  label: string;
  value: number;
  animated?: boolean;
  strong?: boolean;
}) {
  const negative = value < 0;
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn("text-[12.5px]", strong ? "font-medium text-ink" : "text-ink-2")}>
        {label}
      </dt>
      <dd
        className={cn(
          "tnum",
          strong ? "text-[17px] font-semibold text-ink" : "text-[14px] text-ink",
        )}
      >
        {negative ? <span className="text-ink-3">−</span> : null}
        {animated ? (
          <AnimatedTaka value={Math.abs(value)} />
        ) : (
          <Taka value={Math.abs(value)} />
        )}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function HeadlineInsight({ insight }: { insight: Insight }) {
  return (
    <Card
      className={cn(
        "px-5 py-4",
        insight.tone === "warn" && "border-out/25",
        insight.tone === "good" && "border-in/25",
      )}
    >
      <div className="flex gap-3">
        <Dot tone={insight.tone} big />
        <p className="text-[15px] leading-relaxed text-ink lg:text-[16px]">{insight.text}</p>
      </div>
    </Card>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <Card className="card-hover flex gap-3 px-4 py-3.5">
      <Dot tone={insight.tone} />
      <p className="text-[13px] leading-relaxed text-ink-2">{insight.text}</p>
    </Card>
  );
}

function Dot({ tone, big }: { tone: Insight["tone"]; big?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-[7px] shrink-0 rounded-full",
        big ? "h-2 w-2" : "h-1.5 w-1.5",
        tone === "warn" ? "bg-out" : tone === "good" ? "bg-in" : "bg-ink-3",
      )}
    />
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
          <span className="figure text-[17px] text-ink">
            <AnimatedTaka value={fc.projectedRemaining} />
          </span>
        }
      />
      <ul className="border-t border-rule px-5 py-1">
        {rows.map((r) => (
          <li
            key={r.category}
            className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-2.5 last:border-0"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[13px] font-medium text-ink">{r.category}</span>
              {r.cutPercent > 0 ? (
                <span className="tnum shrink-0 text-[10.5px] text-ink-3">−{r.cutPercent}%</span>
              ) : null}
            </span>

            <span className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-sunk">
              <span
                className="h-full rounded-full bg-bar transition-[width] duration-300"
                style={{ width: `${(r.spentThisMonth / max) * 100}%` }}
              />
              <span
                className="hatch h-full rounded-full transition-[width] duration-300"
                style={{ width: `${(r.projectedRemaining / max) * 100}%` }}
              />
            </span>

            <span className="tnum flex w-[8.5rem] items-baseline justify-end gap-1 text-[12.5px]">
              <span className="text-ink-3">
                <Taka value={r.spentThisMonth} />
              </span>
              <span className="text-ink-3">+</span>
              <span className="w-[4.25rem] text-right font-semibold text-ink">
                <AnimatedTaka value={r.projectedRemaining} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function HowItWorks({ fc }: { fc: Forecast }) {
  const charges = fc.monthlyCharges;
  const weight = Math.round((fc.daysElapsed / fc.daysInMonth) * 100);

  return (
    <Card>
      <CardHead
        title="How the forecast is built"
        hint="No black box — this is the whole method, and every charge it found."
      />

      <div className="space-y-2.5 border-t border-rule px-5 py-4 text-[12.5px] leading-relaxed text-ink-2">
        <p>
          Spending is split in two. A shop that billed once last month for a material amount
          is a <strong className="font-medium text-ink">monthly charge</strong>: if it has
          already been paid this month it adds nothing more, and if not it is expected once
          before month end. Everything else is{" "}
          <strong className="font-medium text-ink">day-to-day spending</strong>, projected
          from a daily rate.
        </p>
        <p>
          That rate blends this month with last, weighted by how much of the month has
          actually happened. Today is day {fc.daysElapsed} of {fc.daysInMonth}, so this month
          carries <span className="tnum font-medium text-ink">{weight}%</span> of the weight
          and {monthName(fc.prevMonthKey)} carries the rest.
        </p>
        <p>
          Rent is why this matters: it is paid in the first days of the month, so
          extrapolating it from a daily rate on day {fc.daysElapsed} would forecast it at
          nearly double.
        </p>
      </div>

      {charges.length > 0 ? (
        <>
          <p className="eyebrow border-t border-rule px-5 pt-3.5">Monthly charges found</p>
          <ul className="px-5 pb-2 pt-1">
            {charges.map((m) => (
              <li
                key={m.key}
                className="flex items-center justify-between gap-3 border-b border-rule py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink">
                    <span className="font-medium">{m.shop}</span>
                    <span className="rounded bg-sunk px-1.5 py-0.5 text-[11px] text-ink-3">
                      {m.category}
                    </span>
                    {m.confirmedRecurring ? <Pill>recurring</Pill> : null}
                  </p>
                  <p className="mt-1 text-[11.5px] text-ink-3">
                    {m.paidThisMonth
                      ? `paid on the ${m.thisDay}${ordinal(m.thisDay!)} — nothing more expected`
                      : m.remainingThisMonth > 0
                        ? `usually the ${m.prevDay}${ordinal(m.prevDay)} — still expected`
                        : `usually the ${m.prevDay}${ordinal(m.prevDay)} — overdue, treated as skipped`}
                  </p>
                </div>
                <span className="tnum shrink-0 text-[13.5px] font-semibold text-ink">
                  <Taka value={m.expectedMonthly} />
                </span>
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

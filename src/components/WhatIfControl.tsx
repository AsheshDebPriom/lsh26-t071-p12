"use client";

/**
 * The what-if control.
 *
 * Cut one category's future spending by a percentage and watch every pocket
 * completion date move. The dates sit directly under the slider on purpose:
 * cause and effect belong on the same screen.
 *
 * There is no debounce and no memoisation behind this. Each drag event
 * re-runs the whole forecast and the whole pocket simulation from scratch —
 * pure functions over a few hundred records, finishing in well under a
 * millisecond — so the dates move on the same frame as the thumb.
 *
 * The cut applies to *future* spending only. Money already spent this month
 * cannot be un-spent, which is why cutting Rent barely moves the month in
 * progress (it was paid on the 3rd) but moves every month after it.
 */

import { useState } from "react";

import { formatDate, monthLabel } from "@/lib/dates";
import type { Forecast } from "@/lib/forecast";
import type { PocketSimulation } from "@/lib/pockets";
import { useLedger } from "@/store/useLedger";
import type { Pocket } from "@/lib/types";

import { AnimatedTaka, Button, Card, CardHead, Pill, Taka, cn } from "./ui";

export function WhatIfControl({
  fc,
  sim,
  pockets,
  baseline,
}: {
  fc: Forecast;
  sim: PocketSimulation;
  pockets: Pocket[];
  /** The same simulation with no cuts applied, to show what moved. */
  baseline: PocketSimulation;
}) {
  const adjustments = useLedger((s) => s.adjustments);
  const setAdjustment = useLedger((s) => s.setAdjustment);
  const clearAdjustments = useLedger((s) => s.clearAdjustments);
  const [picked, setPicked] = useState<string | null>(null);

  // Ordered by what has actually been spent, never by the projection — sorting
  // on the cut value would make the chips reshuffle under the thumb mid-drag.
  const options = [...fc.categories]
    .filter((c) => c.prevMonthTotal > 0 || c.spentThisMonth > 0)
    .sort(
      (a, b) =>
        b.spentThisMonth + b.prevMonthTotal - (a.spentThisMonth + a.prevMonthTotal) ||
        a.category.localeCompare(b.category),
    );

  if (options.length === 0) return null;

  const active = adjustments.filter((a) => a.cutPercent > 0);
  // Which category the slider is pointed at is its own state: picking one at 0%
  // has to select it even though no adjustment exists yet.
  const selected =
    picked && options.some((o) => o.category === picked)
      ? picked
      : (active[0]?.category ?? options[0].category);
  const cut = adjustments.find((a) => a.category === selected)?.cutPercent ?? 0;
  const row = fc.categories.find((c) => c.category === selected);

  const saved = baseline.steadyMonthSurplus;
  const now = sim.steadyMonthSurplus;

  return (
    <Card>
      <CardHead
        title="What if you spent less on one thing?"
        hint="Drag, and every completion date below moves with it."
        right={
          active.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearAdjustments();
                setPicked(null);
              }}
            >
              Reset
            </Button>
          ) : null
        }
      />

      <div className="border-t border-rule px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {options.map((c) => {
            const isOn = c.category === selected;
            return (
              <button
                key={c.category}
                onClick={() => {
                  // One category at a time, so the effect of the slider is
                  // never the sum of several invisible cuts.
                  clearAdjustments();
                  setPicked(c.category);
                  if (cut > 0) setAdjustment(c.category, cut);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                  isOn
                    ? "border-ink bg-ink text-white"
                    : "border-rule-strong bg-surface text-ink-2 hover:bg-sunk",
                )}
              >
                {c.category}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="whatif" className="text-[13px] text-ink-2">
              Cut <span className="font-medium text-ink">{selected}</span> by
            </label>
            <span className="tnum text-[20px] font-semibold tracking-tight text-ink">
              {cut}%
            </span>
          </div>
          <input
            id="whatif"
            type="range"
            min={0}
            max={100}
            step={5}
            value={cut}
            aria-valuetext={`${cut} percent`}
            className="mt-1"
            onChange={(e) => setAdjustment(selected, Number(e.target.value))}
          />
          <div className="flex justify-between text-[11px] text-ink-3">
            <span>no change</span>
            <span>stop spending on it</span>
          </div>
        </div>

        {row ? (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-rule pt-3 sm:grid-cols-3">
            <Stat
              label={`${selected}, a typical month`}
              value={row.typicalMonthlyCost(fc.monthKey)}
            />
            <Stat label="Left over each month" value={now} tone={now < 0 ? "out" : "in"} signed />
            <Stat
              label="Freed up each month"
              value={Math.max(0, now - saved)}
              tone="in"
            />
          </div>
        ) : null}

        {cut > 0 ? (
          <p className="mt-3 rounded-lg bg-sunk px-3 py-2 text-[12px] leading-relaxed text-ink-2">
            The cut applies to spending still to come. {monthLabel(fc.monthKey, "short")} barely
            moves because most of it has already happened — the months after it move in full.
          </p>
        ) : null}
      </div>

      {pockets.length > 0 ? (
        <div className="border-t border-rule">
          <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3">
            Every pocket, live
          </p>
          <ul className="divide-y divide-rule px-4 pb-3">
            {[...pockets]
              .sort((a, b) => a.priority - b.priority)
              .map((p) => {
                const before = baseline.projections.get(p.id);
                const after = sim.projections.get(p.id);
                if (!after) return null;
                const monthsSaved =
                  before?.reachable && after.reachable
                    ? before.monthsToComplete! - after.monthsToComplete!
                    : null;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">{p.name}</p>
                      <p className="mt-0.5 text-[11.5px] text-ink-3">
                        <Taka value={p.target} /> at <Taka value={p.monthlyContribution} /> a
                        month
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {after.reachable ? (
                        <>
                          <p className="tnum text-[14px] font-semibold tracking-tight text-ink">
                            {formatDate(after.completionDate!, "long")}
                          </p>
                          <p className="mt-0.5 text-[11.5px]">
                            {monthsSaved && monthsSaved > 0 ? (
                              <span className="text-in">
                                ▼ {monthsSaved} months sooner
                              </span>
                            ) : before && !before.reachable ? (
                              <span className="text-in">▼ now reachable</span>
                            ) : (
                              <span className="text-ink-3">
                                {after.monthsToComplete} months away
                              </span>
                            )}
                          </p>
                        </>
                      ) : (
                        <p className="text-[13px] font-medium text-out">
                          Not reachable yet
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
  signed,
}: {
  label: string;
  value: number;
  tone?: "in" | "out";
  signed?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] leading-tight text-ink-3">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[15px] font-semibold tracking-tight",
          tone === "out" ? "text-out" : tone === "in" ? "text-in" : "text-ink",
        )}
      >
        <AnimatedTaka value={value} signed={signed} />
      </p>
    </div>
  );
}

/** A slim strip for screens that are not the one holding the slider. */
export function WhatIfBanner() {
  const adjustments = useLedger((s) => s.adjustments);
  const clearAdjustments = useLedger((s) => s.clearAdjustments);
  const active = adjustments.filter((a) => a.cutPercent > 0);
  if (active.length === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-rule-strong bg-sunk px-3 py-2">
      <p className="text-[12px] leading-snug text-ink-2">
        Showing a what-if:{" "}
        {active.map((a) => (
          <Pill key={a.category} className="mx-0.5">
            {a.category} −{a.cutPercent}%
          </Pill>
        ))}
      </p>
      <Button size="sm" variant="ghost" onClick={clearAdjustments}>
        Reset
      </Button>
    </div>
  );
}

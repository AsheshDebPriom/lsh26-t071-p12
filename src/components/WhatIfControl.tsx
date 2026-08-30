"use client";

/**
 * The what-if control.
 *
 * Cut one category's future spending by a percentage and watch every pocket
 * completion date move. The dates sit directly beside the slider on purpose:
 * cause and effect belong on the same screen, within one glance.
 *
 * There is no debounce and no memoisation behind this. Each drag event re-runs
 * the whole forecast and the whole pocket simulation from scratch — pure
 * functions over a few hundred records, finishing in well under a millisecond —
 * so the dates move on the same frame as the thumb.
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

import { AnimatedTaka, Button, Card, Pill, Taka, cn } from "./ui";

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
  // Which category the slider points at is its own state: picking one at 0% has
  // to select it even though no adjustment exists yet.
  const selected =
    picked && options.some((o) => o.category === picked)
      ? picked
      : (active[0]?.category ?? options[0].category);
  const cut = adjustments.find((a) => a.category === selected)?.cutPercent ?? 0;
  const row = fc.categories.find((c) => c.category === selected);

  const before = baseline.steadyMonthSurplus;
  const now = sim.steadyMonthSurplus;
  const freed = Math.max(0, now - before);

  return (
    <Card className="overflow-hidden border-ink/15 shadow-lift-2">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">
            What if you spent less on one thing?
          </h2>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-3">
            Drag, and every completion date moves with it — recomputed on the same frame,
            not on a delay.
          </p>
        </div>
        {active.length > 0 ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              clearAdjustments();
              setPicked(null);
            }}
          >
            Reset
          </Button>
        ) : null}
      </div>

      <div className="grid gap-0 border-t border-rule lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
        {/* ---- the control ---- */}
        <div className="border-b border-rule px-5 py-4 lg:border-b-0 lg:border-r">
          <p className="eyebrow">Category</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {options.map((c) => {
              const isOn = c.category === selected;
              return (
                <button
                  key={c.category}
                  onClick={() => {
                    // One category at a time, so the effect on screen is never
                    // the sum of several invisible cuts.
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

          <div className="mt-5">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="whatif" className="text-[13px] text-ink-2">
                Cut <span className="font-medium text-ink">{selected}</span> by
              </label>
              <span className="figure text-[26px] leading-none text-ink">{cut}%</span>
            </div>
            <input
              id="whatif"
              type="range"
              min={0}
              max={100}
              step={5}
              value={cut}
              aria-valuetext={`${cut} percent`}
              className="mt-2"
              onChange={(e) => setAdjustment(selected, Number(e.target.value))}
            />
            <div className="flex justify-between text-[11px] text-ink-3">
              <span>no change</span>
              <span>stop spending on it</span>
            </div>
          </div>

          {row ? (
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-rule pt-3.5">
              <Stat
                label={`${selected} a month`}
                value={row.typicalMonthlyCost(fc.monthKey)}
              />
              <Stat label="Left over monthly" value={now} tone={now < 0 ? "out" : "in"} signed />
              <Stat label="Freed up monthly" value={freed} tone={freed > 0 ? "in" : undefined} />
            </div>
          ) : null}

          {cut > 0 ? (
            <p className="mt-3.5 rounded-lg bg-sunk px-3 py-2.5 text-[12px] leading-relaxed text-ink-2">
              The cut applies to spending still to come.{" "}
              {monthLabel(fc.monthKey, "short")} barely moves because most of it has already
              happened — the months after it move in full.
            </p>
          ) : null}
        </div>

        {/* ---- the consequence ---- */}
        <div className="px-5 py-4">
          <p className="eyebrow">Every pocket, live</p>
          {pockets.length === 0 ? (
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
              Create a pocket and its date will appear here, moving as you drag.
            </p>
          ) : (
            <ul className="mt-1">
              {[...pockets]
                .sort((a, b) => a.priority - b.priority)
                .map((p) => {
                  const was = baseline.projections.get(p.id);
                  const isNow = sim.projections.get(p.id);
                  if (!isNow) return null;
                  const monthsSaved =
                    was?.reachable && isNow.reachable
                      ? was.monthsToComplete! - isNow.monthsToComplete!
                      : null;

                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 border-b border-rule py-2.5 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink">{p.name}</p>
                        <p className="mt-1 text-[11.5px] text-ink-3">
                          <Taka value={p.target} /> at <Taka value={p.monthlyContribution} />{" "}
                          a month
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {isNow.reachable ? (
                          <>
                            <p className="tnum text-[14.5px] font-semibold tracking-tight text-ink">
                              {formatDate(isNow.completionDate!, "long")}
                            </p>
                            <p className="mt-1 text-[11.5px]">
                              {monthsSaved && monthsSaved > 0 ? (
                                <span className="font-medium text-in">
                                  ▼ {monthsSaved} months sooner
                                </span>
                              ) : was && !was.reachable ? (
                                <span className="font-medium text-in">▼ now reachable</span>
                              ) : (
                                <span className="text-ink-3">
                                  {isNow.monthsToComplete} months away
                                </span>
                              )}
                            </p>
                          </>
                        ) : (
                          <Pill tone="out">not reachable yet</Pill>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </div>
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
          "figure mt-1.5 text-[16px] leading-none",
          tone === "out" ? "text-out" : tone === "in" ? "text-in" : "text-ink",
        )}
      >
        <AnimatedTaka value={value} signed={signed} />
      </p>
    </div>
  );
}

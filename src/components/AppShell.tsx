"use client";

/**
 * The application shell.
 *
 * The forecast and the pocket simulation are recomputed on every render, with
 * no memoisation and no debounce. They are pure functions over a few hundred
 * records and finish in well under a millisecond, so the what-if slider can
 * move every completion date on the same frame as the drag.
 */

import { useState } from "react";

import { formatDate, monthLabel } from "@/lib/dates";
import { forecast } from "@/lib/forecast";
import { simulatePockets } from "@/lib/pockets";
import { useLedger } from "@/store/useLedger";

import { AddExpenseSheet } from "./AddExpenseSheet";
import { DashboardTab } from "./DashboardTab";
import { ForecastTab } from "./ForecastTab";
import { LogTab } from "./LogTab";
import { PocketsTab } from "./PocketsTab";
import { SettingsSheet } from "./SettingsSheet";
import { Button, Pill, Skeleton, Taka, cn } from "./ui";

const TABS = [
  { id: "month", label: "Month" },
  { id: "forecast", label: "Forecast" },
  { id: "pockets", label: "Pockets" },
  { id: "log", label: "Log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AppShell() {
  const hydrated = useLedger((s) => s.hydrated);
  const salary = useLedger((s) => s.salary);
  const expenses = useLedger((s) => s.expenses);
  const pockets = useLedger((s) => s.pockets);
  const settings = useLedger((s) => s.settings);
  const adjustments = useLedger((s) => s.adjustments);

  const [tab, setTab] = useState<TabId>("month");
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!hydrated) return <BootSkeleton />;

  const fc = forecast(expenses, salary, adjustments, settings.today);
  const sim = simulatePockets(pockets, fc, settings.dpsAnnualRatePercent);

  // The same simulation with no what-if cuts, so the control can show what its
  // own slider moved. Running the engine twice is still far under a frame.
  const hasCuts = adjustments.some((a) => a.cutPercent > 0);
  const baseline = hasCuts
    ? simulatePockets(
        pockets,
        forecast(expenses, salary, [], settings.today),
        settings.dpsAnnualRatePercent,
      )
    : sim;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-rule bg-ground/95 backdrop-blur">
        <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="text-[15px] font-semibold tracking-tight text-ink">
                {monthLabel(fc.monthKey)}
              </h1>
              <Pill>
                as of {formatDate(settings.today, "short")} · day {fc.daysElapsed}/
                {fc.daysInMonth}
              </Pill>
              {settings.loadedCaseId ? <Pill>{settings.loadedCaseId}</Pill> : null}
            </div>
            <p className="mt-1 text-[12px] text-ink-3">
              Salary{" "}
              <Taka value={salary} className="font-medium text-ink-2" /> ·{" "}
              {expenses.length} expense{expenses.length === 1 ? "" : "s"} recorded
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
              Setup
            </Button>
            <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
              Add
            </Button>
          </div>
        </div>

        <nav
          className="flex gap-1 overflow-x-auto px-3 pb-2"
          role="tablist"
          aria-label="Sections"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                tab === t.id
                  ? "bg-ink text-white"
                  : "text-ink-2 hover:bg-sunk hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 space-y-3 px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {tab === "month" ? <DashboardTab fc={fc} expenses={expenses} /> : null}
        {tab === "forecast" ? <ForecastTab fc={fc} sim={sim} expenses={expenses} pockets={pockets} baseline={baseline} /> : null}
        {tab === "pockets" ? <PocketsTab fc={fc} sim={sim} baseline={baseline} /> : null}
        {tab === "log" ? <LogTab fc={fc} onAdd={() => setAdding(true)} /> : null}
      </main>

      <footer className="border-t border-rule px-4 py-3 text-[11px] leading-relaxed text-ink-3">
        LSH26-T071 · P12 Personal Ledger Manager. Data is kept in this browser only —
        no account, no server copy.
      </footer>

      <AddExpenseSheet open={adding} onClose={() => setAdding(false)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function BootSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-4" aria-busy="true">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-2 h-3 w-56" />
      <Skeleton className="mt-4 h-9 w-full" />
      <Skeleton className="mt-3 h-36 w-full" />
      <Skeleton className="mt-3 h-52 w-full" />
      <span className="sr-only">Loading your ledger</span>
    </div>
  );
}

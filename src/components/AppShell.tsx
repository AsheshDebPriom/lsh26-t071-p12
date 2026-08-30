"use client";

/**
 * The application shell.
 *
 * Two layouts, one component. On a phone this is a header, a scrolling page and
 * a thumb-reachable bottom bar. From `lg` up it becomes a fixed sidebar beside a
 * wide content column — a desktop product, rather than a phone page stretched
 * across a laptop.
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
import { AssistantPanel } from "./AssistantPanel";
import { DashboardTab } from "./DashboardTab";
import { ForecastTab } from "./ForecastTab";
import { LogTab } from "./LogTab";
import { PocketsTab } from "./PocketsTab";
import { SettingsSheet } from "./SettingsSheet";
import { Button, Skeleton, Taka, cn } from "./ui";

const TABS = [
  { id: "month", label: "Month", glyph: "▤", blurb: "Where the money went" },
  { id: "forecast", label: "Forecast", glyph: "◈", blurb: "How the month ends" },
  { id: "pockets", label: "Pockets", glyph: "◎", blurb: "What you are saving for" },
  { id: "log", label: "Log", glyph: "≡", blurb: "Everything recorded" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const PAGE: Record<TabId, { title: string; sub: string }> = {
  month: {
    title: "This month",
    sub: "Spending against salary, where it went, and how it compares with last month.",
  },
  forecast: {
    title: "The rest of the month",
    sub: "Projected from your own spending — and what it means, in numbers rather than advice.",
  },
  pockets: {
    title: "Savings pockets",
    sub: "Completion dates simulated month by month against the surplus the forecast predicts.",
  },
  log: {
    title: "Every expense",
    sub: "Newest first. Select any row to correct or delete it — the whole app moves with it.",
  },
};

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

  const page = PAGE[tab];

  return (
    <div className="flex min-h-dvh w-full flex-col lg:flex-row">
      {/* ---------------- Desktop sidebar ---------------- */}
      <aside className="hidden shrink-0 border-r border-rule bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[252px] lg:flex-col">
        <div className="px-5 pb-5 pt-6">
          <div className="flex items-center gap-2.5">
            <Mark />
            <div className="min-w-0">
              <p className="text-[14.5px] font-semibold leading-none tracking-tight text-ink">
                Ledger
              </p>
              <p className="mt-1.5 text-[11px] leading-none text-ink-3">LSH26-T071 · P12</p>
            </div>
          </div>
        </div>

        <div className="mx-4 rounded-xl bg-sunk px-3.5 py-3">
          <p className="text-[10.5px] uppercase leading-none tracking-[0.09em] text-ink-3">
            Viewing
          </p>
          <p className="mt-2 text-[15px] font-semibold leading-none tracking-tight text-ink">
            {monthLabel(fc.monthKey)}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-none text-ink-3">
            as of {formatDate(settings.today, "short")} · day {fc.daysElapsed} of{" "}
            {fc.daysInMonth}
          </p>
          <div className="mt-3 border-t border-rule pt-2.5">
            <p className="text-[10.5px] uppercase leading-none tracking-[0.09em] text-ink-3">
              Monthly salary
            </p>
            <p className="figure mt-1.5 text-[20px] leading-none text-ink">
              <Taka value={salary} />
            </p>
          </div>
        </div>

        <nav className="mt-5 flex-1 px-3" aria-label="Sections">
          <ul className="space-y-1">
            {TABS.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    tab === t.id ? "bg-ink text-white" : "text-ink-2 hover:bg-sunk",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "w-4 shrink-0 text-center text-[13px] leading-none",
                      tab === t.id ? "text-white/70" : "text-ink-3",
                    )}
                  >
                    {t.glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium leading-none">
                      {t.label}
                    </span>
                    <span
                      className={cn(
                        "mt-1.5 block truncate text-[11px] leading-none",
                        tab === t.id ? "text-white/55" : "text-ink-3",
                      )}
                    >
                      {t.blurb}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-2 px-4 pb-6">
          <Button variant="primary" className="w-full" onClick={() => setAdding(true)}>
            Add an expense
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => setSettingsOpen(true)}>
            Setup &amp; sample cases
          </Button>
          <p className="pt-1 text-[10.5px] leading-relaxed text-ink-3">
            Kept in this browser only — no account, no server copy.
          </p>
        </div>
      </aside>

      {/* ---------------- Mobile header ---------------- */}
      <header className="sticky top-0 z-30 border-b border-rule bg-ground/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Mark />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold leading-none tracking-tight text-ink">
                {monthLabel(fc.monthKey)}
              </p>
              <p className="mt-1.5 truncate text-[11px] leading-none text-ink-3">
                as of {formatDate(settings.today, "short")} · salary <Taka value={salary} />
              </p>
            </div>
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
      </header>

      {/* ---------------- Content ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-28 pt-5 lg:px-10 lg:pb-14 lg:pt-9">
          <div className="mb-5 lg:mb-7">
            <h1 className="text-[23px] font-semibold leading-none tracking-tight text-ink lg:text-[28px]">
              {page.title}
            </h1>
            <p className="mt-2.5 max-w-2xl text-[13px] leading-snug text-ink-2 lg:text-[14px]">
              {page.sub}
            </p>
          </div>

          {tab === "month" ? <DashboardTab fc={fc} expenses={expenses} /> : null}
          {tab === "forecast" ? (
            <ForecastTab
              fc={fc}
              sim={sim}
              expenses={expenses}
              pockets={pockets}
              baseline={baseline}
            />
          ) : null}
          {tab === "pockets" ? <PocketsTab fc={fc} sim={sim} baseline={baseline} /> : null}
          {tab === "log" ? <LogTab fc={fc} onAdd={() => setAdding(true)} /> : null}
        </main>

        <footer className="hidden border-t border-rule px-10 py-5 text-[11px] leading-relaxed text-ink-3 lg:block">
          LSH26-T071 · P12 Personal Ledger Manager · viewing{" "}
          {formatDate(settings.today, "long")} · DPS quoted at{" "}
          <span className="tnum">{settings.dpsAnnualRatePercent.toFixed(2)}%</span> a year,
          compounded monthly.
        </footer>
      </div>

      {/* ---------------- Mobile bottom bar ---------------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-surface/95 backdrop-blur lg:hidden"
        aria-label="Sections"
      >
        <ul className="mx-auto flex max-w-lg pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {TABS.map((t) => (
            <li key={t.id} className="flex-1">
              <button
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={cn(
                  "flex w-full flex-col items-center gap-1.5 px-1 pb-2 pt-2.5 transition-colors",
                  tab === t.id ? "text-ink" : "text-ink-3",
                )}
              >
                <span aria-hidden className="text-[15px] leading-none">
                  {t.glyph}
                </span>
                <span className="text-[10.5px] font-medium leading-none">{t.label}</span>
                <span
                  aria-hidden
                  className={cn(
                    "h-[2px] w-7 rounded-full",
                    tab === t.id ? "bg-ink" : "bg-transparent",
                  )}
                />
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <AssistantPanel
        fc={fc}
        sim={sim}
        pockets={pockets}
        expenses={expenses}
        onNavigate={setTab}
      />

      <AddExpenseSheet open={adding} onClose={() => setAdding(false)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function Mark() {
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink"
    >
      <svg viewBox="0 0 32 32" className="h-5 w-5">
        <g stroke="#f7f6f4" strokeWidth="2.4" strokeLinecap="round">
          <path d="M8 11h11" />
          <path d="M8 17h16" />
          <path d="M8 23h7" />
        </g>
        <circle cx="24" cy="11" r="2.6" fill="#15607a" />
      </svg>
    </span>
  );
}

function BootSkeleton() {
  return (
    <div className="flex min-h-dvh w-full" aria-busy="true">
      <div className="hidden w-[252px] shrink-0 border-r border-rule bg-surface p-5 lg:block">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-5 h-28 w-full" />
        <Skeleton className="mt-5 h-11 w-full" />
        <Skeleton className="mt-2 h-11 w-full" />
        <Skeleton className="mt-2 h-11 w-full" />
      </div>
      <div className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 lg:px-10 lg:py-9">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-3 h-4 w-80" />
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="mt-4 h-80 w-full" />
      </div>
      <span className="sr-only">Loading your ledger</span>
    </div>
  );
}

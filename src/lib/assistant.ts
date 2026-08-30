/**
 * The assistant's contract with the rest of the app.
 *
 * Two rules hold this together, and both exist to stop a chat box turning into
 * a plausible-sounding source of wrong money figures:
 *
 *  1. **The model never computes a number.** Every figure it can quote is
 *     handed to it in a digest built by the same pure functions that draw the
 *     screens. If a fact is not in the digest, the correct answer is "I don't
 *     have that", not an estimate.
 *  2. **The model never writes to the ledger.** It can only *propose* an
 *     action, as a typed tool call. The proposal is rendered as a card the user
 *     approves or discards, and the store is written by the app.
 *
 * The insight engine is untouched by any of this. Requirement 3's sentences are
 * still templates over computed values — nothing on that path passes through a
 * model.
 */

import { formatDate, monthLabel, monthName } from "./dates";
import type { Forecast } from "./forecast";
import { buildInsights } from "./insights";
import { fromPaisa } from "./money";
import type { PocketSimulation } from "./pockets";
import type { Expense, Pocket } from "./types";

export type ChatRole = "user" | "assistant";

export type ProposedAction =
  | { kind: "add_expense"; amount: number; date: string; shop: string; category: string }
  | { kind: "add_pocket"; name: string; item: string; target: number; monthlyContribution: number }
  | { kind: "set_pocket_contribution"; pocket: string; monthlyContribution: number }
  | { kind: "set_salary"; amount: number }
  | { kind: "set_what_if"; category: string; cutPercent: number }
  | { kind: "clear_what_if" }
  | { kind: "load_sample_case"; caseId: string }
  | { kind: "show_tab"; tab: "month" | "forecast" | "pockets" | "log" };

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  /** Set on an assistant turn that wants to change something. */
  action?: ProposedAction;
  /** Set once the user has decided about `action`. */
  actionState?: "pending" | "applied" | "discarded";
  error?: boolean;
};

const KNOWN_TABS = new Set(["month", "forecast", "pockets", "log"]);

/**
 * Turn a raw tool call from the wire into a typed action, or null.
 *
 * Nothing is trusted: an amount has to be a positive finite number, a date has
 * to be ISO, a tab has to be one this app has. A malformed call becomes null
 * and the user simply sees the assistant's text instead of a broken card.
 */
export function parseAction(raw: unknown): ProposedAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { name, args } = raw as { name?: unknown; args?: unknown };
  if (typeof name !== "string" || typeof args !== "object" || args === null) return null;
  const a = args as Record<string, unknown>;

  const money = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100); // taka -> paisa
  };
  const str = (v: unknown): string | null => {
    const t = typeof v === "string" ? v.trim() : "";
    return t.length > 0 && t.length <= 120 ? t : null;
  };

  switch (name) {
    case "add_expense": {
      const amount = money(a.amount);
      const shop = str(a.shop);
      const category = str(a.category);
      const date = str(a.date);
      if (!amount || !shop || !category || !date) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      return { kind: "add_expense", amount, shop, category, date };
    }
    case "add_pocket": {
      const name_ = str(a.name);
      const item = str(a.item);
      const target = money(a.target);
      const monthlyContribution = money(a.monthlyContribution);
      if (!name_ || !item || !target || !monthlyContribution) return null;
      return { kind: "add_pocket", name: name_, item, target, monthlyContribution };
    }
    case "set_pocket_contribution": {
      const pocket = str(a.pocket);
      const monthlyContribution = money(a.monthlyContribution);
      if (!pocket || !monthlyContribution) return null;
      return { kind: "set_pocket_contribution", pocket, monthlyContribution };
    }
    case "set_salary": {
      const amount = money(a.amount);
      if (!amount) return null;
      return { kind: "set_salary", amount };
    }
    case "set_what_if": {
      const category = str(a.category);
      const raw = typeof a.cutPercent === "string" ? Number(a.cutPercent) : a.cutPercent;
      if (!category || typeof raw !== "number" || !Number.isFinite(raw)) return null;
      return {
        kind: "set_what_if",
        category,
        cutPercent: Math.max(0, Math.min(100, Math.round(raw))),
      };
    }
    case "clear_what_if":
      return { kind: "clear_what_if" };
    case "load_sample_case": {
      const caseId = str(a.caseId)?.toUpperCase();
      if (!caseId || !/^PUB-\d{2}$/.test(caseId)) return null;
      return { kind: "load_sample_case", caseId };
    }
    case "show_tab": {
      const tab = str(a.tab)?.toLowerCase();
      if (!tab || !KNOWN_TABS.has(tab)) return null;
      return { kind: "show_tab", tab: tab as "month" | "forecast" | "pockets" | "log" };
    }
    default:
      return null;
  }
}

/** Actions that change stored data need an explicit yes. */
export function needsConfirmation(a: ProposedAction): boolean {
  return a.kind !== "show_tab";
}

/** A short sentence describing what an action would do, for the confirm card. */
export function describeAction(a: ProposedAction): string {
  const taka = (p: number) => `৳${fromPaisa(p).toLocaleString("en-US")}`;
  switch (a.kind) {
    case "add_expense":
      return `Record ${taka(a.amount)} at ${a.shop} (${a.category}) on ${formatDate(a.date, "long")}.`;
    case "add_pocket":
      return `Create a pocket “${a.name}” for ${a.item} — ${taka(a.target)} target, ${taka(
        a.monthlyContribution,
      )} a month.`;
    case "set_pocket_contribution":
      return `Change ${a.pocket}'s monthly contribution to ${taka(a.monthlyContribution)}.`;
    case "set_salary":
      return `Set the monthly salary to ${taka(a.amount)}.`;
    case "set_what_if":
      return `Try cutting ${a.category} by ${a.cutPercent}% and move every pocket date.`;
    case "clear_what_if":
      return "Clear the what-if and return every date to the real forecast.";
    case "load_sample_case":
      return `Load published case ${a.caseId}, replacing the whole ledger.`;
    case "show_tab":
      return `Open the ${a.tab} screen.`;
  }
}

/**
 * Everything the model is allowed to know, computed by the engine.
 *
 * Kept deliberately flat and in taka rather than paisa, because the model is
 * quoting these back to a person, not doing arithmetic on them.
 */
export function buildDigest(
  fc: Forecast,
  sim: PocketSimulation,
  pockets: Pocket[],
  expenses: Expense[],
  dpsRate: number,
) {
  const t = (p: number) => Number(fromPaisa(p).toFixed(2));

  const thisMonth = expenses.filter((e) => e.date.startsWith(fc.monthKey));

  return {
    viewing: {
      today: fc.today,
      month: monthLabel(fc.monthKey),
      previousMonth: monthLabel(fc.prevMonthKey),
      dayOfMonth: fc.daysElapsed,
      daysInMonth: fc.daysInMonth,
      daysRemaining: fc.daysRemaining,
      note: "The app treats this date as today. It is a setting, not the system clock.",
    },
    money: {
      monthlySalary: t(fc.salary),
      spentSoFar: t(fc.spentSoFar),
      forecastForRestOfMonth: t(fc.projectedRemaining),
      projectedMonthTotal: t(fc.projectedMonthTotal),
      endOfMonthPosition: t(fc.endOfMonthPosition),
      endOfMonthPositionMeaning:
        fc.endOfMonthPosition >= 0 ? "clear (money left over)" : "short (overspent)",
      lastMonthTotal: t(fc.prevMonthTotal),
      lastMonthToSameDay: t(fc.prevMonthToDate),
      averageSpendPerDaySoFar: t(Math.round(fc.burnRateSoFar)),
      fixedMonthlyCharges: t(fc.fixedMonthlyTotal),
    },
    categories: fc.categories.map((c) => ({
      category: c.category,
      spentThisMonth: t(c.spentThisMonth),
      sameDaysLastMonth: t(c.prevMonthToDate),
      wholeLastMonth: t(c.prevMonthTotal),
      forecastRestOfMonth: t(c.projectedRemaining),
      projectedMonthTotal: t(c.projectedMonthTotal),
      whatIfCutPercent: c.cutPercent,
    })),
    monthlyCharges: fc.monthlyCharges.map((m) => ({
      shop: m.shop,
      category: m.category,
      expectedEachMonth: t(m.expectedMonthly),
      alreadyPaidThisMonth: m.paidThisMonth,
      stillExpectedThisMonth: t(m.remainingThisMonth),
      flaggedRecurring: m.confirmedRecurring,
    })),
    savingsPockets: pockets
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map((p, i) => {
        const proj = sim.projections.get(p.id);
        return {
          name: p.name,
          item: p.item,
          target: t(p.target),
          monthlyContribution: t(p.monthlyContribution),
          fundingOrder: i + 1,
          reachable: proj?.reachable ?? false,
          expectedCompletionDate: proj?.completionDate
            ? formatDate(proj.completionDate, "long")
            : null,
          monthsFromForecastSimulation: proj?.monthsToComplete ?? null,
          monthsIfYouJustDivided: Math.ceil(p.target / p.monthlyContribution),
          fundedThisMonth: t(proj?.fundedThisMonth ?? 0),
          requestedThisMonth: t(proj?.requestedThisMonth ?? 0),
          dpsBalanceAtThatDate: proj?.dps ? t(proj.dps.balanceAtPocketCompletion) : null,
          dpsInterestEarned: proj?.dps ? t(proj.dps.interestAtPocketCompletion) : null,
          dpsReachesTargetOn:
            proj?.dps?.targetReachedDate ? formatDate(proj.dps.targetReachedDate, "long") : null,
        };
      }),
    savingCapacity: {
      leftThisMonth: t(sim.currentMonthSurplus),
      typicalMonthSurplus: t(sim.steadyMonthSurplus),
      pocketsAskForEachMonth: t(sim.totalRequested),
    },
    dps: {
      annualRatePercent: dpsRate,
      compounding:
        "monthly; the deposit goes in first, then interest of balance x rate / 12 / 100 is rounded half up to the paisa and added",
    },
    largestExpensesThisMonth: thisMonth
      .slice()
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
      .map((e) => ({
        shop: e.shop,
        category: e.category,
        date: formatDate(e.date, "long"),
        amount: t(e.amount),
      })),
    writtenInsights: buildInsights(fc, sim, pockets, expenses).map((i) => i.text),
    counts: {
      expensesThisMonth: thisMonth.length,
      expensesTotal: expenses.length,
      pockets: pockets.length,
    },
    howTheForecastWorks: `Spending splits into monthly charges (a shop that billed once last month for a material amount — if already paid this month it adds nothing more) and day-to-day spending, projected from a daily rate blending this month with ${monthName(
      fc.prevMonthKey,
    )} weighted by how much of the month has elapsed. Pocket completion dates come from running the calendar forward month by month against the surplus the forecast predicts, never from target divided by contribution.`,
  };
}

export type Digest = ReturnType<typeof buildDigest>;

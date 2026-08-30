/**
 * Insights.
 *
 * Every line is a template with computed numbers injected. There is no model
 * text here and no stored advice — each template either fires with real
 * figures or returns null, and the ones that fire are ranked by how much money
 * they are about. Change an expense and the numbers change, so the sentences
 * change with them; that is true by construction rather than by promise.
 */

import { formatDate, monthName, type MonthKey } from "./dates";
import type { Forecast } from "./forecast";
import { formatTaka, type Paisa } from "./money";
import type { PocketSimulation } from "./pockets";
import type { Expense, Pocket } from "./types";

export type InsightTone = "neutral" | "warn" | "good";

export type Insight = {
  id: string;
  /** The sentence, already carrying its numbers. */
  text: string;
  tone: InsightTone;
  /** Taka-equivalent size of what the insight is about; drives ranking. */
  materiality: number;
  /** Requirement-3 headlines that always render, whatever else fires. */
  pinned?: boolean;
};

const pct = (x: number) => `${Math.round(Math.abs(x))}%`;
const t = (p: Paisa, d: 0 | 2 = 0) => formatTaka(Math.abs(p), d);

/**
 * Build the ranked insight list.
 *
 * `pinned` insights always appear, in order, at the top. The rest are sorted
 * by materiality and the caller takes as many as it has room for. Nine
 * templates are tried; typically five or six fire.
 */
export function buildInsights(
  fc: Forecast,
  sim: PocketSimulation,
  pockets: Pocket[],
  expenses: Expense[] = [],
): Insight[] {
  const out: Insight[] = [];
  const push = (i: Insight | null) => {
    if (i && i.text) out.push(i);
  };
  const month = monthName(fc.monthKey);
  const prevMonth = monthName(fc.prevMonthKey);

  push(endOfMonthPosition(fc, month));
  push(restOfMonth(fc, month));
  push(paceAgainstLastMonth(fc, prevMonth));
  push(categoryAbove(fc, prevMonth));
  push(categoryBelow(fc, prevMonth));
  push(topThreeShare(fc, expenses));
  push(largestSingle(fc, expenses));
  push(fixedLoad(fc));
  push(dailyAllowance(fc, month));
  push(pocketPressure(fc, sim, pockets));

  const pinned = out.filter((i) => i.pinned);
  const rest = out.filter((i) => !i.pinned).sort((a, b) => b.materiality - a.materiality);
  return [...pinned, ...rest];
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/** Requirement 3: expected money left or short at month end. */
function endOfMonthPosition(fc: Forecast, month: string): Insight | null {
  if (fc.isEmpty || fc.salary === 0) return null;
  const p = fc.endOfMonthPosition;
  const clear = p >= 0;
  return {
    id: "end-of-month",
    pinned: true,
    tone: clear ? "good" : "warn",
    materiality: Math.abs(p),
    text: clear
      ? `At your current rate you will end ${month} with ${t(p)} clear — ${t(fc.projectedMonthTotal)} spent against a ${t(fc.salary)} salary.`
      : `At your current rate you will end ${month} ${t(p)} short — ${t(fc.projectedMonthTotal)} projected against a ${t(fc.salary)} salary.`,
  };
}

/** Requirement 3: expected spending for the rest of the month. */
function restOfMonth(fc: Forecast, month: string): Insight | null {
  if (fc.isEmpty) return null;
  const top = fc.categories
    .filter((c) => c.projectedRemaining > 0)
    .sort((a, b) => b.projectedRemaining - a.projectedRemaining)
    .slice(0, 2);
  if (top.length === 0) {
    return {
      id: "rest-of-month",
      pinned: true,
      tone: "neutral",
      materiality: 0,
      text: `${fc.daysRemaining === 0 ? `${month} is over` : `Nothing further is forecast for the last ${fc.daysRemaining} days of ${month}`} — ${t(fc.spentSoFar)} spent in total.`,
    };
  }
  const named = top
    .map((c) => `${c.category} ${t(c.projectedRemaining)}`)
    .join(" and ");
  return {
    id: "rest-of-month",
    pinned: true,
    tone: "neutral",
    materiality: fc.projectedRemaining,
    text: `${t(fc.projectedRemaining)} more is expected over the last ${fc.daysRemaining} ${fc.daysRemaining === 1 ? "day" : "days"} of ${month}, mostly ${named}.`,
  };
}

/** Like-for-like pace: the same slice of last month. */
function paceAgainstLastMonth(fc: Forecast, prevMonth: string): Insight | null {
  if (fc.prevMonthToDate === 0 || fc.spentSoFar === 0) return null;
  const delta = fc.spentSoFar - fc.prevMonthToDate;
  if (Math.abs(delta) < 5000) return null; // under ৳50, not worth a sentence
  const ratio = (delta / fc.prevMonthToDate) * 100;
  return {
    id: "pace",
    tone: delta > 0 ? "warn" : "good",
    materiality: Math.abs(delta) * 1.1,
    text: `By day ${fc.daysElapsed} you have spent ${t(fc.spentSoFar)}, ${t(delta)} ${delta > 0 ? "more" : "less"} than the ${t(fc.prevMonthToDate)} you had spent by day ${fc.daysElapsed} of ${prevMonth} — ${pct(ratio)} ${delta > 0 ? "above" : "below"} that pace.`,
  };
}

/** The category running hottest against its own last-month total. */
function categoryAbove(fc: Forecast, prevMonth: string): Insight | null {
  const candidates = fc.categories
    .filter((c) => c.prevMonthTotal > 0 && c.projectedMonthTotal > c.prevMonthTotal)
    .map((c) => ({ c, delta: c.projectedMonthTotal - c.prevMonthTotal }))
    .sort((a, b) => b.delta - a.delta);
  const top = candidates[0];
  if (!top || top.delta < 5000) return null;
  const ratio = (top.delta / top.c.prevMonthTotal) * 100;
  return {
    id: "category-above",
    tone: "warn",
    materiality: top.delta,
    text: `${top.c.category} is on track for ${t(top.c.projectedMonthTotal)} this month, ${pct(ratio)} above ${prevMonth}'s ${t(top.c.prevMonthTotal)} — ${t(top.delta)} more.`,
  };
}

/** The category that has genuinely come down. */
function categoryBelow(fc: Forecast, prevMonth: string): Insight | null {
  const candidates = fc.categories
    .filter((c) => c.prevMonthTotal > 0 && c.projectedMonthTotal < c.prevMonthTotal)
    .map((c) => ({ c, delta: c.prevMonthTotal - c.projectedMonthTotal }))
    .sort((a, b) => b.delta - a.delta);
  const top = candidates[0];
  if (!top || top.delta < 5000) return null;
  const ratio = (top.delta / top.c.prevMonthTotal) * 100;
  return {
    id: "category-below",
    tone: "good",
    materiality: top.delta * 0.9,
    text: `${top.c.category} is down to ${t(top.c.projectedMonthTotal)}, ${pct(ratio)} below ${prevMonth}'s ${t(top.c.prevMonthTotal)} — ${t(top.delta)} kept.`,
  };
}

/** Concentration: how much of the month sits in three lines. */
function topThreeShare(fc: Forecast, expenses: Expense[]): Insight | null {
  const thisMonth = expenses
    .filter((e) => e.date.startsWith(fc.monthKey))
    .sort((a, b) => b.amount - a.amount);
  if (thisMonth.length < 3 || fc.spentSoFar === 0) return null;
  const three = thisMonth.slice(0, 3);
  const sum = three.reduce((s, e) => s + e.amount, 0);
  const share = (sum / fc.spentSoFar) * 100;
  const named = three.map((e) => `${e.shop} ${t(e.amount)}`).join(", ");
  return {
    id: "top-three",
    tone: share >= 60 ? "warn" : "neutral",
    materiality: sum * 0.8,
    text: `Your three largest expenses — ${named} — account for ${pct(share)} of the ${t(fc.spentSoFar)} spent this month.`,
  };
}

function largestSingle(fc: Forecast, expenses: Expense[]): Insight | null {
  const thisMonth = expenses.filter((e) => e.date.startsWith(fc.monthKey));
  if (thisMonth.length === 0 || fc.spentSoFar === 0) return null;
  const top = thisMonth.reduce((a, b) => (b.amount > a.amount ? b : a));
  const share = (top.amount / fc.spentSoFar) * 100;
  if (share < 12) return null;
  return {
    id: "largest-single",
    tone: "neutral",
    materiality: top.amount * 0.7,
    text: `The single largest thing you paid for this month is ${t(top.amount)} at ${top.shop} (${top.category}) on ${formatDate(top.date, "long")} — ${pct(share)} of everything spent so far.`,
  };
}

/** Fixed charges are the part of the month that is not really a choice. */
function fixedLoad(fc: Forecast): Insight | null {
  if (fc.fixedMonthlyTotal === 0 || fc.salary === 0) return null;
  const share = (fc.fixedMonthlyTotal / fc.salary) * 100;
  const named = fc.monthlyCharges.slice(0, 3).map((m) => m.shop);
  const more = fc.monthlyCharges.length - named.length;
  const list = named.join(", ") + (more > 0 ? ` and ${more} more` : "");
  return {
    id: "fixed-load",
    tone: share >= 55 ? "warn" : "neutral",
    materiality: fc.fixedMonthlyTotal * 0.6,
    text: `${t(fc.fixedMonthlyTotal)} of your month is fixed — ${list} — which is ${pct(share)} of salary before you buy anything.`,
  };
}

/** What is actually left to spend per day if the month is to end clear. */
function dailyAllowance(fc: Forecast, month: string): Insight | null {
  if (fc.daysRemaining <= 0 || fc.salary === 0) return null;
  const left = fc.salary - fc.spentSoFar;
  const perDay = Math.round(left / fc.daysRemaining);
  const running = Math.round(fc.burnRateSoFar);
  if (left <= 0) {
    return {
      id: "daily-allowance",
      tone: "warn",
      materiality: Math.abs(left),
      text: `Your salary for ${month} is already spent with ${fc.daysRemaining} days to go — ${t(-left)} over, at ${t(running)} a day so far.`,
    };
  }
  return {
    id: "daily-allowance",
    tone: perDay < running ? "warn" : "good",
    materiality: Math.abs(running - perDay) * fc.daysRemaining,
    text: `${t(left)} is left for the last ${fc.daysRemaining} days of ${month}, or ${t(perDay)} a day — you have been spending ${t(running)} a day.`,
  };
}

/** Ties the forecast to the pockets: what the surplus can actually fund. */
function pocketPressure(
  fc: Forecast,
  sim: PocketSimulation,
  pockets: Pocket[],
): Insight | null {
  if (pockets.length === 0 || sim.totalRequested === 0) return null;
  const surplus = sim.steadyMonthSurplus;
  if (surplus >= sim.totalRequested) {
    return {
      id: "pocket-pressure",
      tone: "good",
      materiality: surplus * 0.5,
      text: `Your pockets ask for ${t(sim.totalRequested)} a month and the forecast leaves ${t(surplus)} — every contribution is covered, with ${t(surplus - sim.totalRequested)} spare.`,
    };
  }
  const funded = pockets
    .map((p) => ({ p, proj: sim.projections.get(p.id) }))
    .filter((x) => x.proj && x.proj.fundedThisMonth >= x.proj.requestedThisMonth && x.proj.requestedThisMonth > 0);
  const short = sim.totalRequested - Math.max(0, surplus);
  return {
    id: "pocket-pressure",
    tone: "warn",
    materiality: short * 0.85,
    text:
      surplus <= 0
        ? `Your pockets ask for ${t(sim.totalRequested)} a month but the forecast leaves nothing over — no pocket is funded until spending comes down.`
        : `Your pockets ask for ${t(sim.totalRequested)} a month but the forecast leaves ${t(surplus)}, so ${t(short)} of contributions goes unfunded${funded.length > 0 ? ` — only ${funded.map((x) => x.p.name).join(" and ")} ${funded.length === 1 ? "is" : "are"} filled in full` : ""}.`,
  };
}

/** For the pocket panel: a short sentence per pocket, also templated. */
export function pocketSentence(
  pocket: Pocket,
  sim: PocketSimulation,
  monthKey: MonthKey,
): string {
  const proj = sim.projections.get(pocket.id);
  if (!proj) return "";
  if (!proj.reachable) {
    return `Not reachable at current spending — the forecast leaves ${t(Math.max(0, sim.steadyMonthSurplus))} a month and the pockets ahead of ${pocket.name} take it first.`;
  }
  const shortfall = proj.requestedThisMonth - proj.fundedThisMonth;
  if (shortfall > 0) {
    return `This month the forecast funds ${t(proj.fundedThisMonth)} of the ${t(proj.requestedThisMonth)} you set aside for ${pocket.name}, so the date sits ${proj.monthsToComplete} months out rather than ${Math.ceil(pocket.target / pocket.monthlyContribution)}.`;
  }
  void monthKey;
  return `The forecast funds the full ${t(pocket.monthlyContribution)} a month, reaching ${t(pocket.target)} in ${proj.monthsToComplete} months.`;
}

/**
 * Goal seek — the what-if slider run backwards.
 *
 * The slider asks "if I cut Food by 30%, when do I get the laptop?". This asks
 * the question people actually have: **"I want the laptop by December — what
 * has to be true?"**
 *
 * Nothing here is modelled or estimated. Every plan it returns is verified by
 * running the *real* forecast and the *real* pocket simulation with that plan
 * applied, and every cut percentage is the smallest whole percent that works —
 * found by binary search, which is valid because a deeper cut can only free
 * more money and so can only bring a date forward.
 *
 * It searches cheapest-sacrifice-first, and the cheapest lever is not spending
 * less at all: **moving the pocket up the funding order costs nothing.** On the
 * seeded ledger the Laptop sits behind a ৳20,000-a-month Wedding pocket, so the
 * honest first answer is usually "fund this one first", not "eat less".
 *
 * Roughly a hundred to three hundred simulations per search, which measures at
 * 40–150ms. That is a button press, not a keystroke — the UI runs it when a
 * pocket or a deadline is chosen, never on every render.
 */

import { monthKeyOf, type ISODate, type MonthKey } from "./dates";
import { forecast } from "./forecast";
import type { Paisa } from "./money";
import { simulatePockets } from "./pockets";
import type { CategoryAdjustment, Expense, Pocket } from "./types";

/** Whole percentages only: "cut Food by 37.4%" is not an instruction anyone can follow. */
const MIN_CUT = 1;
const MAX_CUT = 100;

export type PlannedCut = {
  category: string;
  cutPercent: number;
  /** What that category costs in a typical month today. */
  monthlyCost: Paisa;
  /** What the cut frees up each month. */
  freedPerMonth: Paisa;
};

export type Plan = {
  /** Move this pocket to the front of the funding order. Costs nothing. */
  moveToFront: boolean;
  cuts: PlannedCut[];
  /** The date the pocket actually lands on under this plan, from the engine. */
  achievedDate: ISODate;
  freedPerMonth: Paisa;
};

export type GoalSeekResult =
  | { kind: "no-pocket" }
  /** Already on or before the deadline — nothing needs to change. */
  | { kind: "already"; currentDate: ISODate }
  /** Out of reach even with the pocket funded first and every category cut out. */
  | { kind: "impossible"; currentDate: ISODate | null }
  | { kind: "needs"; currentDate: ISODate | null; plans: Plan[] };

export type GoalSeekInputs = {
  expenses: Expense[];
  salary: Paisa;
  today: ISODate;
  pockets: Pocket[];
  pocketId: string;
  dpsRate: number;
};

/** The pockets list with one pocket moved to the front of the funding order. */
function withFront(pockets: Pocket[], id: string): Pocket[] {
  const ordered = [...pockets].sort((a, b) => a.priority - b.priority);
  const i = ordered.findIndex((p) => p.id === id);
  if (i <= 0) return ordered;
  const [moved] = ordered.splice(i, 1);
  return [moved, ...ordered].map((p, k) => ({ ...p, priority: k }));
}

/** Run the whole engine once under a plan and read this pocket's completion. */
function runPlan(
  inp: GoalSeekInputs,
  moveToFront: boolean,
  cuts: CategoryAdjustment[],
): { month: MonthKey | null; date: ISODate | null } {
  const pockets = moveToFront ? withFront(inp.pockets, inp.pocketId) : inp.pockets;
  const fc = forecast(inp.expenses, inp.salary, cuts, inp.today);
  const proj = simulatePockets(pockets, fc, inp.dpsRate).projections.get(inp.pocketId);
  return { month: proj?.completionMonth ?? null, date: proj?.completionDate ?? null };
}

const meets = (m: MonthKey | null, deadline: MonthKey) => m !== null && m <= deadline;

/**
 * Smallest whole-percent cut of one category that reaches the deadline under a
 * given plan, or null if cutting it out entirely still is not enough.
 */
function smallestCut(
  inp: GoalSeekInputs,
  deadline: MonthKey,
  moveToFront: boolean,
  category: string,
  alongside: CategoryAdjustment[] = [],
): number | null {
  const at = (pct: number) =>
    runPlan(inp, moveToFront, [...alongside, { category, cutPercent: pct }]).month;

  if (!meets(at(MAX_CUT), deadline)) return null;

  let lo = MIN_CUT;
  let hi = MAX_CUT;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (meets(at(mid), deadline)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function goalSeek(inp: GoalSeekInputs, deadline: MonthKey): GoalSeekResult {
  if (!inp.pockets.some((p) => p.id === inp.pocketId)) return { kind: "no-pocket" };

  const baseFc = forecast(inp.expenses, inp.salary, [], inp.today);
  const base = runPlan(inp, false, []);

  if (meets(base.month, deadline)) {
    return { kind: "already", currentDate: base.date! };
  }

  const costOf = (category: string) =>
    baseFc.categories.find((c) => c.category === category)?.typicalMonthlyCost(baseFc.monthKey) ??
    0;

  const cut = (category: string, cutPercent: number): PlannedCut => {
    const monthlyCost = costOf(category);
    return {
      category,
      cutPercent,
      monthlyCost,
      freedPerMonth: Math.round((monthlyCost * cutPercent) / 100),
    };
  };

  const candidates = baseFc.categories
    .filter((c) => c.typicalMonthlyCost(baseFc.monthKey) > 0)
    .sort((a, b) => b.typicalMonthlyCost(baseFc.monthKey) - a.typicalMonthlyCost(baseFc.monthKey))
    .map((c) => c.category);

  const alreadyFirst =
    [...inp.pockets].sort((a, b) => a.priority - b.priority)[0]?.id === inp.pocketId;

  const plans: Plan[] = [];
  const add = (moveToFront: boolean, cuts: PlannedCut[]) => {
    const { date } = runPlan(
      inp,
      moveToFront,
      cuts.map((c) => ({ category: c.category, cutPercent: c.cutPercent })),
    );
    if (!date) return;
    plans.push({
      moveToFront,
      cuts,
      achievedDate: date,
      freedPerMonth: cuts.reduce((s, c) => s + c.freedPerMonth, 0),
    });
  };

  // 1. The free one: just fund this pocket first. No spending changes at all.
  if (!alreadyFirst && meets(runPlan(inp, true, []).month, deadline)) {
    add(true, []);
    return { kind: "needs", currentDate: base.date, plans };
  }

  // 2. One category, funding order untouched.
  for (const category of candidates) {
    const pct = smallestCut(inp, deadline, false, category);
    if (pct !== null) add(false, [cut(category, pct)]);
  }

  // 3. Fund it first, and cut one category — usually far shallower than (2).
  if (!alreadyFirst) {
    for (const category of candidates) {
      const pct = smallestCut(inp, deadline, true, category);
      if (pct !== null) add(true, [cut(category, pct)]);
    }
  }

  // 4. Only if nothing above worked: two categories together.
  if (plans.length === 0) {
    const top = candidates.slice(0, 5);
    for (let i = 0; i < top.length && plans.length < 3; i += 1) {
      for (let j = i + 1; j < top.length && plans.length < 3; j += 1) {
        const anchor = { category: top[i], cutPercent: 50 };
        const pct = smallestCut(inp, deadline, !alreadyFirst, top[j], [anchor]);
        if (pct !== null) {
          add(!alreadyFirst, [cut(top[i], 50), cut(top[j], pct)]);
        }
      }
    }
  }

  if (plans.length === 0) return { kind: "impossible", currentDate: base.date };

  // Cheapest sacrifice first: least money given up, then shallowest cut.
  plans.sort(
    (a, b) =>
      a.freedPerMonth - b.freedPerMonth ||
      (a.cuts[0]?.cutPercent ?? 0) - (b.cuts[0]?.cutPercent ?? 0),
  );

  return { kind: "needs", currentDate: base.date, plans: plans.slice(0, 4) };
}

/** Deadline choices, as month keys, spread the way people actually think. */
export function deadlineOptions(today: ISODate): { months: number; key: MonthKey }[] {
  const [y, m] = monthKeyOf(today).split("-").map(Number);
  return [6, 12, 18, 24, 36, 60].map((n) => {
    const total = y * 12 + (m - 1) + n;
    return {
      months: n,
      key: `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`,
    };
  });
}

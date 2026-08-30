/**
 * The forecast.
 *
 * A pure function over the expense list. No clock, no state, no I/O — so it
 * can be recomputed on every slider tick without debouncing, and so its output
 * is reproducible for any published case.
 *
 * The model, in one paragraph:
 *
 *   Spending splits into two kinds. A shop that billed **once** last month for
 *   a material amount is treated as a *monthly charge* — rent, the electricity
 *   bill, a subscription. If it has already been paid this month it will not be
 *   paid again, so it adds nothing to the rest of the month; if it has not, we
 *   expect it once more before month end. Everything else is *day-to-day*
 *   spending, projected from a daily burn rate that blends this month's rate so
 *   far with last month's actual rate.
 *
 * Treating monthly charges separately is not a nicety. Rent is the largest line
 * in the fixture and it is always paid in the first days of the month; a plain
 * daily-rate extrapolation on the 17th would forecast it at nearly double.
 */

import {
  addMonths,
  dayOfMonth,
  daysInMonthKey,
  monthKeyOf,
  type ISODate,
  type MonthKey,
} from "./dates";
import type { Paisa } from "./money";
import type { CategoryAdjustment, Expense } from "./types";

/** Noise floor: below this share of salary a shop is never a "monthly charge". */
const MATERIALITY_OF_SALARY = 0.01;
/**
 * A charge that has *not* yet appeared this month is only expected again if it
 * is this material. Rent and the electricity bill clear it; a one-off purchase
 * that happened to be the only visit to that shop last month does not, and is
 * left to the day-to-day burn rate instead.
 */
const STILL_DUE_MATERIALITY = 0.03;
/** Days past its usual date before an unpaid monthly charge is treated as skipped. */
const OVERDUE_GRACE_DAYS = 5;

export type MonthlyCharge = {
  key: string;
  shop: string;
  category: string;
  /** Last month's amount for this shop. */
  prevAmount: Paisa;
  prevDay: number;
  /** This month's amount, if it has already landed. */
  thisAmount: Paisa | null;
  thisDay: number | null;
  /** What we expect this charge to cost in a typical month. */
  expectedMonthly: Paisa;
  paidThisMonth: boolean;
  /** Still expected before this month ends. */
  remainingThisMonth: Paisa;
  /**
   * Strict test for the recurring badge: same shop, both months, amount within
   * 15%. Narrower than the forecast's notion of a monthly charge, on purpose.
   */
  confirmedRecurring: boolean;
};

export type CategoryProjection = {
  category: string;
  /** Actually spent this month, up to and including `today`. */
  spentThisMonth: Paisa;
  /** Last month's full total. */
  prevMonthTotal: Paisa;
  /** Blended day-to-day burn rate, paisa per day. */
  dailyRate: number;
  /** Monthly charges in this category still expected this month. */
  fixedRemaining: Paisa;
  /** Day-to-day spending still expected this month. */
  variableRemaining: Paisa;
  /** fixedRemaining + variableRemaining, after any what-if cut. */
  projectedRemaining: Paisa;
  /** spentThisMonth + projectedRemaining. */
  projectedMonthTotal: Paisa;
  /** What a whole future month costs in this category, after any cut. */
  typicalMonthlyCost: (mk: MonthKey) => Paisa;
  /** Percent this category is being cut by the what-if control, 0 when none. */
  cutPercent: number;
};

export type Forecast = {
  today: ISODate;
  monthKey: MonthKey;
  prevMonthKey: MonthKey;
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;

  salary: Paisa;

  /** Spent so far this month. */
  spentSoFar: Paisa;
  /** Expected spending for the rest of the month. */
  projectedRemaining: Paisa;
  /** spentSoFar + projectedRemaining. */
  projectedMonthTotal: Paisa;
  /** salary minus projectedMonthTotal. Positive is clear, negative is short. */
  endOfMonthPosition: Paisa;

  prevMonthTotal: Paisa;
  /** The same slice of last month, day 1..daysElapsed — a like-for-like. */
  prevMonthToDate: Paisa;

  /** Average paisa/day spent so far this month, all categories. */
  burnRateSoFar: number;

  categories: CategoryProjection[];
  monthlyCharges: MonthlyCharge[];
  /** Monthly charges that pass the strict shop + similar-amount test. */
  recurring: MonthlyCharge[];
  /** Sum of every monthly charge in a typical month. */
  fixedMonthlyTotal: Paisa;

  /** What a whole future month is expected to cost, after any what-if cut. */
  typicalMonthSpend: (mk: MonthKey) => Paisa;
  /** Salary minus that. The surplus the pocket simulation gets to allocate. */
  typicalMonthSurplus: (mk: MonthKey) => Paisa;

  adjustments: CategoryAdjustment[];
  isEmpty: boolean;
};

function seriesKey(shop: string, category: string) {
  return shop.trim().toLowerCase() + "|" + category.trim().toLowerCase();
}

/**
 * Group expenses by shop within category and work out which of them behave
 * like a charge that arrives once a month.
 */
export function findMonthlyCharges(
  expenses: Expense[],
  monthKey: MonthKey,
  prevMonthKey: MonthKey,
  salary: Paisa,
  today: ISODate,
): MonthlyCharge[] {
  const groups = new Map<
    string,
    { shop: string; category: string; prev: Expense[]; cur: Expense[] }
  >();

  for (const e of expenses) {
    const mk = monthKeyOf(e.date);
    if (mk !== monthKey && mk !== prevMonthKey) continue;
    const key = seriesKey(e.shop, e.category);
    let g = groups.get(key);
    if (!g) {
      g = { shop: e.shop, category: e.category, prev: [], cur: [] };
      groups.set(key, g);
    }
    (mk === monthKey ? g.cur : g.prev).push(e);
  }

  const todayDay = dayOfMonth(today);
  const threshold = Math.max(1, Math.round(salary * MATERIALITY_OF_SALARY));
  const out: MonthlyCharge[] = [];

  for (const [key, g] of groups) {
    // Exactly one charge last month, and at most one so far this month.
    if (g.prev.length !== 1 || g.cur.length > 1) continue;
    const prevAmount = g.prev[0].amount;
    if (prevAmount < threshold) continue;

    const prevDay = dayOfMonth(g.prev[0].date);
    const paid = g.cur.length === 1;
    const thisAmount = paid ? g.cur[0].amount : null;
    const thisDay = paid ? dayOfMonth(g.cur[0].date) : null;

    // Not yet paid and well past its usual date: treat it as skipped this month
    // rather than pretending a bill is still coming.
    const overdue = !paid && todayDay > prevDay + OVERDUE_GRACE_DAYS;

    // Two ways to qualify. Either the cadence is proven — the shop billed in
    // both months, so it really does arrive monthly — or the charge is big
    // enough that a month without it would be the surprise. Without this
    // second test every one-off purchase would be projected forever.
    const provenCadence = paid;
    const bigEnoughToExpectAgain = prevAmount >= salary * STILL_DUE_MATERIALITY;
    if (!provenCadence && !(bigEnoughToExpectAgain && !overdue)) continue;

    const confirmedRecurring =
      paid &&
      thisAmount !== null &&
      prevAmount > 0 &&
      Math.abs(thisAmount - prevAmount) / prevAmount <= 0.15;

    out.push({
      key,
      shop: g.shop,
      category: g.category,
      prevAmount,
      prevDay,
      thisAmount,
      thisDay,
      expectedMonthly: thisAmount ?? prevAmount,
      paidThisMonth: paid,
      remainingThisMonth: paid || overdue ? 0 : prevAmount,
      confirmedRecurring,
    });
  }

  return out.sort((a, b) => b.expectedMonthly - a.expectedMonthly);
}

/**
 * The forecast. Pure, and cheap enough to run on every frame of a drag.
 *
 * @param adjustments what-if cuts, applied to *future* spending only — money
 *   already spent this month cannot be un-spent, so a cut to Rent barely moves
 *   this month (it is already paid) but moves every month after it.
 */
export function forecast(
  expenses: Expense[],
  salary: Paisa,
  adjustments: CategoryAdjustment[],
  today: ISODate,
): Forecast {
  const monthKey = monthKeyOf(today);
  const prevMonthKey = addMonths(monthKey, -1);
  const daysInMonth = daysInMonthKey(monthKey);
  const daysElapsed = Math.min(dayOfMonth(today), daysInMonth);
  const daysRemaining = daysInMonth - daysElapsed;
  const prevDays = daysInMonthKey(prevMonthKey);

  const cutFor = (category: string) => {
    const a = adjustments.find((x) => x.category === category);
    if (!a || a.cutPercent <= 0) return 0;
    return Math.min(100, a.cutPercent);
  };
  const applyCut = (amount: Paisa, category: string) =>
    Math.round(amount * (1 - cutFor(category) / 100));

  const charges = findMonthlyCharges(expenses, monthKey, prevMonthKey, salary, today);
  const chargeKeys = new Set(charges.map((c) => c.key));

  // Per-category totals, with the fixed part held out of the base that feeds
  // the daily burn rate.
  type Acc = {
    spentThisMonth: Paisa;
    prevMonthTotal: Paisa;
    prevToDate: Paisa;
    variableThis: Paisa;
    variablePrev: Paisa;
    fixedRemaining: Paisa;
    fixedMonthly: Paisa;
  };
  const acc = new Map<string, Acc>();
  const get = (c: string) => {
    let a = acc.get(c);
    if (!a) {
      a = {
        spentThisMonth: 0,
        prevMonthTotal: 0,
        prevToDate: 0,
        variableThis: 0,
        variablePrev: 0,
        fixedRemaining: 0,
        fixedMonthly: 0,
      };
      acc.set(c, a);
    }
    return a;
  };

  for (const e of expenses) {
    const mk = monthKeyOf(e.date);
    if (mk !== monthKey && mk !== prevMonthKey) continue;
    const isFixed = chargeKeys.has(seriesKey(e.shop, e.category));
    const a = get(e.category);
    if (mk === monthKey) {
      a.spentThisMonth += e.amount;
      if (!isFixed) a.variableThis += e.amount;
    } else {
      a.prevMonthTotal += e.amount;
      if (dayOfMonth(e.date) <= daysElapsed) a.prevToDate += e.amount;
      if (!isFixed) a.variablePrev += e.amount;
    }
  }

  for (const c of charges) {
    const a = get(c.category);
    a.fixedRemaining += c.remainingThisMonth;
    a.fixedMonthly += c.expectedMonthly;
  }

  const categories: CategoryProjection[] = [];

  for (const [category, a] of acc) {
    const dailyThis = daysElapsed > 0 ? a.variableThis / daysElapsed : 0;
    const dailyPrev = prevDays > 0 ? a.variablePrev / prevDays : 0;
    const hasThis = a.variableThis > 0;
    const hasPrev = a.variablePrev > 0;

    // Blend the two months, weighting this one by how much of it we have
    // actually seen. On the 3rd, four days of data say very little and last
    // month carries the projection; by the 28th this month has told us almost
    // everything and last month barely matters.
    const w = daysInMonth > 0 ? daysElapsed / daysInMonth : 1;
    const dailyRate =
      hasThis && hasPrev
        ? w * dailyThis + (1 - w) * dailyPrev
        : hasThis
          ? dailyThis
          : dailyPrev;

    const fixedMonthly = a.fixedMonthly;
    const fixedRemaining = applyCut(a.fixedRemaining, category);
    const variableRemaining = applyCut(Math.round(dailyRate * daysRemaining), category);
    const projectedRemaining = fixedRemaining + variableRemaining;

    categories.push({
      category,
      spentThisMonth: a.spentThisMonth,
      prevMonthTotal: a.prevMonthTotal,
      dailyRate,
      fixedRemaining,
      variableRemaining,
      projectedRemaining,
      projectedMonthTotal: a.spentThisMonth + projectedRemaining,
      cutPercent: cutFor(category),
      typicalMonthlyCost: (mk: MonthKey) =>
        applyCut(fixedMonthly + Math.round(dailyRate * daysInMonthKey(mk)), category),
    });
  }

  categories.sort((x, y) => y.projectedMonthTotal - x.projectedMonthTotal);

  const spentSoFar = categories.reduce((s, c) => s + c.spentThisMonth, 0);
  const projectedRemaining = categories.reduce((s, c) => s + c.projectedRemaining, 0);
  const prevMonthTotal = categories.reduce((s, c) => s + c.prevMonthTotal, 0);
  const prevMonthToDate = Array.from(acc.values()).reduce((s, a) => s + a.prevToDate, 0);
  const projectedMonthTotal = spentSoFar + projectedRemaining;

  const typicalMonthSpend = (mk: MonthKey) =>
    categories.reduce((s, c) => s + c.typicalMonthlyCost(mk), 0);

  return {
    today,
    monthKey,
    prevMonthKey,
    daysInMonth,
    daysElapsed,
    daysRemaining,
    salary,
    spentSoFar,
    projectedRemaining,
    projectedMonthTotal,
    endOfMonthPosition: salary - projectedMonthTotal,
    prevMonthTotal,
    prevMonthToDate,
    burnRateSoFar: daysElapsed > 0 ? spentSoFar / daysElapsed : 0,
    categories,
    monthlyCharges: charges,
    recurring: charges.filter((c) => c.confirmedRecurring),
    fixedMonthlyTotal: charges.reduce((s, c) => s + c.expectedMonthly, 0),
    typicalMonthSpend,
    typicalMonthSurplus: (mk: MonthKey) => salary - typicalMonthSpend(mk),
    adjustments,
    isEmpty: expenses.length === 0,
  };
}

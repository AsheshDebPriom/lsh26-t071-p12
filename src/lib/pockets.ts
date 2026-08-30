/**
 * Savings pockets — forward simulation, and the DPS comparison.
 *
 * There is deliberately no `target / monthlyContribution` anywhere in this
 * file. A completion date is produced by running the calendar forward month by
 * month and handing each pocket only the surplus the forecast actually
 * predicts: projected salary, minus projected spending, minus whatever the
 * pockets ahead of it in priority already took.
 *
 * That is the whole reason the what-if slider moves the dates. Cutting a
 * category raises the projected surplus in every future month, more money
 * reaches the pockets each month, and the dates pull in.
 */

import { addMonths, lastDayOf, type ISODate, type MonthKey } from "./dates";
import type { Forecast } from "./forecast";
import { roundHalfUp, type Paisa } from "./money";
import type { Pocket } from "./types";

/** 50 years. Past this a pocket is reported as not reachable, not as a date. */
export const MAX_MONTHS = 600;

export type PocketMonth = {
  monthKey: MonthKey;
  /** Surplus the forecast predicts for this month, before any pocket takes it. */
  monthSurplus: Paisa;
  /** What was still unallocated when this pocket's turn came. */
  availableToThisPocket: Paisa;
  /** What the pocket asked for: its contribution, capped at what it still needs. */
  requested: Paisa;
  /** What it actually got. Less than requested when the month was short. */
  funded: Paisa;
  balanceAfter: Paisa;
};

export type DpsComparison = {
  annualRatePercent: number;
  /** Balance if the same deposits went to a DPS instead, at the pocket's own end date. */
  balanceAtPocketCompletion: Paisa;
  /** How much of that balance is interest rather than deposits. */
  interestAtPocketCompletion: Paisa;
  /** The month a DPS on the same deposits would reach the target. */
  targetReachedMonth: MonthKey | null;
  targetReachedDate: ISODate | null;
  /** Months earlier than the plain pocket. Zero when it makes no difference. */
  monthsEarlier: number | null;
};

export type PocketProjection = {
  pocketId: string;
  reachable: boolean;
  /** The month the running balance first reaches the target. */
  completionMonth: MonthKey | null;
  /** A real date: the last day of that month. */
  completionDate: ISODate | null;
  monthsToComplete: number | null;
  /** Deposits actually made, which is what the DPS comparison is run on. */
  totalDeposited: Paisa;
  /** Funded in the current month — shows the cap biting, when it bites. */
  fundedThisMonth: Paisa;
  requestedThisMonth: Paisa;
  /** First 24 months, for the schedule table. */
  schedule: PocketMonth[];
  /** True when the pocket never gets a full contribution in any simulated month. */
  everStarved: boolean;
  dps: DpsComparison | null;
};

export type PocketSimulation = {
  projections: Map<string, PocketProjection>;
  /** The surplus each simulated month started with. */
  monthSurpluses: { monthKey: MonthKey; surplus: Paisa }[];
  /** Total the pockets ask for each month. */
  totalRequested: Paisa;
  /** Surplus available in the current month, after this month's actual spending. */
  currentMonthSurplus: Paisa;
  /** Surplus in a typical whole month after this one. */
  steadyMonthSurplus: Paisa;
};

/**
 * A DPS at `annualRatePercent`, following the published rule exactly:
 *
 *   Each month: balance = balance + deposit, then
 *   interest = balance x rate / 12 / 100, rounded half up to the paisa,
 *   added to the balance — so later months earn on the interest too.
 *
 * Arithmetic is in integer paisa. `rate` is scaled by 100 so a rate like 8.50
 * stays exact, and the half-up rounding is done on integers rather than by
 * nudging a float.
 */
export function dpsGrow(balance: Paisa, deposit: Paisa, annualRatePercent: number) {
  const withDeposit = balance + deposit;
  const rate100 = Math.round(annualRatePercent * 100); // 8.50% -> 850
  // interest = withDeposit * (rate100 / 100) / 12 / 100 = withDeposit * rate100 / 120000
  const numerator = withDeposit * rate100;
  const denominator = 120000;
  const interest = numerator >= 0
    ? Math.floor((numerator + denominator / 2) / denominator)
    : -Math.floor((-numerator + denominator / 2) / denominator);
  return { balance: withDeposit + interest, interest };
}

/**
 * Run every pocket forward together against the forecast.
 *
 * Pockets are funded in priority order. When a month's surplus cannot cover
 * every contribution, the pockets ahead take theirs first and the ones behind
 * are capped at what is left — which is exactly why their dates slip. When a
 * pocket finishes, the contribution it was taking frees up for the ones behind
 * it, and their dates pull in.
 */
export function simulatePockets(
  pockets: Pocket[],
  fc: Forecast,
  dpsAnnualRatePercent: number,
): PocketSimulation {
  const ordered = [...pockets].sort(
    (a, b) => a.priority - b.priority || a.createdAt - b.createdAt,
  );

  const balances = new Map<string, Paisa>();
  const schedules = new Map<string, PocketMonth[]>();
  const deposits = new Map<string, Paisa[]>();
  const completion = new Map<string, MonthKey>();
  const starved = new Map<string, boolean>();
  const fundedThisMonth = new Map<string, Paisa>();
  const requestedThisMonth = new Map<string, Paisa>();

  for (const p of ordered) {
    balances.set(p.id, 0);
    schedules.set(p.id, []);
    deposits.set(p.id, []);
    starved.set(p.id, false);
    fundedThisMonth.set(p.id, 0);
    requestedThisMonth.set(p.id, 0);
  }

  const monthSurpluses: { monthKey: MonthKey; surplus: Paisa }[] = [];
  const currentMonthSurplus = fc.endOfMonthPosition;
  const steadyMonthSurplus = fc.typicalMonthSurplus(addMonths(fc.monthKey, 1));

  for (let m = 0; m < MAX_MONTHS; m += 1) {
    const monthKey = addMonths(fc.monthKey, m);

    // Month 0 is the month in progress: what is actually left after the
    // spending already booked plus the spending still forecast for it.
    // Every month after that is a whole month at the forecast's own rate.
    const surplus = m === 0 ? currentMonthSurplus : fc.typicalMonthSurplus(monthKey);
    if (m < 36) monthSurpluses.push({ monthKey, surplus });

    let available = Math.max(0, surplus);
    let allDone = true;

    for (const p of ordered) {
      const balance = balances.get(p.id)!;
      if (balance >= p.target) continue;
      allDone = false;

      const need = p.target - balance;
      const requested = Math.min(p.monthlyContribution, need);
      const funded = Math.min(requested, available);

      available -= funded;
      const nextBalance = balance + funded;
      balances.set(p.id, nextBalance);
      deposits.get(p.id)!.push(funded);

      if (funded < requested) starved.set(p.id, true);
      if (m === 0) {
        fundedThisMonth.set(p.id, funded);
        requestedThisMonth.set(p.id, requested);
      }

      const sched = schedules.get(p.id)!;
      if (sched.length < 24) {
        sched.push({
          monthKey,
          monthSurplus: surplus,
          availableToThisPocket: Math.max(0, available + funded),
          requested,
          funded,
          balanceAfter: nextBalance,
        });
      }

      if (nextBalance >= p.target && !completion.has(p.id)) {
        completion.set(p.id, monthKey);
      }
    }

    if (allDone) break;
  }

  const projections = new Map<string, PocketProjection>();

  for (const p of ordered) {
    const completionMonth = completion.get(p.id) ?? null;
    const dep = deposits.get(p.id)!;
    const totalDeposited = dep.reduce((s, d) => s + d, 0);

    projections.set(p.id, {
      pocketId: p.id,
      reachable: completionMonth !== null,
      completionMonth,
      completionDate: completionMonth ? lastDayOf(completionMonth) : null,
      monthsToComplete: completionMonth ? dep.length : null,
      totalDeposited,
      fundedThisMonth: fundedThisMonth.get(p.id)!,
      requestedThisMonth: requestedThisMonth.get(p.id)!,
      schedule: schedules.get(p.id)!,
      everStarved: starved.get(p.id)!,
      dps: buildDps(p, dep, completionMonth, fc.monthKey, dpsAnnualRatePercent),
    });
  }

  return {
    projections,
    monthSurpluses,
    totalRequested: ordered.reduce((s, p) => s + p.monthlyContribution, 0),
    currentMonthSurplus,
    steadyMonthSurplus,
  };
}

/**
 * What the same money would have done in a DPS.
 *
 * The deposits compared are the ones the simulation actually funds, not the
 * contributions the user asked for — otherwise the comparison would be against
 * money this person does not have.
 */
function buildDps(
  pocket: Pocket,
  fundedDeposits: Paisa[],
  completionMonth: MonthKey | null,
  startMonth: MonthKey,
  annualRatePercent: number,
): DpsComparison | null {
  if (fundedDeposits.length === 0 || fundedDeposits.every((d) => d === 0)) return null;

  let balance = 0;
  let interestTotal = 0;
  let reachedIndex: number | null = null;

  for (let i = 0; i < fundedDeposits.length; i += 1) {
    const step = dpsGrow(balance, fundedDeposits[i], annualRatePercent);
    balance = step.balance;
    interestTotal += step.interest;
    if (reachedIndex === null && balance >= pocket.target) reachedIndex = i;
  }

  const targetReachedMonth = reachedIndex !== null ? addMonths(startMonth, reachedIndex) : null;
  const pocketMonths = completionMonth !== null ? fundedDeposits.length : null;

  return {
    annualRatePercent,
    balanceAtPocketCompletion: balance,
    interestAtPocketCompletion: interestTotal,
    targetReachedMonth,
    targetReachedDate: targetReachedMonth ? lastDayOf(targetReachedMonth) : null,
    monthsEarlier:
      reachedIndex !== null && pocketMonths !== null ? pocketMonths - (reachedIndex + 1) : null,
  };
}

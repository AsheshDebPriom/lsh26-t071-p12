/**
 * Sanity harness. Not shipped to the browser.
 *
 * Runs the forecast, the pocket simulation and the DPS arithmetic over every
 * published case so the numbers can be checked against the fixture by hand.
 *
 *   npm run check          all 25 cases, one line each
 *   npm run check PUB-01   one case in full
 */
import { readFileSync } from "node:fs";
import { forecast } from "../src/lib/forecast";
import { dpsGrow, simulatePockets } from "../src/lib/pockets";
import { buildInsights } from "../src/lib/insights";
import { formatTaka, toPaisa } from "../src/lib/money";
import { addMonths, formatDate, monthLabel } from "../src/lib/dates";
import type { Expense, Pocket, PublishedCase } from "../src/lib/types";

const fixture = JSON.parse(
  readFileSync("public/sample-data/P12_personal_ledger_public.json", "utf8"),
) as { cases: PublishedCase[] };

const only = process.argv[2];
const cases = only ? fixture.cases.filter((c) => c.case_id === only) : fixture.cases;

function toState(c: PublishedCase) {
  const expenses: Expense[] = c.expenses.map((e) => ({
    id: e.id,
    date: e.date,
    category: e.category,
    shop: e.shop,
    amount: toPaisa(e.amount_bdt),
  }));
  const pockets: Pocket[] = c.pockets.map((p, i) => ({
    id: p.id,
    name: p.name,
    item: p.item,
    target: toPaisa(p.target_bdt),
    monthlyContribution: toPaisa(p.monthly_contribution_bdt),
    priority: i,
    createdAt: i,
  }));
  return { expenses, pockets, salary: toPaisa(c.salary_bdt), rate: Number(c.dps_annual_rate_percent) };
}

let failures = 0;
let diverged = 0;
let matched = 0;
let unreachable = 0;
const ratios: { id: string; ratio: number; steady: number; prev: number }[] = [];
function expect(label: string, cond: boolean, detail = "") {
  if (!cond) {
    failures += 1;
    console.log(`   !! ${label} ${detail}`);
  }
}

for (const c of cases) {
  const { expenses, pockets, salary, rate } = toState(c);
  const fc = forecast(expenses, salary, [], c.today);
  const sim = simulatePockets(pockets, fc, rate);

  const line =
    `${c.case_id}  ${c.today}  salary ${formatTaka(salary).padStart(9)}` +
    `  spent ${formatTaka(fc.spentSoFar).padStart(9)}` +
    `  +rest ${formatTaka(fc.projectedRemaining).padStart(9)}` +
    `  = ${formatTaka(fc.projectedMonthTotal).padStart(9)}` +
    `  end ${formatTaka(fc.endOfMonthPosition).padStart(10)}` +
    `  last ${formatTaka(fc.prevMonthTotal).padStart(9)}`;
  console.log(line);

  // Model quality: a projected whole month should land in a believable band
  // around last month's actual. Too high means one-off purchases are being
  // projected forever; too low means the month is being under-forecast.
  const steady = fc.typicalMonthSpend(addMonths(fc.monthKey, 1));
  const ratio = steady / fc.prevMonthTotal;
  ratios.push({ id: c.case_id, ratio, steady, prev: fc.prevMonthTotal });
  expect(`${c.case_id}: projected month is within 0.75-1.30x of last month's actual`,
    ratio >= 0.75 && ratio <= 1.3, `ratio ${ratio.toFixed(2)} (${formatTaka(steady)} vs ${formatTaka(fc.prevMonthTotal)})`);

  // Invariants that must hold on every case.
  expect("projected total is not below what is already spent", fc.projectedMonthTotal >= fc.spentSoFar);
  expect("category projections sum to the month total",
    Math.abs(fc.categories.reduce((s, x) => s + x.projectedMonthTotal, 0) - fc.projectedMonthTotal) <= 1);
  expect("end-of-month position is salary minus projected",
    fc.endOfMonthPosition === salary - fc.projectedMonthTotal);
  // Rent must never be extrapolated: it is a monthly charge, paid once.
  const rent = fc.categories.find((x) => x.category === "Rent");
  if (rent) {
    expect("rent is not extrapolated beyond one month",
      rent.projectedMonthTotal <= rent.prevMonthTotal * 1.35,
      `projected ${formatTaka(rent.projectedMonthTotal)} vs last month ${formatTaka(rent.prevMonthTotal)}`);
  }

  for (const p of pockets) {
    const proj = sim.projections.get(p.id)!;
    // The constraint, stated as a test: the date must not be the one that
    // target / contribution would give, unless the surplus genuinely allows it.
    const naiveMonths = Math.ceil(p.target / p.monthlyContribution);
    if (proj.reachable) {
      // The simulation can never beat naive division: it is the same
      // contribution capped by the surplus, so it is equal at best.
      expect(`${c.case_id}/${p.name}: simulation never beats target/contribution`,
        proj.monthsToComplete! >= naiveMonths,
        `sim ${proj.monthsToComplete} vs naive ${naiveMonths}`);
      if (proj.monthsToComplete! > naiveMonths) diverged += 1;
      else matched += 1;
    }
    if (!proj.reachable) unreachable += 1;
    if (proj.reachable && proj.dps) {
      expect(`${c.case_id}/${p.name}: DPS beats or matches plain saving`,
        proj.dps.balanceAtPocketCompletion >= proj.totalDeposited);
    }
  }

  if (only) {
    console.log("\n  Forecast");
    console.log(`    month ${monthLabel(fc.monthKey)}  day ${fc.daysElapsed}/${fc.daysInMonth}, ${fc.daysRemaining} left`);
    console.log(`    last month to the same day: ${formatTaka(fc.prevMonthToDate)}`);
    console.log(`    fixed monthly charges: ${formatTaka(fc.fixedMonthlyTotal)}`);
    console.log("\n  Categories");
    for (const cat of fc.categories) {
      console.log(
        `    ${cat.category.padEnd(14)} spent ${formatTaka(cat.spentThisMonth).padStart(9)}` +
        ` + rest ${formatTaka(cat.projectedRemaining).padStart(9)}` +
        ` = ${formatTaka(cat.projectedMonthTotal).padStart(9)}` +
        `  (last month ${formatTaka(cat.prevMonthTotal).padStart(9)}, ${(cat.dailyRate / 100).toFixed(0)}/day)`,
      );
    }
    console.log("\n  Monthly charges detected");
    for (const m of fc.monthlyCharges) {
      console.log(
        `    ${m.shop.padEnd(20)} ${m.category.padEnd(14)} expect ${formatTaka(m.expectedMonthly).padStart(9)}` +
        `  paid this month: ${m.paidThisMonth ? "yes" : "no "}  still due ${formatTaka(m.remainingThisMonth).padStart(8)}` +
        `  ${m.confirmedRecurring ? "[recurring]" : ""}`,
      );
    }
    console.log("\n  Insights");
    for (const i of buildInsights(fc, sim, pockets)) {
      console.log(`    · ${i.text}`);
    }
    console.log("\n  Pockets");
    console.log(`    surplus this month ${formatTaka(sim.currentMonthSurplus)}, steady month ${formatTaka(sim.steadyMonthSurplus)}, pockets ask ${formatTaka(sim.totalRequested)}`);
    for (const p of pockets) {
      const pr = sim.projections.get(p.id)!;
      const naive = Math.ceil(p.target / p.monthlyContribution);
      console.log(
        `    ${p.name.padEnd(10)} target ${formatTaka(p.target).padStart(10)} @ ${formatTaka(p.monthlyContribution).padStart(8)}/mo`,
      );
      if (pr.reachable) {
        console.log(
          `      forecast date ${formatDate(pr.completionDate!, "long")} (${pr.monthsToComplete} months)` +
          `   naive target/contribution would say ${naive} months`,
        );
        console.log(
          `      funded this month ${formatTaka(pr.fundedThisMonth)} of ${formatTaka(pr.requestedThisMonth)} requested`,
        );
        if (pr.dps) {
          console.log(
            `      DPS @ ${pr.dps.annualRatePercent.toFixed(2)}%: balance ${formatTaka(pr.dps.balanceAtPocketCompletion, 2)}` +
            ` (interest ${formatTaka(pr.dps.interestAtPocketCompletion, 2)}), hits target ${pr.dps.targetReachedMonth ?? "never"}` +
            ` — ${pr.dps.monthsEarlier} months earlier`,
          );
        }
      } else {
        console.log(`      not reachable at current spending`);
      }
    }
  }
}

// The published DPS worked example, checked by hand:
// 1000.00 deposit at 8.00% -> interest = 1000 * 8 / 12 / 100 = 6.6667 -> 6.67
{
  const step = dpsGrow(0, toPaisa("1000.00"), 8);
  expect("DPS first month at 8% on 1000 gives 6.67 interest", step.interest === 667, `got ${step.interest}`);
  expect("DPS balance after one month is 1006.67", step.balance === 100667, `got ${step.balance}`);
  // Second month: 1006.67 + 1000 = 2006.67, interest = 13.3778 -> 13.38
  const step2 = dpsGrow(step.balance, toPaisa("1000.00"), 8);
  expect("DPS second month interest is 13.38", step2.interest === 1338, `got ${step2.interest}`);
  // Half-up must round up, not to even: 100 paisa at 12% -> 1.00 exactly... use a
  // case that lands on .5 — balance 20000 paisa at 9%: 20000*900/120000 = 150 exact.
  const exact = dpsGrow(0, 20000, 9);
  expect("exact division needs no rounding", exact.interest === 150, `got ${exact.interest}`);
  // 12500 paisa at 9.6%: 12500*960/120000 = 100 exact. Use 12501 -> 100.008 -> 100
  const down = dpsGrow(0, 12501, 9.6);
  expect("rounds down below the half", down.interest === 100, `got ${down.interest}`);
  // Land exactly on .5: balance b with b*rate100/120000 = n + 0.5
  // rate100=1200 (12%): b*1200/120000 = b/100. b=1050 -> 10.5 -> half up -> 11
  const half = dpsGrow(0, 1050, 12);
  expect("rounds half up, not half to even", half.interest === 11, `got ${half.interest}`);
}



/* ------------------------------------------------------------------ */
/* The four published constraints, exercised rather than asserted.     */
/* ------------------------------------------------------------------ */

{
  const c = fixture.cases[0];
  const { expenses, pockets, salary, rate } = toState(c);

  // C2 — the insights must change when the numbers change.
  const before = buildInsights(
    forecast(expenses, salary, [], c.today),
    simulatePockets(pockets, forecast(expenses, salary, [], c.today), rate),
    pockets,
    expenses,
  );
  const editedExpenses = expenses.map((e) =>
    e.id === "E028" ? { ...e, amount: e.amount + toPaisa("9000.00") } : e,
  );
  const fcAfter = forecast(editedExpenses, salary, [], c.today);
  const after = buildInsights(fcAfter, simulatePockets(pockets, fcAfter, rate), pockets, editedExpenses);

  const changed = before.filter((b) => {
    const match = after.find((a) => a.id === b.id);
    return !match || match.text !== b.text;
  });
  expect(
    "C2: editing one expense rewrites the insights",
    changed.length >= 3,
    `only ${changed.length} of ${before.length} changed`,
  );
  console.log(
    `\nC2  editing one expense by ৳9,000 rewrote ${changed.length} of ${before.length} insights.`,
  );

  // C3 — pocket dates come from the forecast, so a what-if cut must move them.
  const fcPlain = forecast(expenses, salary, [], c.today);
  const simPlain = simulatePockets(pockets, fcPlain, rate);
  const fcCut = forecast(
    expenses,
    salary,
    [
      { category: "Groceries", cutPercent: 50 },
      { category: "Entertainment", cutPercent: 50 },
      { category: "Education", cutPercent: 50 },
    ],
    c.today,
  );
  const simCut = simulatePockets(pockets, fcCut, rate);

  let moved = 0;
  for (const p of pockets) {
    const a = simPlain.projections.get(p.id)!;
    const b = simCut.projections.get(p.id)!;
    if (a.completionMonth !== b.completionMonth) moved += 1;
    // A cut can only ever help, never push a date out.
    if (a.reachable && b.reachable) {
      expect(
        `C3: cutting spending never delays ${p.name}`,
        b.monthsToComplete! <= a.monthsToComplete!,
        `${a.monthsToComplete} -> ${b.monthsToComplete}`,
      );
    }
  }
  expect("C3: a what-if cut moves pocket completion dates", moved > 0);
  console.log(
    `C3  cutting three categories by 50% moved ${moved} of ${pockets.length} pocket dates` +
      ` (surplus ${formatTaka(simPlain.steadyMonthSurplus)} -> ${formatTaka(simCut.steadyMonthSurplus)}).`,
  );

  // Degenerate inputs must not throw or produce nonsense.
  const emptyFc = forecast([], 0, [], c.today);
  expect("empty ledger forecasts zero", emptyFc.projectedMonthTotal === 0 && emptyFc.isEmpty);
  const noSalaryFc = forecast(expenses, 0, [], c.today);
  expect("no salary still forecasts spending", noSalaryFc.projectedMonthTotal > 0);
  expect("no salary reports the whole month as short", noSalaryFc.endOfMonthPosition < 0);
  const noSalarySim = simulatePockets(pockets, noSalaryFc, rate);
  expect(
    "no salary makes every pocket unreachable",
    pockets.every((p) => !noSalarySim.projections.get(p.id)!.reachable),
  );
  expect("no pockets simulates cleanly", simulatePockets([], emptyFc, rate).projections.size === 0);
  const firstOfMonth = forecast(expenses, salary, [], `${c.months.this}-01`);
  expect("day one of the month still forecasts", firstOfMonth.projectedMonthTotal > 0);
  const lastOfMonth = forecast(expenses, salary, [], `${c.months.this}-30`);
  expect("the last day of the month leaves nothing to forecast", lastOfMonth.daysRemaining === 0);
}

const rs = ratios.map((r) => r.ratio).sort((a, b) => a - b);
console.log(
  `\nProjected whole month vs last month's actual:` +
    ` min ${rs[0].toFixed(2)}x, median ${rs[Math.floor(rs.length / 2)].toFixed(2)}x, max ${rs[rs.length - 1].toFixed(2)}x`,
);
console.log(
  `Pockets: ${diverged} completion dates later than target/contribution,` +
    ` ${matched} the same, ${unreachable} not reachable at current spending.`,
);
expect("the forecast moves at least some dates away from target/contribution", diverged > 0);

console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} problem(s)`}`);
process.exit(failures === 0 ? 0 : 1);

"use client";

/**
 * Goal seek — the what-if slider run backwards.
 *
 * Pick a pocket and a deadline; the app works out what would have to be true.
 * Every plan on screen was verified by running the real forecast and the real
 * pocket simulation with that plan applied, so "Try it" reproduces exactly the
 * date shown.
 *
 * The search costs 40–150ms, so it runs when a pocket or a deadline is chosen
 * and never on render. The work is handed to a timeout first so the panel can
 * paint its working state rather than freezing mid-click.
 */

import { useState } from "react";

import { formatDate, monthLabel } from "@/lib/dates";
import { deadlineOptions, goalSeek, type GoalSeekResult, type Plan } from "@/lib/goalSeek";
import { useLedger } from "@/store/useLedger";

import { Button, Card, Taka, cn } from "./ui";

export function GoalSeek({ onApplied }: { onApplied?: () => void }) {
  const expenses = useLedger((s) => s.expenses);
  const salary = useLedger((s) => s.salary);
  const pockets = useLedger((s) => s.pockets);
  const today = useLedger((s) => s.settings.today);
  const dpsRate = useLedger((s) => s.settings.dpsAnnualRatePercent);
  const setAdjustment = useLedger((s) => s.setAdjustment);
  const clearAdjustments = useLedger((s) => s.clearAdjustments);
  const updatePocket = useLedger((s) => s.updatePocket);

  const ordered = [...pockets].sort((a, b) => a.priority - b.priority);
  const [pocketId, setPocketId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [result, setResult] = useState<GoalSeekResult | null>(null);
  const [busy, setBusy] = useState(false);

  if (ordered.length === 0) return null;

  const selected = ordered.find((p) => p.id === pocketId) ?? ordered[0];
  const options = deadlineOptions(today);

  function run(pid: string, dl: string) {
    setPocketId(pid);
    setDeadline(dl);
    setBusy(true);
    setResult(null);
    // Yield once so the working state paints before the search blocks.
    setTimeout(() => {
      setResult(goalSeek({ expenses, salary, today, pockets, pocketId: pid, dpsRate }, dl));
      setBusy(false);
    }, 0);
  }

  /**
   * The funding order is real data and changes for good; the cuts are the same
   * ephemeral what-if the slider uses and reset with it. The button says so.
   */
  function apply(plan: Plan) {
    if (plan.moveToFront) {
      updatePocket(selected.id, { priority: 0 });
      ordered
        .filter((p) => p.id !== selected.id)
        .forEach((p, i) => updatePocket(p.id, { priority: i + 1 }));
    }
    clearAdjustments();
    for (const c of plan.cuts) setAdjustment(c.category, c.cutPercent);
    onApplied?.();
  }

  return (
    <Card className="overflow-hidden border-ink/15 shadow-lift-2">
      <div className="px-5 pb-4 pt-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">
          Want it sooner? Name the date.
        </h2>
        <p className="mt-1 text-[12.5px] leading-snug text-ink-3">
          The slider asks what a cut does to a date. This asks the opposite — pick a
          deadline and the app works backwards to what would have to be true.
        </p>
      </div>

      <div className="space-y-3 border-t border-rule px-5 py-4">
        <div>
          <p className="eyebrow">Which pocket</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ordered.map((p) => (
              <Chip
                key={p.id}
                on={p.id === selected.id}
                onClick={() => (deadline ? run(p.id, deadline) : setPocketId(p.id))}
              >
                {p.name}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="eyebrow">By when</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {options.map((o) => (
              <Chip key={o.key} on={o.key === deadline} onClick={() => run(selected.id, o.key)}>
                {o.months < 12
                  ? `${o.months} months`
                  : `${o.months / 12} year${o.months === 12 ? "" : "s"}`}
                <span className="ml-1 opacity-60">{monthLabel(o.key, "short")}</span>
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {busy ? (
        <p className="border-t border-rule px-5 py-4 text-[12.5px] text-ink-3" aria-live="polite">
          Searching every combination…
        </p>
      ) : null}

      {result && !busy ? (
        <Answer result={result} pocketName={selected.name} deadline={deadline!} onApply={apply} />
      ) : null}

      {!result && !busy ? (
        <p className="border-t border-rule px-5 py-4 text-[12.5px] text-ink-3">
          Choose a deadline to see what it would take.
        </p>
      ) : null}
    </Card>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
        on
          ? "border-ink bg-ink text-white"
          : "border-rule-strong bg-surface text-ink-2 hover:bg-sunk",
      )}
    >
      {children}
    </button>
  );
}

function Answer({
  result,
  pocketName,
  deadline,
  onApply,
}: {
  result: GoalSeekResult;
  pocketName: string;
  deadline: string;
  onApply: (p: Plan) => void;
}) {
  if (result.kind === "already") {
    return (
      <div className="border-t border-rule bg-in-soft/50 px-5 py-4">
        <p className="text-[13.5px] leading-snug text-ink">
          Nothing has to change — {pocketName} already lands on{" "}
          <span className="font-semibold">{formatDate(result.currentDate, "long")}</span>,
          inside your deadline.
        </p>
      </div>
    );
  }

  if (result.kind === "impossible" || result.kind === "no-pocket") {
    return (
      <div className="border-t border-rule bg-out-soft/50 px-5 py-4">
        <p className="text-[13.5px] leading-snug text-ink">
          {monthLabel(deadline)} is out of reach for {pocketName} — even funding it first and
          cutting every category to nothing does not get there.
        </p>
        <p className="mt-1.5 text-[12px] leading-snug text-ink-2">
          The honest options are a later date, a smaller target, or more income. The app will
          not invent a plan that does not exist.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-rule">
      <p className="px-5 pt-3.5 text-[12.5px] leading-snug text-ink-2">
        To have <span className="font-medium text-ink">{pocketName}</span> by{" "}
        <span className="font-medium text-ink">{monthLabel(deadline)}</span>, any one of
        these works
        {result.currentDate ? (
          <>
            {" "}
            — today it lands {formatDate(result.currentDate, "long")}
          </>
        ) : null}
        :
      </p>

      <ul className="px-5 pb-4 pt-2">
        {result.plans.map((plan, i) => (
          <li
            key={i}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3 last:border-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] leading-snug text-ink">
                {plan.moveToFront ? (
                  <span className="font-medium">Fund {pocketName} first</span>
                ) : null}
                {plan.moveToFront && plan.cuts.length > 0 ? ", and " : null}
                {plan.cuts.map((c, k) => (
                  <span key={c.category}>
                    {k > 0 ? " and " : ""}
                    cut <span className="font-medium">{c.category}</span> by{" "}
                    <span className="tnum font-semibold">{c.cutPercent}%</span>
                  </span>
                ))}
                {!plan.moveToFront && plan.cuts.length === 0 ? "No change needed" : null}
              </p>
              <p className="mt-1 text-[11.5px] text-ink-3">
                {plan.freedPerMonth > 0 ? (
                  <>
                    frees <Taka value={plan.freedPerMonth} /> a month
                  </>
                ) : (
                  "costs nothing — it is only the order they are funded in"
                )}{" "}
                · lands {formatDate(plan.achievedDate, "long")}
              </p>
            </div>
            <Button size="sm" variant={i === 0 ? "primary" : "secondary"} onClick={() => onApply(plan)}>
              Try it
            </Button>
          </li>
        ))}
      </ul>

      <p className="border-t border-rule px-5 py-2.5 text-[11.5px] leading-snug text-ink-3">
        Every plan was checked by running the real forecast and simulation with it applied —
        the dates above are what you will actually see. &ldquo;Try it&rdquo; changes the
        funding order for good and applies the cut as a what-if you can reset.
      </p>
    </div>
  );
}

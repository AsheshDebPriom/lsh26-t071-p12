"use client";

/**
 * Requirement 4 — savings pockets.
 *
 * Each pocket carries a name, a target, the item it is for and a monthly
 * contribution. Its completion date comes from the forward simulation in
 * lib/pockets, never from target divided by contribution — and each card shows
 * both numbers side by side so the difference is visible rather than claimed.
 *
 * Beside it sits what the same deposits would have done in a DPS, with the
 * rate and the compounding basis printed next to the figure.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

import { formatDate, monthLabel } from "@/lib/dates";
import type { Forecast } from "@/lib/forecast";
import { fromPaisa, toPaisa } from "@/lib/money";
import type { PocketProjection, PocketSimulation } from "@/lib/pockets";
import { pocketSentence } from "@/lib/insights";
import { useLedger } from "@/store/useLedger";
import type { Pocket } from "@/lib/types";

import { Sheet } from "./Sheet";
import { WhatIfControl } from "./WhatIfControl";
import {
  AnimatedTaka,
  Button,
  Card,
  CardHead,
  EmptyState,
  Input,
  Label,
  Pill,
  Taka,
  cn,
} from "./ui";

export function PocketsTab({
  fc,
  sim,
  baseline,
}: {
  fc: Forecast;
  sim: PocketSimulation;
  baseline: PocketSimulation;
}) {
  const pockets = useLedger((s) => s.pockets);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Pocket | null>(null);

  const ordered = [...pockets].sort((a, b) => a.priority - b.priority);

  return (
    <>
      <SurplusCard fc={fc} sim={sim} count={pockets.length} />

      {pockets.length > 0 ? (
        <WhatIfControl fc={fc} sim={sim} pockets={pockets} baseline={baseline} />
      ) : null}

      {ordered.length === 0 ? (
        <Card>
          <EmptyState
            title="No pockets yet"
            body="A pocket is one specific thing you are saving for — a laptop, a deposit, a wedding. Give it a target and a monthly contribution and the forecast will put a date on it."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                Create a pocket
              </Button>
            }
          />
        </Card>
      ) : (
        ordered.map((p, i) => (
          <PocketCard
            key={p.id}
            pocket={p}
            index={i}
            total={ordered.length}
            projection={sim.projections.get(p.id)!}
            sim={sim}
            fc={fc}
            onEdit={() => setEditing(p)}
          />
        ))
      )}

      {ordered.length > 0 ? (
        <Button variant="secondary" className="w-full" onClick={() => setCreating(true)}>
          Add another pocket
        </Button>
      ) : null}

      <PocketSheet
        open={creating}
        onClose={() => setCreating(false)}
        title="New pocket"
      />
      <PocketSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit pocket"
        pocket={editing ?? undefined}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

function SurplusCard({
  fc,
  sim,
  count,
}: {
  fc: Forecast;
  sim: PocketSimulation;
  count: number;
}) {
  const covered = sim.steadyMonthSurplus >= sim.totalRequested;
  return (
    <Card>
      <CardHead
        title="What there is to save with"
        hint="Every date below is built from this, month by month."
      />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-rule px-4 py-3 sm:grid-cols-3">
        <div>
          <p className="text-[11px] leading-tight text-ink-3">
            Left in {monthLabel(fc.monthKey, "short")}
          </p>
          <p
            className={cn(
              "mt-0.5 text-[17px] font-semibold tracking-tight",
              sim.currentMonthSurplus < 0 ? "text-out" : "text-in",
            )}
          >
            <AnimatedTaka value={sim.currentMonthSurplus} signed />
          </p>
        </div>
        <div>
          <p className="text-[11px] leading-tight text-ink-3">A typical month after</p>
          <p
            className={cn(
              "mt-0.5 text-[17px] font-semibold tracking-tight",
              sim.steadyMonthSurplus < 0 ? "text-out" : "text-in",
            )}
          >
            <AnimatedTaka value={sim.steadyMonthSurplus} signed />
          </p>
        </div>
        <div>
          <p className="text-[11px] leading-tight text-ink-3">
            {count} pocket{count === 1 ? "" : "s"} ask for
          </p>
          <p className="mt-0.5 text-[17px] font-semibold tracking-tight text-ink">
            <Taka value={sim.totalRequested} />
          </p>
        </div>
      </div>
      <p className="border-t border-rule px-4 py-2.5 text-[12px] leading-relaxed text-ink-2">
        {count === 0
          ? "Create a pocket and its date will be simulated against this surplus."
          : covered
            ? "The forecast covers every contribution in full, so each pocket receives what you set aside for it each month."
            : "The forecast does not cover every contribution, so each month the pockets are funded in order and the ones lower down are capped at what is left. That is why their dates sit further out than the contribution alone would suggest."}
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function PocketCard({
  pocket,
  index,
  total,
  projection,
  sim,
  fc,
  onEdit,
}: {
  pocket: Pocket;
  index: number;
  total: number;
  projection: PocketProjection;
  sim: PocketSimulation;
  fc: Forecast;
  onEdit: () => void;
}) {
  const movePocket = useLedger((s) => s.movePocket);
  const updatePocket = useLedger((s) => s.updatePocket);
  const [showSchedule, setShowSchedule] = useState(false);

  // Shown only as the contrast to the simulated date. Never used as the answer.
  const naiveMonths = Math.ceil(pocket.target / pocket.monthlyContribution);
  const shortfall = projection.requestedThisMonth - projection.fundedThisMonth;

  return (
    <Card>
      <CardHead
        title={pocket.name}
        hint={pocket.item}
        right={
          <div className="flex items-center gap-1">
            <Pill>#{index + 1} funded</Pill>
            <button
              aria-label={`Move ${pocket.name} up the funding order`}
              disabled={index === 0}
              onClick={() => movePocket(pocket.id, -1)}
              className="h-6 w-6 rounded border border-rule text-[11px] text-ink-2 disabled:opacity-30 hover:bg-sunk"
            >
              ↑
            </button>
            <button
              aria-label={`Move ${pocket.name} down the funding order`}
              disabled={index === total - 1}
              onClick={() => movePocket(pocket.id, 1)}
              className="h-6 w-6 rounded border border-rule text-[11px] text-ink-2 disabled:opacity-30 hover:bg-sunk"
            >
              ↓
            </button>
          </div>
        }
      />

      {/* The headline: the date, or the honest absence of one. */}
      <div className="border-t border-rule px-4 py-3">
        {projection.reachable ? (
          <>
            <p className="text-[11px] leading-tight text-ink-3">Expected completion</p>
            <p className="mt-0.5 text-[26px] font-semibold leading-tight tracking-tight text-ink">
              <MovingDate iso={projection.completionDate!} />
            </p>
            <p className="mt-1 text-[12.5px] text-ink-2">
              <span className="tnum font-medium text-ink">{projection.monthsToComplete}</span>{" "}
              months of simulated saving ·{" "}
              <span className="tnum">
                target ÷ contribution would say {naiveMonths}
              </span>
              {projection.monthsToComplete! > naiveMonths ? (
                <span className="text-out"> — {projection.monthsToComplete! - naiveMonths} months later</span>
              ) : null}
            </p>
          </>
        ) : (
          <>
            <p className="text-[11px] leading-tight text-ink-3">Expected completion</p>
            <p className="mt-0.5 text-[20px] font-semibold leading-tight tracking-tight text-out">
              Not reachable at current spending
            </p>
            <p className="mt-1 text-[12.5px] leading-snug text-ink-2">
              A typical month leaves{" "}
              <Taka value={sim.steadyMonthSurplus} signed className="font-medium" />, so this
              pocket never reaches <Taka value={pocket.target} />. Cutting a category or
              lowering a contribution above it in the order will give it a date.
            </p>
          </>
        )}
      </div>

      {/* Progress toward the target this month. */}
      <div className="border-t border-rule px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] text-ink-3">Target</span>
          <Taka value={pocket.target} className="text-[14px] font-semibold text-ink" />
        </div>
        {/* Dragging this re-runs the whole simulation on every change event, so
            the date above moves as the thumb moves. */}
        <div className="mt-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={`contrib-${pocket.id}`} className="text-[12px] text-ink-3">
              Set aside each month
            </label>
            <span className="text-[13px] text-ink">
              <AnimatedTaka value={pocket.monthlyContribution} className="font-medium" />
            </span>
          </div>
          <input
            id={`contrib-${pocket.id}`}
            type="range"
            min={500}
            max={contributionSliderMax(pocket)}
            step={500}
            value={Math.round(pocket.monthlyContribution / 100)}
            aria-valuetext={`${Math.round(pocket.monthlyContribution / 100)} taka a month`}
            className="mt-1"
            onChange={(e) =>
              updatePocket(pocket.id, { monthlyContribution: Number(e.target.value) * 100 })
            }
          />
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="text-[12px] text-ink-3">
            Funded in {monthLabel(fc.monthKey, "short")}
          </span>
          <span className="text-[13px]">
            <AnimatedTaka
              value={projection.fundedThisMonth}
              className={cn("font-medium", shortfall > 0 ? "text-out" : "text-in")}
            />
            {shortfall > 0 ? (
              <span className="text-[12px] text-ink-3">
                {" "}
                of <Taka value={projection.requestedThisMonth} />
              </span>
            ) : null}
          </span>
        </div>

        <p className="mt-2.5 rounded-lg bg-sunk px-3 py-2 text-[12px] leading-relaxed text-ink-2">
          {pocketSentence(pocket, sim, fc.monthKey)}
        </p>
      </div>

      <DpsPanel projection={projection} pocket={pocket} />

      <div className="flex items-center gap-2 border-t border-rule px-4 py-2.5">
        <Button size="sm" variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        {projection.schedule.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSchedule((v) => !v)}
            aria-expanded={showSchedule}
          >
            {showSchedule ? "Hide the month-by-month" : "Show the month-by-month"}
          </Button>
        ) : null}
      </div>

      {showSchedule ? <Schedule projection={projection} /> : null}
    </Card>
  );
}

/**
 * The date travels rather than snapping, so that when the what-if slider moves
 * it the causality is felt rather than inferred. A later date rises from below,
 * an earlier one drops from above, so the direction of the change is legible
 * before the text has even been read.
 */
function MovingDate({ iso }: { iso: string }) {
  const reduced = useReducedMotion();
  // Adjust state during render — the documented way to react to a changed
  // prop without an effect and without reading a ref mid-render.
  const [seen, setSeen] = useState(iso);
  const [later, setLater] = useState(true);
  if (seen !== iso) {
    setLater(iso > seen);
    setSeen(iso);
  }

  return (
    <span className="relative inline-block overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={iso}
          className="tnum inline-block"
          initial={reduced ? { opacity: 0 } : { y: later ? "0.7em" : "-0.7em", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { y: later ? "-0.7em" : "0.7em", opacity: 0, position: "absolute" }}
          transition={{ duration: reduced ? 0 : 0.28, ease: [0.22, 0.9, 0.3, 1] }}
        >
          {formatDate(iso, "long")}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------------------------------------------ */

function DpsPanel({
  projection,
  pocket,
}: {
  projection: PocketProjection;
  pocket: Pocket;
}) {
  const dps = projection.dps;
  if (!dps) {
    return (
      <div className="border-t border-rule px-4 py-3">
        <p className="text-[12px] leading-relaxed text-ink-3">
          No money reaches this pocket in the simulation, so there is nothing to compare a
          DPS against.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-rule bg-in-soft/40 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3">
            The same deposits in a DPS
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-2">
            {dps.annualRatePercent.toFixed(2)}% a year, compounded monthly. The deposit goes
            in first, then interest of balance × {dps.annualRatePercent.toFixed(2)} ÷ 12 ÷ 100
            is rounded half up to the paisa and added, so later months earn on it too.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
        <div>
          <p className="text-[11px] leading-tight text-ink-3">
            {projection.reachable ? "Balance by the pocket's date" : "Balance after 50 years"}
          </p>
          <p className="mt-0.5 text-[15px] font-semibold tracking-tight text-in">
            <AnimatedTaka value={dps.balanceAtPocketCompletion} decimals={2} />
          </p>
        </div>
        <div>
          <p className="text-[11px] leading-tight text-ink-3">Of which interest</p>
          <p className="mt-0.5 text-[15px] font-semibold tracking-tight text-in">
            <AnimatedTaka value={dps.interestAtPocketCompletion} decimals={2} />
          </p>
        </div>
      </div>

      <p className="mt-2.5 text-[12px] leading-relaxed text-ink-2">
        {dps.targetReachedMonth ? (
          <>
            With interest, the same money reaches <Taka value={pocket.target} /> by{" "}
            <span className="font-medium text-ink">
              {formatDate(dps.targetReachedDate!, "long")}
            </span>
            {dps.monthsEarlier !== null && dps.monthsEarlier > 0 ? (
              <>
                {" "}
                — <span className="font-medium text-in">{dps.monthsEarlier} months earlier</span>{" "}
                than saving it in a box.
              </>
            ) : (
              <>, the same month as saving it in a box.</>
            )}
            {" "}Deposits total <Taka value={projection.totalDeposited} />, so{" "}
            <Taka value={dps.interestAtPocketCompletion} decimals={2} /> of the balance is
            interest rather than your own money.
          </>
        ) : (
          <>
            Even with interest the deposits never reach <Taka value={pocket.target} /> within
            50 years at this rate of saving.
          </>
        )}
      </p>
      <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
        Illustrative. A real DPS also has a fixed term, a penalty for a missed instalment and
        tax on the interest, none of which is modelled here.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Schedule({ projection }: { projection: PocketProjection }) {
  return (
    <div className="border-t border-rule">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] text-[12px]">
          <thead>
            <tr className="border-b border-rule text-left text-ink-3">
              <th className="px-4 py-2 font-medium">Month</th>
              <th className="px-2 py-2 text-right font-medium">Month surplus</th>
              <th className="px-2 py-2 text-right font-medium">Wanted</th>
              <th className="px-2 py-2 text-right font-medium">Funded</th>
              <th className="px-4 py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {projection.schedule.map((m) => (
              <tr key={m.monthKey} className={m.funded < m.requested ? "bg-out-soft/40" : ""}>
                <td className="px-4 py-1.5 text-ink">{monthLabel(m.monthKey, "short")}</td>
                <td className="px-2 py-1.5 text-right text-ink-2">
                  <Taka value={m.monthSurplus} signed />
                </td>
                <td className="px-2 py-1.5 text-right text-ink-2">
                  <Taka value={m.requested} />
                </td>
                <td
                  className={cn(
                    "px-2 py-1.5 text-right font-medium",
                    m.funded < m.requested ? "text-out" : "text-ink",
                  )}
                >
                  <Taka value={m.funded} />
                </td>
                <td className="px-4 py-1.5 text-right text-ink">
                  <Taka value={m.balanceAfter} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2.5 text-[11.5px] leading-snug text-ink-3">
        First {projection.schedule.length} months. Rows shaded in the money-out colour are
        months where the surplus could not cover the full contribution — each one pushes the
        completion date out.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PocketSheet({
  open,
  onClose,
  title,
  pocket,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  pocket?: Pocket;
}) {
  const addPocket = useLedger((s) => s.addPocket);
  const updatePocket = useLedger((s) => s.updatePocket);
  const removePocket = useLedger((s) => s.removePocket);

  const [form, setForm] = useState({
    name: "",
    item: "",
    target: "",
    contribution: "",
  });
  const [touched, setTouched] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);

  // Re-seed the form whenever a different pocket is opened for editing.
  const key = pocket?.id ?? "new";
  if (open && seeded !== key) {
    setSeeded(key);
    setForm({
      name: pocket?.name ?? "",
      item: pocket?.item ?? "",
      target: pocket ? String(fromPaisa(pocket.target)) : "",
      contribution: pocket ? String(fromPaisa(pocket.monthlyContribution)) : "",
    });
    setTouched(false);
  }

  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = "Give the pocket a name";
  if (!form.item.trim()) errors.item = "What exactly is it for?";
  if (!(Number(form.target) > 0)) errors.target = "Target must be more than zero";
  if (!(Number(form.contribution) > 0)) errors.contribution = "Contribution must be more than zero";
  const valid = Object.keys(errors).length === 0;

  const close = () => {
    setSeeded(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      subtitle="The completion date is worked out from your forecast, not from this contribution on its own."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!valid) return;
          const payload = {
            name: form.name.trim(),
            item: form.item.trim(),
            target: toPaisa(form.target),
            monthlyContribution: toPaisa(form.contribution),
          };
          if (pocket) updatePocket(pocket.id, payload);
          else addPocket(payload);
          close();
        }}
        className="space-y-4"
      >
        <Field
          id="p-name"
          label="Name"
          placeholder="Laptop"
          value={form.name}
          error={touched ? errors.name : undefined}
          onChange={(v) => setForm((f) => ({ ...f, name: v }))}
        />
        <Field
          id="p-item"
          label="Item details"
          placeholder="MacBook Air M4, 16GB"
          value={form.item}
          error={touched ? errors.item : undefined}
          onChange={(v) => setForm((f) => ({ ...f, item: v }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <MoneyField
            id="p-target"
            label="Target amount"
            value={form.target}
            error={touched ? errors.target : undefined}
            onChange={(v) => setForm((f) => ({ ...f, target: v }))}
          />
          <MoneyField
            id="p-contribution"
            label="Each month"
            value={form.contribution}
            error={touched ? errors.contribution : undefined}
            onChange={(v) => setForm((f) => ({ ...f, contribution: v }))}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" variant="primary" className="flex-1">
            {pocket ? "Save changes" : "Create pocket"}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
        </div>

        {pocket ? (
          <div className="border-t border-rule pt-4">
            <Button
              type="button"
              variant="danger"
              className="w-full"
              onClick={() => {
                removePocket(pocket.id);
                close();
              }}
            >
              Delete this pocket
            </Button>
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}

/**
 * Twice the current contribution gives the thumb somewhere useful to travel in
 * both directions, without a range so wide that a small drag does nothing.
 */
function contributionSliderMax(pocket: Pocket) {
  const contributionTaka = Math.round(pocket.monthlyContribution / 100);
  const targetTaka = Math.round(pocket.target / 100);
  return Math.max(2000, Math.min(targetTaka, Math.max(contributionTaka * 2, 5000)));
}

function Field({
  id,
  label,
  placeholder,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className="mt-1.5"
        placeholder={placeholder}
        value={value}
        invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <p className="mt-1 text-[12px] text-out">{error}</p> : null}
    </div>
  );
}

function MoneyField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-1.5">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">
          ৳
        </span>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          className="pl-7"
          placeholder="0"
          value={value}
          invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {error ? <p className="mt-1 text-[12px] text-out">{error}</p> : null}
    </div>
  );
}

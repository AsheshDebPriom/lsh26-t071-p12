"use client";

/**
 * Requirement 4 — savings pockets.
 *
 * Each pocket carries a name, a target, the item it is for and a monthly
 * contribution. Its completion date comes from the forward simulation in
 * lib/pockets, never from target divided by contribution — and each card puts
 * the two figures side by side so the difference is visible rather than claimed.
 *
 * Beside it sits what the same deposits would have done in a DPS, with the rate
 * and the compounding basis printed next to the figure.
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

import { GoalSeek } from "./GoalSeek";
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
    <div className="space-y-4">
      <SurplusRow fc={fc} sim={sim} count={pockets.length} />

      {ordered.length > 0 ? (
        <>
          <WhatIfControl fc={fc} sim={sim} pockets={pockets} baseline={baseline} />
          <GoalSeek />
        </>
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
        <div className="grid gap-4 xl:grid-cols-2">
          {ordered.map((p, i) => (
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
          ))}
        </div>
      )}

      {ordered.length > 0 ? (
        <Button variant="secondary" className="w-full" onClick={() => setCreating(true)}>
          Add another pocket
        </Button>
      ) : null}

      <PocketSheet open={creating} onClose={() => setCreating(false)} title="New pocket" />
      <PocketSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit pocket"
        pocket={editing ?? undefined}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SurplusRow({
  fc,
  sim,
  count,
}: {
  fc: Forecast;
  sim: PocketSimulation;
  count: number;
}) {
  const covered = sim.steadyMonthSurplus >= sim.totalRequested;
  const gap = sim.totalRequested - Math.max(0, sim.steadyMonthSurplus);

  return (
    <Card>
      <CardHead
        title="What there is to save with"
        hint="Every date below is built from this figure, month by month."
      />
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-rule px-5 py-4 lg:grid-cols-4">
        <Figure
          label={`Left in ${monthLabel(fc.monthKey, "short")}`}
          value={sim.currentMonthSurplus}
          tone={sim.currentMonthSurplus < 0 ? "out" : "in"}
          signed
        />
        <Figure
          label="A typical month after"
          value={sim.steadyMonthSurplus}
          tone={sim.steadyMonthSurplus < 0 ? "out" : "in"}
          signed
        />
        <Figure
          label={`${count} pocket${count === 1 ? "" : "s"} ask for`}
          value={sim.totalRequested}
        />
        <Figure
          label={covered ? "Spare each month" : "Unfunded each month"}
          value={covered ? sim.steadyMonthSurplus - sim.totalRequested : gap}
          tone={covered ? "in" : "out"}
        />
      </div>
      <p className="border-t border-rule px-5 py-3 text-[12.5px] leading-relaxed text-ink-2">
        {count === 0
          ? "Create a pocket and its date will be simulated against this surplus."
          : covered
            ? "The forecast covers every contribution in full, so each pocket receives what you set aside for it each month."
            : "The forecast does not cover every contribution, so each month the pockets are funded in order and the ones lower down are capped at what is left. That is why their dates sit further out than the contribution alone would suggest."}
      </p>
    </Card>
  );
}

function Figure({
  label,
  value,
  tone,
  signed,
}: {
  label: string;
  value: number;
  tone?: "in" | "out";
  signed?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p
        className={cn(
          "figure mt-2 text-[23px] leading-none",
          tone === "out" ? "text-out" : tone === "in" ? "text-in" : "text-ink",
        )}
      >
        <AnimatedTaka value={value} signed={signed} />
      </p>
    </div>
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
  const slip = projection.reachable ? projection.monthsToComplete! - naiveMonths : null;

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-semibold tracking-tight text-ink">
            {pocket.name}
          </h2>
          <p className="mt-1 truncate text-[12.5px] text-ink-3">{pocket.item}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Pill>#{index + 1} funded</Pill>
          <button
            aria-label={`Move ${pocket.name} up the funding order`}
            disabled={index === 0}
            onClick={() => movePocket(pocket.id, -1)}
            className="h-6 w-6 rounded border border-rule text-[11px] text-ink-2 hover:bg-sunk disabled:opacity-30"
          >
            ↑
          </button>
          <button
            aria-label={`Move ${pocket.name} down the funding order`}
            disabled={index === total - 1}
            onClick={() => movePocket(pocket.id, 1)}
            className="h-6 w-6 rounded border border-rule text-[11px] text-ink-2 hover:bg-sunk disabled:opacity-30"
          >
            ↓
          </button>
        </div>
      </div>

      {/* The headline: the date, or the honest absence of one. */}
      <div className="border-t border-rule bg-sunk/60 px-5 py-4">
        <p className="eyebrow">Expected completion</p>
        {projection.reachable ? (
          <>
            <p className="figure mt-2 text-[28px] leading-none text-ink lg:text-[31px]">
              <MovingDate iso={projection.completionDate!} />
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-surface px-2 py-1 text-[11.5px] text-ink-2 shadow-lift-1">
                <span className="tnum font-semibold text-ink">
                  {projection.monthsToComplete}
                </span>{" "}
                months simulated
              </span>
              <span className="rounded-md bg-surface px-2 py-1 text-[11.5px] text-ink-3 shadow-lift-1">
                target ÷ contribution says{" "}
                <span className="tnum font-semibold">{naiveMonths}</span>
              </span>
              {slip && slip > 0 ? (
                <span className="rounded-md border border-out/25 bg-out-soft px-2 py-1 text-[11.5px] font-medium text-out">
                  <span className="tnum">{slip}</span> months later
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-[19px] font-semibold leading-tight tracking-tight text-out">
              Not reachable at current spending
            </p>
            <p className="mt-2 text-[12.5px] leading-snug text-ink-2">
              A typical month leaves{" "}
              <Taka value={sim.steadyMonthSurplus} signed className="font-medium" />, so this
              pocket never reaches <Taka value={pocket.target} />. Cut a category above, or
              lower a contribution ahead of it in the order.
            </p>
          </>
        )}
      </div>

      {/* Target, contribution and what actually landed this month. */}
      <div className="space-y-3 border-t border-rule px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12.5px] text-ink-3">Target</span>
          <span className="tnum text-[15px] font-semibold text-ink">
            <Taka value={pocket.target} />
          </span>
        </div>

        {/* Dragging this re-runs the whole simulation on every change event, so
            the date above moves as the thumb moves. */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={`contrib-${pocket.id}`} className="text-[12.5px] text-ink-3">
              Set aside each month
            </label>
            <span className="tnum text-[15px] font-semibold text-ink">
              <AnimatedTaka value={pocket.monthlyContribution} />
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

        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12.5px] text-ink-3">
            Funded in {monthLabel(fc.monthKey, "short")}
          </span>
          <span className="tnum text-[14px]">
            <AnimatedTaka
              value={projection.fundedThisMonth}
              className={cn("font-semibold", shortfall > 0 ? "text-out" : "text-in")}
            />
            {shortfall > 0 ? (
              <span className="text-[12px] text-ink-3">
                {" "}
                of <Taka value={projection.requestedThisMonth} />
              </span>
            ) : null}
          </span>
        </div>

        <p className="rounded-lg bg-sunk px-3 py-2.5 text-[12px] leading-relaxed text-ink-2">
          {pocketSentence(pocket, sim, fc.monthKey)}
        </p>
      </div>

      <DpsPanel projection={projection} pocket={pocket} />

      <div className="mt-auto flex items-center gap-2 border-t border-rule px-5 py-3">
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
 * Twice the current contribution gives the thumb somewhere useful to travel in
 * both directions, without a range so wide that a small drag does nothing.
 */
function contributionSliderMax(pocket: Pocket) {
  const contributionTaka = Math.round(pocket.monthlyContribution / 100);
  const targetTaka = Math.round(pocket.target / 100);
  return Math.max(2000, Math.min(targetTaka, Math.max(contributionTaka * 2, 5000)));
}

/**
 * The date travels rather than snapping, so that when a slider moves it the
 * causality is felt rather than inferred. A later date rises from below, an
 * earlier one drops from above, so the direction is legible before the text has
 * even been read.
 */
function MovingDate({ iso }: { iso: string }) {
  const reduced = useReducedMotion();
  // Adjust state during render — the documented way to react to a changed prop
  // without an effect and without reading a ref mid-render.
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
          exit={
            reduced
              ? { opacity: 0 }
              : { y: later ? "-0.7em" : "0.7em", opacity: 0, position: "absolute" }
          }
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
      <div className="border-t border-rule px-5 py-4">
        <p className="text-[12px] leading-relaxed text-ink-3">
          No money reaches this pocket in the simulation, so there is nothing to compare a
          DPS against.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-rule bg-in-soft/45 px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="eyebrow">The same deposits in a DPS</p>
        <p className="tnum text-[11.5px] font-semibold text-in">
          {dps.annualRatePercent.toFixed(2)}% a year, compounded monthly
        </p>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-snug text-ink-2">
        The deposit goes in first, then interest of balance × {dps.annualRatePercent.toFixed(2)}{" "}
        ÷ 12 ÷ 100 is rounded half up to the paisa and added — so later months earn on it too.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] leading-tight text-ink-3">
            {projection.reachable ? "Balance by the pocket's date" : "Balance after 50 years"}
          </p>
          <p className="figure mt-1.5 text-[19px] leading-none text-in">
            <AnimatedTaka value={dps.balanceAtPocketCompletion} decimals={2} />
          </p>
        </div>
        <div>
          <p className="text-[11px] leading-tight text-ink-3">Of which interest</p>
          <p className="figure mt-1.5 text-[19px] leading-none text-in">
            <AnimatedTaka value={dps.interestAtPocketCompletion} decimals={2} />
          </p>
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-2">
        {dps.targetReachedMonth ? (
          <>
            With interest, the same money reaches <Taka value={pocket.target} /> by{" "}
            <span className="font-semibold text-ink">
              {formatDate(dps.targetReachedDate!, "long")}
            </span>
            {dps.monthsEarlier !== null && dps.monthsEarlier > 0 ? (
              <>
                {" "}
                — <span className="font-semibold text-in">{dps.monthsEarlier} months earlier</span>{" "}
                than saving it in a box.
              </>
            ) : (
              <>, the same month as saving it in a box.</>
            )}{" "}
            Deposits total <Taka value={projection.totalDeposited} />, so{" "}
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
      <p className="mt-2 text-[11px] leading-snug text-ink-3">
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
            <tr className="border-b border-rule text-left">
              <th className="eyebrow px-5 py-2 font-semibold">Month</th>
              <th className="eyebrow px-2 py-2 text-right font-semibold">Surplus</th>
              <th className="eyebrow px-2 py-2 text-right font-semibold">Wanted</th>
              <th className="eyebrow px-2 py-2 text-right font-semibold">Funded</th>
              <th className="eyebrow px-5 py-2 text-right font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody>
            {projection.schedule.map((m) => (
              <tr
                key={m.monthKey}
                className={cn(
                  "border-b border-rule last:border-0",
                  m.funded < m.requested && "bg-out-soft/40",
                )}
              >
                <td className="px-5 py-1.5 text-ink">{monthLabel(m.monthKey, "short")}</td>
                <td className="tnum px-2 py-1.5 text-right text-ink-2">
                  <Taka value={m.monthSurplus} signed />
                </td>
                <td className="tnum px-2 py-1.5 text-right text-ink-2">
                  <Taka value={m.requested} />
                </td>
                <td
                  className={cn(
                    "tnum px-2 py-1.5 text-right font-semibold",
                    m.funded < m.requested ? "text-out" : "text-ink",
                  )}
                >
                  <Taka value={m.funded} />
                </td>
                <td className="tnum px-5 py-1.5 text-right text-ink">
                  <Taka value={m.balanceAfter} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-[11.5px] leading-snug text-ink-3">
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

  const [form, setForm] = useState({ name: "", item: "", target: "", contribution: "" });
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
  if (!(Number(form.contribution) > 0))
    errors.contribution = "Contribution must be more than zero";
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

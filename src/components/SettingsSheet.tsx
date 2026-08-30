"use client";

/**
 * Setup: salary, the date the app treats as today, the DPS rate, and the
 * published sample cases.
 *
 * The "as of" date is a real setting rather than `new Date()` because every
 * published case carries its own `today`. Judging a case dated April 2026 from
 * a machine whose clock says August would otherwise compute the whole forecast
 * against the wrong month.
 */

import { useState } from "react";

import { formatDate, realToday } from "@/lib/dates";
import { fromPaisa, toPaisa } from "@/lib/money";
import { useLedger } from "@/store/useLedger";
import type { PublishedCase } from "@/lib/types";

import { Button, Card, Input, Label, Pill, Taka } from "./ui";
import { Sheet } from "./Sheet";

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const salary = useLedger((s) => s.salary);
  const settings = useLedger((s) => s.settings);
  const setSalary = useLedger((s) => s.setSalary);
  const setToday = useLedger((s) => s.setToday);
  const setDpsRate = useLedger((s) => s.setDpsRate);
  const loadCase = useLedger((s) => s.loadCase);
  const resetToSeed = useLedger((s) => s.resetToSeed);
  const startEmpty = useLedger((s) => s.startEmpty);

  // The salary box keeps its own text so a half-typed number is not reformatted
  // under the cursor. It is re-seeded from the store each time the sheet opens.
  const [salaryText, setSalaryText] = useState("");
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSalaryText(salary === 0 ? "" : String(fromPaisa(salary)));
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Setup"
      subtitle="Salary, the date being viewed, and the DPS rate the comparison uses."
      wide
    >
      <div className="space-y-5">
        <div>
          <Label htmlFor="set-salary">Monthly salary</Label>
          <div className="relative mt-1.5">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">
              ৳
            </span>
            <Input
              id="set-salary"
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              className="pl-7 text-[17px] font-medium"
              placeholder="50000"
              value={salaryText}
              onChange={(e) => {
                setSalaryText(e.target.value);
                setSalary(toPaisa(e.target.value || "0"));
              }}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-ink-3">
            Everything the forecast says about money left or short is measured against this.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="set-today">Viewing as of</Label>
            <Input
              id="set-today"
              type="date"
              className="mt-1.5"
              value={settings.today}
              onChange={(e) => e.target.value && setToday(e.target.value)}
            />
            <button
              className="mt-1.5 text-[12px] text-ink-2 underline underline-offset-2 hover:text-ink"
              onClick={() => setToday(realToday())}
            >
              Use today&apos;s real date ({formatDate(realToday(), "long")})
            </button>
          </div>

          <div>
            <Label htmlFor="set-dps">DPS annual rate</Label>
            <div className="relative mt-1.5">
              <Input
                id="set-dps"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.25"
                className="pr-8"
                value={settings.dpsAnnualRatePercent}
                onChange={(e) => setDpsRate(Number(e.target.value))}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">
                %
              </span>
            </div>
            <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
              Compounded monthly. The deposit goes in first, then interest is added to the
              new balance.
            </p>
          </div>
        </div>

        <CaseLoader
          currentCaseId={settings.loadedCaseId}
          onLoad={(c) => {
            loadCase(c);
            onClose();
          }}
        />

        <div className="border-t border-rule pt-4">
          <Label>Start over</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                resetToSeed();
                onClose();
              }}
            >
              Restore the sample ledger
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (
                  window.confirm(
                    "Clear every expense and pocket and start from an empty ledger?",
                  )
                ) {
                  startEmpty();
                  onClose();
                }
              }}
            >
              Clear everything
            </Button>
          </div>
          <p className="mt-2 text-[12px] leading-snug text-ink-3">
            Restoring the sample ledger reloads case PUB-01 exactly as it opens on a fresh
            visit. Nothing is stored anywhere but this browser, so clearing is final.
          </p>
        </div>

        <div className="rounded-lg bg-sunk px-3 py-2.5 text-[12px] leading-relaxed text-ink-2">
          Current setup: salary <Taka value={salary} className="font-medium" />, viewing{" "}
          {formatDate(settings.today, "long")}, DPS at{" "}
          <span className="tnum font-medium">
            {settings.dpsAnnualRatePercent.toFixed(2)}%
          </span>{" "}
          a year.
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Loads any of the 25 published cases straight from the fixture that ships in
 * `public/sample-data`, so a judge can check the app against data they already
 * have without typing anything.
 */
function CaseLoader({
  currentCaseId,
  onLoad,
}: {
  currentCaseId: string | null;
  onLoad: (c: PublishedCase) => void;
}) {
  const [cases, setCases] = useState<PublishedCase[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const fetchCases = async () => {
    setState("loading");
    try {
      const res = await fetch("/sample-data/P12_personal_ledger_public.json");
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { cases: PublishedCase[] };
      setCases(json.cases);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="border-t border-rule pt-4">
      <div className="flex items-center justify-between gap-3">
        <Label>Published sample cases</Label>
        {currentCaseId ? <Pill>loaded: {currentCaseId}</Pill> : null}
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
        The 25 cases from the P12 fixture. Loading one replaces the salary, the expenses,
        the pockets, the DPS rate and the date being viewed with that case&apos;s own values.
      </p>

      {cases === null ? (
        <div className="mt-2.5">
          <Button variant="secondary" onClick={fetchCases} disabled={state === "loading"}>
            {state === "loading" ? "Loading…" : "Show the 25 cases"}
          </Button>
          {state === "error" ? (
            <p className="mt-2 text-[12px] text-out">
              Could not read the fixture. It ships at{" "}
              <code className="tnum">/sample-data/P12_personal_ledger_public.json</code> —
              reload and try again.
            </p>
          ) : null}
        </div>
      ) : (
        <Card className="mt-2.5 max-h-64 overflow-y-auto">
          <ul className="divide-y divide-rule">
            {cases.map((c) => (
              <li key={c.case_id}>
                <button
                  onClick={() => onLoad(c)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-sunk"
                >
                  <span className="text-[13px] font-medium text-ink">{c.case_id}</span>
                  <span className="tnum text-[12px] text-ink-3">
                    {formatDate(c.today, "long")} · ৳
                    {Number(c.salary_bdt).toLocaleString("en-US")} · {c.expenses.length}{" "}
                    expenses · DPS {c.dps_annual_rate_percent}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

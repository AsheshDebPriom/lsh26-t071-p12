/**
 * Backup and restore.
 *
 * localStorage is the source of truth and this never changes that. What lives
 * here is a one-way push of the current ledger to the database, and a pull that
 * replaces the browser's copy from a key.
 *
 * Everything fails soft. If the backup is unconfigured, offline, or slow, the
 * app behaves exactly as it does with no database — the status line says so and
 * nothing else notices.
 */

import type { Expense, Pocket, Settings } from "./types";
import type { Paisa } from "./money";

export type LedgerSnapshot = {
  salaryPaisa: Paisa;
  asOfDate: string;
  dpsAnnualRatePercent: number;
  loadedCaseId: string | null;
  expenses: Expense[];
  pockets: Pocket[];
};

export type SyncStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; at: string }
  | { state: "off"; reason: string }
  | { state: "error"; reason: string };

export function buildSnapshot(
  salary: Paisa,
  settings: Settings,
  expenses: Expense[],
  pockets: Pocket[],
): LedgerSnapshot {
  return {
    salaryPaisa: salary,
    asOfDate: settings.today,
    dpsAnnualRatePercent: settings.dpsAnnualRatePercent,
    loadedCaseId: settings.loadedCaseId,
    expenses,
    pockets,
  };
}

/**
 * A cheap content signature, so an auto-save only fires when something actually
 * changed. Rebuilding it is far cheaper than a network round trip.
 */
export function snapshotSignature(s: LedgerSnapshot): string {
  return JSON.stringify(s);
}

export type SaveResult =
  | { ok: true; ledgerId: string; savedAt: string }
  | { ok: false; code: string; error: string };

export async function saveLedger(
  snapshot: LedgerSnapshot,
  ledgerId: string | null,
): Promise<SaveResult> {
  try {
    const res = await fetch("/api/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ledgerId, snapshot }),
    });
    const json = await res.json();
    if (!json.ok) return { ok: false, code: json.code ?? "upstream", error: json.error };
    return { ok: true, ledgerId: json.ledgerId, savedAt: json.savedAt };
  } catch {
    return {
      ok: false,
      code: "offline",
      error: "No connection to the backup. Your ledger is safe in this browser.",
    };
  }
}

export type LoadResult =
  | { ok: true; snapshot: LedgerSnapshot & { ledgerId: string; updatedAt: string } }
  | { ok: false; code: string; error: string };

export async function loadLedger(id: string): Promise<LoadResult> {
  try {
    const res = await fetch(`/api/ledger?id=${encodeURIComponent(id)}`);
    const json = await res.json();
    if (!json.ok) return { ok: false, code: json.code ?? "upstream", error: json.error };
    return { ok: true, snapshot: normalise(json.snapshot) };
  } catch {
    return { ok: false, code: "offline", error: "No connection to the backup." };
  }
}

/**
 * Nothing coming back over the wire is trusted. A row missing an amount, or
 * carrying one that is not a positive integer, is dropped rather than allowed
 * to poison the forecast with a NaN.
 */
function normalise(raw: unknown): LedgerSnapshot & { ledgerId: string; updatedAt: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rows = (v: unknown) => (Array.isArray(v) ? v : []);

  const expenses: Expense[] = rows(r.expenses)
    .map((e) => e as Record<string, unknown>)
    .filter(
      (e) =>
        typeof e.id === "string" &&
        typeof e.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
        typeof e.shop === "string" &&
        typeof e.category === "string" &&
        Number.isFinite(Number(e.amount)) &&
        Number(e.amount) > 0,
    )
    .map((e) => ({
      id: String(e.id),
      date: String(e.date),
      category: String(e.category),
      shop: String(e.shop),
      amount: Math.round(Number(e.amount)),
      source: e.source === "receipt" ? "receipt" : "manual",
      correctedFields: Array.isArray(e.correctedFields)
        ? (e.correctedFields as Expense["correctedFields"])
        : undefined,
    }));

  const pockets: Pocket[] = rows(r.pockets)
    .map((p) => p as Record<string, unknown>)
    .filter(
      (p) =>
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        Number(p.target) > 0 &&
        Number(p.monthlyContribution) > 0,
    )
    .map((p, i) => ({
      id: String(p.id),
      name: String(p.name),
      item: typeof p.item === "string" ? p.item : "",
      target: Math.round(Number(p.target)),
      monthlyContribution: Math.round(Number(p.monthlyContribution)),
      priority: Number.isFinite(Number(p.priority)) ? Number(p.priority) : i,
      createdAt: Number.isFinite(Number(p.createdAt)) ? Number(p.createdAt) : Date.now() + i,
    }));

  const rate = Number(r.dpsAnnualRatePercent);

  return {
    ledgerId: String(r.ledgerId ?? ""),
    updatedAt: String(r.updatedAt ?? ""),
    salaryPaisa: Math.max(0, Math.round(Number(r.salaryPaisa) || 0)),
    asOfDate:
      typeof r.asOfDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.asOfDate)
        ? r.asOfDate
        : new Date().toISOString().slice(0, 10),
    dpsAnnualRatePercent: Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 8,
    loadedCaseId: typeof r.loadedCaseId === "string" ? r.loadedCaseId : null,
    expenses,
    pockets,
  };
}

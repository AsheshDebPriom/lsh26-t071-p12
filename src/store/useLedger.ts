"use client";

/**
 * The whole application state.
 *
 * Persisted to localStorage — there is no database and no account. That is a
 * deliberate limitation for this build and it is declared in the README: the
 * data lives in one browser and does not travel.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { realToday } from "@/lib/dates";
import { toPaisa, type Paisa } from "@/lib/money";
import {
  SEED_CASE_ID,
  SEED_DPS_RATE,
  SEED_EXPENSES,
  SEED_POCKETS,
  SEED_SALARY,
  SEED_TODAY,
} from "@/lib/seed";
import type {
  CategoryAdjustment,
  Expense,
  Pocket,
  PublishedCase,
  Settings,
} from "@/lib/types";

export type LedgerState = {
  salary: Paisa;
  expenses: Expense[];
  pockets: Pocket[];
  settings: Settings;
  /** What-if cuts. Deliberately not persisted: it is an exploration, not data. */
  adjustments: CategoryAdjustment[];
  hydrated: boolean;

  setSalary: (paisa: Paisa) => void;
  setToday: (date: string) => void;
  setDpsRate: (percent: number) => void;

  addExpense: (e: Omit<Expense, "id">) => string;
  updateExpense: (id: string, patch: Partial<Omit<Expense, "id">>) => void;
  removeExpense: (id: string) => void;

  addPocket: (p: Omit<Pocket, "id" | "priority" | "createdAt">) => string;
  updatePocket: (id: string, patch: Partial<Omit<Pocket, "id">>) => void;
  removePocket: (id: string) => void;
  movePocket: (id: string, direction: -1 | 1) => void;

  setAdjustment: (category: string, cutPercent: number) => void;
  clearAdjustments: () => void;

  loadCase: (c: PublishedCase) => void;
  resetToSeed: () => void;
  startEmpty: () => void;
  markHydrated: () => void;
};

let counter = 0;
function newId(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

const seedState = () => ({
  salary: SEED_SALARY,
  expenses: SEED_EXPENSES.map((e) => ({ ...e })),
  pockets: SEED_POCKETS.map((p) => ({ ...p })),
  settings: {
    today: SEED_TODAY,
    dpsAnnualRatePercent: SEED_DPS_RATE,
    loadedCaseId: SEED_CASE_ID,
  } satisfies Settings,
  adjustments: [] as CategoryAdjustment[],
});

export const useLedger = create<LedgerState>()(
  persist(
    (set, get) => ({
      ...seedState(),
      hydrated: false,

      setSalary: (paisa) => set({ salary: Math.max(0, Math.round(paisa)) }),
      setToday: (date) =>
        set((s) => ({ settings: { ...s.settings, today: date } })),
      setDpsRate: (percent) =>
        set((s) => ({
          settings: {
            ...s.settings,
            dpsAnnualRatePercent: Math.max(0, Math.min(100, percent)),
          },
        })),

      addExpense: (e) => {
        const id = newId("E");
        set((s) => ({ expenses: [...s.expenses, { ...e, id }] }));
        return id;
      },
      updateExpense: (id, patch) =>
        set((s) => ({
          expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      removeExpense: (id) =>
        set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) })),

      addPocket: (p) => {
        const id = newId("SP");
        const priority = get().pockets.reduce((m, x) => Math.max(m, x.priority), -1) + 1;
        set((s) => ({
          pockets: [...s.pockets, { ...p, id, priority, createdAt: Date.now() }],
        }));
        return id;
      },
      updatePocket: (id, patch) =>
        set((s) => ({
          pockets: s.pockets.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      removePocket: (id) =>
        set((s) => ({ pockets: s.pockets.filter((p) => p.id !== id) })),

      /** Priority decides who gets the surplus first when a month is short. */
      movePocket: (id, direction) =>
        set((s) => {
          const ordered = [...s.pockets].sort((a, b) => a.priority - b.priority);
          const i = ordered.findIndex((p) => p.id === id);
          const j = i + direction;
          if (i < 0 || j < 0 || j >= ordered.length) return {};
          [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
          return { pockets: ordered.map((p, k) => ({ ...p, priority: k })) };
        }),

      setAdjustment: (category, cutPercent) =>
        set((s) => {
          const rest = s.adjustments.filter((a) => a.category !== category);
          return cutPercent <= 0
            ? { adjustments: rest }
            : { adjustments: [...rest, { category, cutPercent }] };
        }),
      clearAdjustments: () => set({ adjustments: [] }),

      /** Replace everything with one of the published cases. */
      loadCase: (c) =>
        set({
          salary: toPaisa(c.salary_bdt),
          expenses: c.expenses.map((e) => ({
            id: e.id,
            date: e.date,
            category: e.category,
            shop: e.shop,
            amount: toPaisa(e.amount_bdt),
          })),
          pockets: c.pockets.map((p, i) => ({
            id: p.id,
            name: p.name,
            item: p.item,
            target: toPaisa(p.target_bdt),
            monthlyContribution: toPaisa(p.monthly_contribution_bdt),
            priority: i,
            createdAt: Date.now() + i,
          })),
          settings: {
            today: c.today,
            dpsAnnualRatePercent: Number(c.dps_annual_rate_percent),
            loadedCaseId: c.case_id,
          },
          adjustments: [],
        }),

      resetToSeed: () => set(seedState()),

      startEmpty: () =>
        set({
          salary: 0,
          expenses: [],
          pockets: [],
          settings: {
            today: realToday(),
            dpsAnnualRatePercent: 8,
            loadedCaseId: null,
          },
          adjustments: [],
        }),

      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "ledger-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        salary: s.salary,
        expenses: s.expenses,
        pockets: s.pockets,
        settings: s.settings,
      }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);

// Storage can be unavailable — private windows, storage blocked by policy. In
// that case rehydration never reports back, so release the gate anyway rather
// than leaving the app on its skeleton forever.
if (typeof window !== "undefined") {
  setTimeout(() => {
    if (!useLedger.getState().hydrated) useLedger.getState().markHydrated();
  }, 60);
}

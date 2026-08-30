/**
 * All money in this app is an integer number of **paisa** (1 taka = 100 paisa).
 *
 * Floats are not used for money anywhere. The published DPS rule rounds
 * interest "half up to the paisa" every month, so the unit of account has to
 * be the paisa or the compounding drifts.
 */

export type Paisa = number;

/** "2475.00" | 2475 -> 247500 paisa. Rounds half up on the third decimal. */
export function toPaisa(value: string | number): Paisa {
  const n = typeof value === "string" ? Number(value.replace(/[^0-9.\-]/g, "")) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromPaisa(p: Paisa): number {
  return p / 100;
}

/** Round half up, on positive and negative numbers alike. */
export function roundHalfUp(x: number): number {
  return x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5);
}

const groupers = {
  0: new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  2: new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
} as const;

/**
 * Digits only — the currency mark is rendered separately at a smaller size
 * by the <Taka> component so that figures stay aligned in a column.
 */
export function formatAmount(p: Paisa, decimals: 0 | 2 = 0): string {
  const v = Math.abs(p) / 100;
  return groupers[decimals].format(v);
}

/** Plain string with the mark, for places that cannot render a component. */
export function formatTaka(p: Paisa, decimals: 0 | 2 = 0): string {
  return `${p < 0 ? "−" : ""}৳${formatAmount(p, decimals)}`;
}

/** Percent change from a to b, guarding a === 0. Returns null when undefined. */
export function pctChange(from: Paisa, to: Paisa): number | null {
  if (from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

export function formatPct(pct: number, decimals = 0): string {
  return `${Math.abs(pct).toFixed(decimals)}%`;
}

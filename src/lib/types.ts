import type { ISODate, MonthKey } from "./dates";
import type { Paisa } from "./money";

/** The ten categories used by the published P12 fixture. */
export const CATEGORIES = [
  "Rent",
  "Groceries",
  "Food",
  "Transport",
  "Utilities",
  "Mobile",
  "Health",
  "Education",
  "Entertainment",
  "Clothing",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type Expense = {
  id: string;
  date: ISODate;
  category: string;
  shop: string;
  amount: Paisa;
  /** Set when the row came from a photographed receipt rather than typing. */
  source?: "manual" | "receipt";
  /** Fields the user had to correct because the read was not confident. */
  correctedFields?: ReceiptField[];
};

export type Pocket = {
  id: string;
  name: string;
  /** "MacBook Air M4" — the specific item, not just the goal. */
  item: string;
  target: Paisa;
  monthlyContribution: Paisa;
  /** Lower runs first when a month's surplus cannot fund every pocket. */
  priority: number;
  createdAt: number;
};

/** The what-if control: cut one category's *future* spending by a percentage. */
export type CategoryAdjustment = {
  category: string;
  cutPercent: number; // 0..100
};

export type ReceiptField = "amount" | "date" | "shop";

export type FieldRead<T> = {
  value: T | null;
  confidence: number; // 0..1
};

export type ReceiptRead = {
  amount: FieldRead<number>; // taka, not paisa — this crosses the network
  date: FieldRead<string>; // ISO
  shop: FieldRead<string>;
  /** Free-text note from the model about anything it could not resolve. */
  note?: string | null;
};

export type ReceiptResponse =
  | { ok: true; read: ReceiptRead; model: string }
  | { ok: false; error: string; code: "no_key" | "bad_image" | "upstream" | "unreadable" };

export type Settings = {
  /** The date the app treats as "now". Published cases carry their own. */
  today: ISODate;
  /** Annual DPS rate as a percentage, e.g. 8.00. Published cases carry their own. */
  dpsAnnualRatePercent: number;
  /** Which published case is loaded, for the header chip. */
  loadedCaseId: string | null;
};

/** The shape of one case in P12_personal_ledger_public.json. */
export type PublishedCase = {
  case_id: string;
  today: ISODate;
  months: { last: MonthKey; this: MonthKey };
  salary_bdt: string;
  expenses: {
    id: string;
    date: ISODate;
    category: string;
    shop: string;
    amount_bdt: string;
  }[];
  pockets: {
    id: string;
    name: string;
    item: string;
    target_bdt: string;
    monthly_contribution_bdt: string;
  }[];
  dps_annual_rate_percent: string;
  dps_rule: string;
};

/**
 * Mobile money messages — bKash, Nagad, Rocket, Upay.
 *
 * The brief says receipts arrive as screenshots. In Dhaka most spending does not
 * involve paper at all: it is a bKash or Nagad confirmation. Those messages have
 * a consistent shape, so they can be read **locally and deterministically** — no
 * model, no API key, no network, no waiting. A pattern either matches or it does
 * not, which suits this app better than a probabilistic read of a photograph.
 *
 * The same honesty rule as the receipt reader applies: a field that cannot be
 * read is left null, never guessed. A message whose amount cannot be found is
 * reported as unreadable rather than saved with a plausible number.
 *
 * Money coming *in* is recognised and deliberately excluded — this is an expense
 * ledger, and silently recording a salary credit as spending would be worse than
 * skipping it. The count is reported so the user knows nothing vanished.
 */

import { clampDayToMonth, type ISODate } from "./dates";
import { toPaisa, type Paisa } from "./money";

export type MoneyDirection = "out" | "in";

export type ParsedMessage = {
  /** The original line, so the user can always check what was read. */
  raw: string;
  direction: MoneyDirection;
  /** Null when the message had no readable amount — never a guess. */
  amount: Paisa | null;
  /** Null when no date was printed; the caller falls back to the viewing date. */
  date: ISODate | null;
  /** Merchant, or the kind of transaction when no merchant is named. */
  shop: string | null;
  /** Transaction id, used to avoid importing the same message twice. */
  reference: string | null;
  provider: string;
};

export type ParseSummary = {
  /** Outgoing payments with a readable amount — the ones worth importing. */
  usable: ParsedMessage[];
  /** Recognised, but money coming in. Reported, never recorded as spending. */
  incoming: ParsedMessage[];
  /** Looked like a message but had no readable amount. */
  unreadable: string[];
  /** Lines that were not mobile money messages at all. */
  ignored: number;
};

const PROVIDERS: { name: string; hint: RegExp }[] = [
  { name: "bKash", hint: /\bbkash\b/i },
  { name: "Nagad", hint: /\bnagad\b/i },
  { name: "Rocket", hint: /\brocket\b|\bdbbl\b/i },
  { name: "Upay", hint: /\bupay\b/i },
];

/** Words that mean money left the account. */
const OUTGOING =
  /\b(?:payment|paid|pay|send\s*money|sent|cash\s*out|cashout|withdraw|purchase|bill\s*pay|recharge|top\s*up|topup|transferred\s+to)\b/i;

/** Words that mean money arrived. Checked first, so "received" beats "payment". */
const INCOMING =
  /\b(?:received|receive|cash\s*in|cashin|add\s*money|refund(?:ed)?|deposit(?:ed)?|credited|salary)\b/i;

/** Tk 1,234.56 · BDT 1234 · ৳1,234.56 · Amount: Tk 300.00 */
const AMOUNT = /(?:tk|bdt|৳)\.?\s*([\d,]+(?:\.\d{1,2})?)/i;

/** A currency mark at all, even with no figure after it. */
const MENTIONS_MONEY = /(?:\btk\b|\bbdt\b|৳)/i;

/** Balance and fee clauses carry amounts too. They are not the total. */
const NOT_THE_AMOUNT = /\b(?:balance|fee|charge|commission|available)\b/i;

const REFERENCE =
  /\b(?:trx\s*id|txn\s*id|transaction\s*id|trxid|txnid)\b[:\s.]*([a-z0-9]{4,20})/i;

const DATE = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/;

/** "Merchant: Shwapno", "to Meena Bazar", "at Agora". */
const SHOP = [
  /\bmerchant\s*[:\-]\s*([^.,;\n]{2,40})/i,
  /\b(?:to|at)\s+((?!your\b|a\b|the\b)[A-Za-z][A-Za-z0-9&'’.\- ]{1,39})/,
];

/**
 * Where a captured name stops being a name. Without this, "to Meena Bazar is
 * successful. Ref 8821. Fee" is captured whole as the shop.
 */
const SHOP_STOP =
  /\s+(?:is|was|are|were|successful|success|failed|completed|complete|ref|fee|balance|charge|trxid|txnid|trx|txn|transaction|at|on|for|from|account)\b/i;

/**
 * When no merchant is named the message still says what kind of transaction it
 * was. Using that is reading the message, not inventing a counterparty.
 */
const KIND: { label: string; hint: RegExp }[] = [
  { label: "Cash out", hint: /\bcash\s*out\b|\bcashout\b|\bwithdraw/i },
  { label: "Mobile recharge", hint: /\brecharge\b|\btop\s*up\b|\btopup\b/i },
  { label: "Bill pay", hint: /\bbill\s*pay\b/i },
  { label: "Send money", hint: /\bsend\s*money\b|\bsent\b|\btransferred\b/i },
];

function readAmount(line: string): Paisa | null {
  // Drop the clauses quoting a balance or a fee before looking for the total, so
  // "Payment Tk 450. Fee Tk 36.50. Balance Tk 4,550" reads 450.
  const kept = line
    .split(/[.,;]\s+|\s{2,}/)
    .filter((part) => !NOT_THE_AMOUNT.test(part))
    .join(". ");
  const m = AMOUNT.exec(kept);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return toPaisa(n);
}

function readDate(line: string): ISODate | null {
  const m = DATE.exec(line);
  if (!m) return null;
  // Bangladesh writes the day first.
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 2000 || year > 2100) return null;
  return clampDayToMonth(`${year}-${String(month).padStart(2, "0")}`, day);
}

function readShop(line: string): string | null {
  for (const re of SHOP) {
    const m = re.exec(line);
    if (!m) continue;
    const name = m[1]
      .split(SHOP_STOP)[0]
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[.,;\-–—]+$/, "");
    // A bare phone number is a person, not a shop worth naming.
    if (/^\+?\d[\d\s-]{6,}$/.test(name)) continue;
    if (name.length >= 2) return name.slice(0, 60);
  }
  return KIND.find((k) => k.hint.test(line))?.label ?? null;
}

/** One line at a time, so a paste of twenty messages is twenty independent reads. */
export function parseMessage(line: string): ParsedMessage | null {
  const text = line.trim();
  if (text.length < 12) return null;

  const provider = PROVIDERS.find((p) => p.hint.test(text));
  const hasVerb = INCOMING.test(text) || OUTGOING.test(text);
  // Must mention money, and either name a provider or use the vocabulary.
  if (!MENTIONS_MONEY.test(text) || (!provider && !hasVerb)) return null;

  return {
    raw: text,
    direction: INCOMING.test(text) ? "in" : "out",
    amount: readAmount(text),
    date: readDate(text),
    shop: readShop(text),
    reference: REFERENCE.exec(text)?.[1]?.toUpperCase() ?? null,
    provider: provider?.name ?? "Mobile money",
  };
}

export function parseMessages(input: string): ParseSummary {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const usable: ParsedMessage[] = [];
  const incoming: ParsedMessage[] = [];
  const unreadable: string[] = [];
  let ignored = 0;

  for (const line of lines) {
    const parsed = parseMessage(line);
    if (!parsed) ignored += 1;
    else if (parsed.direction === "in") incoming.push(parsed);
    else if (parsed.amount === null) unreadable.push(parsed.raw);
    else usable.push(parsed);
  }

  return { usable, incoming, unreadable, ignored };
}

/**
 * The category this shop was last filed under, from the user's own history.
 * Never a model's guess — if the shop is new, the user picks.
 */
export function categoryFromHistory(
  shop: string | null,
  expenses: { shop: string; category: string }[],
): string | null {
  if (!shop) return null;
  const needle = shop.trim().toLowerCase();
  for (let i = expenses.length - 1; i >= 0; i -= 1) {
    if (expenses[i].shop.trim().toLowerCase() === needle) return expenses[i].category;
  }
  return null;
}

/** True when this message is already in the ledger, by transaction reference. */
export function alreadyImported(
  m: ParsedMessage,
  expenses: { reference?: string | null }[],
): boolean {
  if (!m.reference) return false;
  return expenses.some((e) => e.reference === m.reference);
}

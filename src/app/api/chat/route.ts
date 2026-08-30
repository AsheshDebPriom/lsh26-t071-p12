/**
 * The assistant route. Like the receipt route, it exists so the API key stays
 * on the server.
 *
 * The model is given two things: a **digest of facts computed by the engine**,
 * and a set of **typed tools** for things the user might want done. It is told,
 * in the system instruction and again in every tool description, that it must
 * not invent a figure — if something is not in the digest it says so.
 *
 * Tool calls come back as structured `functionCall` parts, so an action is a
 * typed object rather than a sentence that has to be parsed. Nothing here
 * writes to the ledger; the route returns the proposal and the browser asks the
 * user before applying it.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash"];

const MAX_TURNS = 24;
const MAX_CHARS = 2000;

export type ChatApiResponse =
  | { ok: true; text: string; action: unknown | null; model: string }
  | { ok: false; error: string; code: "no_key" | "bad_request" | "upstream" };

/**
 * What the assistant is allowed to do. Every one of these is a *proposal*: the
 * browser renders it as a card and only writes to the store if the user agrees.
 */
const FUNCTIONS = [
  {
    name: "add_expense",
    description:
      "Record a new expense in the ledger. Use when the user says they spent something. Ask for anything you are missing rather than inventing it.",
    parameters: {
      type: "OBJECT",
      properties: {
        amount: { type: "NUMBER", description: "Amount in taka, e.g. 450.50" },
        shop: { type: "STRING", description: "Where it was spent" },
        category: {
          type: "STRING",
          description:
            "One of: Rent, Groceries, Food, Transport, Utilities, Mobile, Health, Education, Entertainment, Clothing",
        },
        date: {
          type: "STRING",
          description:
            "ISO YYYY-MM-DD. If the user says 'today', use the viewing.today value from the digest, never the real-world date.",
        },
      },
      required: ["amount", "shop", "category", "date"],
    },
  },
  {
    name: "add_pocket",
    description: "Create a savings pocket for one specific item.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "Short name, e.g. Laptop" },
        item: { type: "STRING", description: "The specific thing, e.g. MacBook Air M4" },
        target: { type: "NUMBER", description: "Target amount in taka" },
        monthlyContribution: { type: "NUMBER", description: "Amount to set aside each month, in taka" },
      },
      required: ["name", "item", "target", "monthlyContribution"],
    },
  },
  {
    name: "set_pocket_contribution",
    description:
      "Change how much an existing pocket receives each month. The completion date is then re-simulated by the app.",
    parameters: {
      type: "OBJECT",
      properties: {
        pocket: { type: "STRING", description: "The pocket's name, exactly as in the digest" },
        monthlyContribution: { type: "NUMBER", description: "New monthly amount in taka" },
      },
      required: ["pocket", "monthlyContribution"],
    },
  },
  {
    name: "set_salary",
    description: "Set the user's monthly salary.",
    parameters: {
      type: "OBJECT",
      properties: { amount: { type: "NUMBER", description: "Monthly salary in taka" } },
      required: ["amount"],
    },
  },
  {
    name: "set_what_if",
    description:
      "Run the what-if control: cut one category's future spending by a percentage and move every pocket completion date. Only one category at a time.",
    parameters: {
      type: "OBJECT",
      properties: {
        category: { type: "STRING", description: "A category present in the digest" },
        cutPercent: { type: "NUMBER", description: "0 to 100" },
      },
      required: ["category", "cutPercent"],
    },
  },
  {
    name: "clear_what_if",
    description: "Remove any what-if cut and return every figure to the real forecast.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "load_sample_case",
    description:
      "Load one of the 25 published sample cases (PUB-01 to PUB-25), replacing the whole ledger.",
    parameters: {
      type: "OBJECT",
      properties: { caseId: { type: "STRING", description: "e.g. PUB-07" } },
      required: ["caseId"],
    },
  },
  {
    name: "show_tab",
    description: "Open one of the app's screens for the user.",
    parameters: {
      type: "OBJECT",
      properties: {
        tab: { type: "STRING", description: "month, forecast, pockets or log" },
      },
      required: ["tab"],
    },
  },
] as const;

const SYSTEM = `You are the assistant inside "Ledger", a personal money app for a salaried person in Dhaka. You help with this person's own money and with running the app.

THE ONE RULE THAT MATTERS: every figure you state must come from the LEDGER FACTS block you are given. Those numbers were computed by the app's own forecast engine. You must never estimate, extrapolate or invent a money figure, a date or a percentage. If something is not in the facts, say plainly that you do not have it and offer what you do have. Simple arithmetic on two figures that ARE in the facts is fine — say what you subtracted from what.

How to be useful:
- Answer in plain language, short. Two or three sentences is usually right. No headings, no bullet lists unless comparing three or more things.
- Amounts are taka. Write them as ৳1,234. Never invent decimal places the facts do not have.
- When the user asks to change something — record an expense, make a pocket, change a contribution or salary, try a what-if, load a sample case, open a screen — call the matching tool instead of describing what they should click. The app shows them your proposal and they confirm it; you do not need to ask permission first, but you must not pretend it is already done.
- If a tool needs something you were not told, ask one short question for the missing piece rather than guessing. Never guess an amount.
- "Today" is viewing.today in the facts, which is a setting in this app and may not be the real-world date. Use it for any relative date.
- The app is deliberately honest about uncertainty: a pocket that cannot be reached says so rather than showing a far-off date, and a receipt field the reader was unsure of is left blank rather than filled with a guess. Reflect that same honesty.
- You are not a financial adviser. You can point out what the numbers show; do not recommend products, debt, or investments beyond describing the DPS comparison already in the facts.
- If asked something with nothing to do with this person's money or this app, say briefly that you only cover the ledger, and mention one thing you could help with instead.`;

function ok(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function POST(request: Request): Promise<NextResponse<ChatApiResponse>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        ok: false,
        code: "no_key",
        error:
          "The assistant is not configured on this deployment. Set GEMINI_API_KEY and redeploy — every other part of the app works without it.",
      },
      { status: 503 },
    );
  }

  let body: { messages?: { role: string; text: string }[]; digest?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "bad_request", error: "Could not read that request." },
      { status: 400 },
    );
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_TURNS) : [];
  if (messages.length === 0 || !ok(body.digest)) {
    return NextResponse.json(
      { ok: false, code: "bad_request", error: "Nothing to answer." },
      { status: 400 },
    );
  }

  // The facts ride on the first user turn, so the model sees them before
  // anything it is asked, and they are refreshed on every request rather than
  // being remembered from earlier in the conversation.
  const factBlock = `LEDGER FACTS (computed by the app — the only numbers you may quote):\n${JSON.stringify(
    body.digest,
  )}`;

  const contents = messages.map((m, i) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [
      {
        text:
          i === messages.length - 1 && m.role === "user"
            ? `${factBlock}\n\nUser: ${String(m.text).slice(0, MAX_CHARS)}`
            : String(m.text).slice(0, MAX_CHARS),
      },
    ],
  }));

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents,
    tools: [{ functionDeclarations: FUNCTIONS }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
  };

  let lastError = "";

  for (const model of MODELS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25_000);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
      );
      clearTimeout(timer);

      if (!res.ok) {
        lastError = `${model}: ${res.status}`;
        if (res.status === 429 || res.status === 404 || res.status >= 500) continue;
        lastError = `${model}: ${res.status} ${(await res.text()).slice(0, 160)}`;
        continue;
      }

      const json = await res.json();
      const parts = json?.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts)) {
        lastError = `${model}: empty response`;
        continue;
      }

      const text = parts
        .map((p: { text?: unknown }) => (typeof p.text === "string" ? p.text : ""))
        .join("")
        .trim();

      const call = parts.find(
        (p: { functionCall?: unknown }) => ok(p.functionCall) && "name" in p.functionCall,
      )?.functionCall as { name: string; args?: Record<string, unknown> } | undefined;

      const action = call ? { name: call.name, args: call.args ?? {} } : null;

      if (!text && !action) {
        lastError = `${model}: nothing to say`;
        continue;
      }

      return NextResponse.json({ ok: true, text, action, model });
    } catch (e) {
      lastError = `${model}: ${e instanceof Error ? e.message : "request failed"}`;
    }
  }

  return NextResponse.json(
    {
      ok: false,
      code: "upstream",
      error: "The assistant could not be reached. Everything else in the app still works.",
    },
    { status: 502, headers: { "x-upstream-detail": lastError.slice(0, 120) } },
  );
}

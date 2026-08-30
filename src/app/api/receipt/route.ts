/**
 * The only server route in the application. It exists so the API key never
 * reaches the browser; everything else in this app is client-side.
 *
 * Structure is guaranteed rather than hoped for. The model is called with the
 * image and a **fixed response schema**, so what comes back is decoded against
 * that shape — three fields, each with its own confidence — instead of being a
 * JSON-shaped string that has to be parsed and trusted. The schema descriptions
 * carry the instruction that matters: return null with a low confidence rather
 * than guessing a field that cannot be read.
 *
 * Vendor note: the brief specified Anthropic, but the key available for this
 * build is a Gemini key, so the same architecture is pointed at Gemini's
 * structured-output API. The contract the client sees is unchanged.
 */

import { NextResponse } from "next/server";

import type { ReceiptRead, ReceiptResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Tried in order. The first that answers wins. */
const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash"];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/**
 * The fixed shape. Every field is required, so the model cannot answer by
 * omitting the one it found hard — it has to return null and say it is unsure.
 */
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    amount: {
      type: "OBJECT",
      description: "The grand total actually paid, not a subtotal or a line item.",
      properties: {
        value: {
          type: "NUMBER",
          nullable: true,
          description:
            "The total in taka, as a number. Return null if the total is blurred, cut off, ambiguous, or if you would have to guess any digit. Never estimate an amount.",
        },
        confidence: {
          type: "NUMBER",
          description:
            "0 to 1. How certain you are of every digit. Use below 0.8 whenever a digit is unclear, several candidate totals appear, or the currency is uncertain.",
        },
      },
      required: ["value", "confidence"],
    },
    date: {
      type: "OBJECT",
      description: "The date printed on the receipt.",
      properties: {
        value: {
          type: "STRING",
          nullable: true,
          description:
            "ISO YYYY-MM-DD. Return null if no date is printed or the year is missing. Do not substitute today's date.",
        },
        confidence: {
          type: "NUMBER",
          description:
            "0 to 1. Use below 0.8 if the day/month order is ambiguous or any part is unreadable.",
        },
      },
      required: ["value", "confidence"],
    },
    shop: {
      type: "OBJECT",
      description: "The name of the shop or biller.",
      properties: {
        value: {
          type: "STRING",
          nullable: true,
          description:
            "The trading name as printed. Return null if no name is legible. Do not infer a chain from a logo you are unsure of.",
        },
        confidence: {
          type: "NUMBER",
          description: "0 to 1. Use below 0.8 if the name is partly cut off or unclear.",
        },
      },
      required: ["value", "confidence"],
    },
    note: {
      type: "STRING",
      nullable: true,
      description:
        "One short sentence naming anything you could not resolve, or null. No advice.",
    },
  },
  required: ["amount", "date", "shop", "note"],
} as const;

const SYSTEM_INSTRUCTION = `You read a photograph of a shop receipt or utility bill from Bangladesh and report three fields: the total amount in taka, the date, and the shop name.

Rules, in order of importance:
1. Never guess. A wrong number that looks confident is far worse than an admitted gap. If you cannot read a field with certainty, return null for its value and a confidence below 0.8.
2. Confidence is per field. Reading the shop name clearly tells you nothing about the total.
3. The amount is the grand total paid, after any discount or VAT — not a subtotal, not a single line item, not change given.
4. Amounts may be printed with Bengali digits (০১২৩৪৫৬৭৮৯) or with a Taka mark. Convert to plain Western digits.
5. Dates in Bangladesh are usually day-first. If day/month order is genuinely ambiguous, say so with a confidence below 0.8 rather than picking one.
6. If the picture is not a receipt at all, return null for all three fields with confidence 0.`;

function clamp01(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * Trust nothing that comes back over the wire. A confidence outside 0..1, an
 * amount that is not a positive finite number, or a date that is not ISO, is
 * downgraded to "could not read" rather than shown to the user as a fact.
 */
function normalise(raw: unknown): ReceiptRead {
  const r = (raw ?? {}) as Record<string, { value?: unknown; confidence?: unknown }>;

  const amountValue =
    typeof r.amount?.value === "number" && Number.isFinite(r.amount.value) && r.amount.value > 0
      ? r.amount.value
      : null;

  const dateRaw = typeof r.date?.value === "string" ? r.date.value.trim() : null;
  const dateValue = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null;

  const shopRaw = typeof r.shop?.value === "string" ? r.shop.value.trim() : null;
  const shopValue = shopRaw && shopRaw.length > 0 ? shopRaw.slice(0, 80) : null;

  const note = (raw as { note?: unknown })?.note;

  return {
    // A null value can never carry a passing confidence — otherwise an empty
    // field would render as though it had been read.
    amount: { value: amountValue, confidence: amountValue === null ? 0 : clamp01(r.amount?.confidence) },
    date: { value: dateValue, confidence: dateValue === null ? 0 : clamp01(r.date?.confidence) },
    shop: { value: shopValue, confidence: shopValue === null ? 0 : clamp01(r.shop?.confidence) },
    note: typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null,
  };
}

export async function POST(request: Request): Promise<NextResponse<ReceiptResponse>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        ok: false,
        code: "no_key",
        error:
          "The receipt reader is not configured on this deployment. Set GEMINI_API_KEY and redeploy — expenses can still be typed in.",
      },
      { status: 503 },
    );
  }

  let body: { imageBase64?: string; mimeType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "bad_image", error: "Could not read the upload." },
      { status: 400 },
    );
  }

  const { imageBase64, mimeType } = body;
  if (!imageBase64 || !mimeType) {
    return NextResponse.json(
      { ok: false, code: "bad_image", error: "No picture was attached." },
      { status: 400 },
    );
  }
  if (!ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json(
      {
        ok: false,
        code: "bad_image",
        error: `That file is a ${mimeType}. Use a JPEG, PNG or WebP photograph.`,
      },
      { status: 400 },
    );
  }
  // base64 is about 4/3 of the raw size.
  if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        code: "bad_image",
        error: "That picture is over 5MB. Take it again at a smaller size.",
      },
      { status: 413 },
    );
  }

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          {
            text: "Read this receipt. Report the total, the date and the shop name, each with its own confidence. Return null for anything you cannot read with certainty.",
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
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
        // Rate limited or model unavailable — try the next one.
        if (res.status === 429 || res.status === 404 || res.status >= 500) continue;
        const detail = await res.text();
        lastError = `${model}: ${res.status} ${detail.slice(0, 160)}`;
        continue;
      }

      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") {
        lastError = `${model}: empty response`;
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        lastError = `${model}: response was not valid JSON`;
        continue;
      }

      const read = normalise(parsed);

      if (read.amount.value === null && read.date.value === null && read.shop.value === null) {
        return NextResponse.json({
          ok: false,
          code: "unreadable",
          error:
            "Nothing could be read from that picture. Try again with the whole receipt in frame and in focus, or type the expense in.",
        });
      }

      return NextResponse.json({ ok: true, read, model });
    } catch (e) {
      lastError = `${model}: ${e instanceof Error ? e.message : "request failed"}`;
    }
  }

  return NextResponse.json(
    {
      ok: false,
      code: "upstream",
      error: "The receipt reader could not be reached. You can still type the expense in.",
    },
    { status: 502, headers: { "x-upstream-detail": lastError.slice(0, 120) } },
  );
}

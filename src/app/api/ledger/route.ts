/**
 * Ledger backup and restore.
 *
 * Third and last server route, and like the other two it exists so a key never
 * reaches the browser. The Supabase tables have row level security on with no
 * policies, so only the service role can touch them — and that key lives here.
 *
 * This is deliberately **not** the app's source of truth. localStorage is, and
 * stays so: the live URL has to open and work with no setup at all. If Supabase
 * is unconfigured or unreachable, every route below answers honestly and the
 * app carries on exactly as it does without a database.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

const PROJECT_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Guards against a runaway client pushing an unbounded document. */
const MAX_EXPENSES = 5000;
const MAX_POCKETS = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LedgerApiResponse =
  | { ok: true; ledgerId: string; savedAt: string }
  | { ok: true; snapshot: unknown }
  | { ok: false; error: string; code: "not_configured" | "bad_request" | "not_found" | "upstream" };

function notConfigured() {
  return NextResponse.json(
    {
      ok: false as const,
      code: "not_configured" as const,
      error:
        "Backup is not set up on this deployment. Everything else works — your ledger is kept in this browser.",
    },
    { status: 503 },
  );
}

/** Calls a Postgres function through PostgREST with the service role. */
async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${PROJECT_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/* ------------------------------------------------------------------ */
/* Save                                                                */
/* ------------------------------------------------------------------ */

export async function POST(request: Request): Promise<NextResponse<LedgerApiResponse>> {
  if (!PROJECT_URL || !SERVICE_KEY) return notConfigured();

  let body: { ledgerId?: unknown; snapshot?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "bad_request", error: "Could not read that request." },
      { status: 400 },
    );
  }

  const snapshot = body.snapshot as
    | {
        salaryPaisa?: unknown;
        asOfDate?: unknown;
        dpsAnnualRatePercent?: unknown;
        loadedCaseId?: unknown;
        expenses?: unknown;
        pockets?: unknown;
      }
    | undefined;

  if (!snapshot || typeof snapshot !== "object") {
    return NextResponse.json(
      { ok: false, code: "bad_request", error: "Nothing to save." },
      { status: 400 },
    );
  }

  const ledgerId = typeof body.ledgerId === "string" && UUID.test(body.ledgerId)
    ? body.ledgerId
    : null;

  const expenses = Array.isArray(snapshot.expenses) ? snapshot.expenses : [];
  const pockets = Array.isArray(snapshot.pockets) ? snapshot.pockets : [];

  if (expenses.length > MAX_EXPENSES || pockets.length > MAX_POCKETS) {
    return NextResponse.json(
      { ok: false, code: "bad_request", error: "That ledger is larger than this build supports." },
      { status: 413 },
    );
  }
  if (typeof snapshot.asOfDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.asOfDate)) {
    return NextResponse.json(
      { ok: false, code: "bad_request", error: "That ledger has no valid date." },
      { status: 400 },
    );
  }

  try {
    const id = await rpc("save_ledger", {
      payload: {
        ledgerId,
        salaryPaisa: Number(snapshot.salaryPaisa) || 0,
        asOfDate: snapshot.asOfDate,
        dpsAnnualRatePercent: Number(snapshot.dpsAnnualRatePercent) || 8,
        loadedCaseId: typeof snapshot.loadedCaseId === "string" ? snapshot.loadedCaseId : null,
        expenses,
        pockets,
      },
    });

    if (typeof id !== "string" || !UUID.test(id)) {
      throw new Error("save returned no id");
    }
    return NextResponse.json({ ok: true, ledgerId: id, savedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        code: "upstream",
        error: "Could not reach the backup. Your ledger is safe in this browser — try again later.",
      },
      {
        status: 502,
        headers: { "x-upstream-detail": (e instanceof Error ? e.message : "failed").slice(0, 120) },
      },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Restore                                                             */
/* ------------------------------------------------------------------ */

export async function GET(request: Request): Promise<NextResponse<LedgerApiResponse>> {
  if (!PROJECT_URL || !SERVICE_KEY) return notConfigured();

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!UUID.test(id)) {
    return NextResponse.json(
      { ok: false, code: "bad_request", error: "That is not a valid ledger key." },
      { status: 400 },
    );
  }

  try {
    const snapshot = await rpc("load_ledger", { p_id: id });
    if (!snapshot) {
      return NextResponse.json(
        { ok: false, code: "not_found", error: "No ledger is saved under that key." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, snapshot });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        code: "upstream",
        error: "Could not reach the backup. Try again in a moment.",
      },
      {
        status: 502,
        headers: { "x-upstream-detail": (e instanceof Error ? e.message : "failed").slice(0, 120) },
      },
    );
  }
}

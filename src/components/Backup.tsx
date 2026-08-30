"use client";

/**
 * Backup and restore.
 *
 * Opt-in, on purpose. The app's whole posture is being honest about where the
 * money data lives, so it does not quietly start sending a ledger to a server
 * because a server exists. The user asks once, gets a key, and from then on
 * changes are pushed in the background.
 *
 * Nothing here is on the critical path. The forecast, the dashboard and the
 * pockets never wait on it, and if the backup is unconfigured or offline the
 * app behaves exactly as it did before there was a database.
 */

import { useEffect, useRef, useState } from "react";

import { formatDate } from "@/lib/dates";
import {
  buildSnapshot,
  loadLedger,
  saveLedger,
  snapshotSignature,
  type LedgerSnapshot,
} from "@/lib/sync";
import { useLedger } from "@/store/useLedger";

import { Button, Input, Label, Pill, cn } from "./ui";

/** How long to wait after the last edit before pushing a change. */
const QUIET_MS = 1500;

/**
 * Mounted once, high in the tree. Watches the ledger and pushes changes once
 * backup has been turned on — never before.
 */
export function useAutoBackup() {
  const salary = useLedger((s) => s.salary);
  const settings = useLedger((s) => s.settings);
  const expenses = useLedger((s) => s.expenses);
  const pockets = useLedger((s) => s.pockets);
  const ledgerId = useLedger((s) => s.ledgerId);
  const hydrated = useLedger((s) => s.hydrated);

  const signature = ledgerId
    ? snapshotSignature(buildSnapshot(salary, settings, expenses, pockets))
    : "";
  const lastPushed = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || !ledgerId || !signature) return;
    // The first signature after a restore or a page load is already what the
    // server holds, so it is recorded rather than pushed back.
    if (lastPushed.current === null) {
      lastPushed.current = signature;
      return;
    }
    if (lastPushed.current === signature) return;

    const handle = setTimeout(async () => {
      const store = useLedger.getState();
      store.setSyncStatus({ state: "saving" });
      const snapshot = buildSnapshot(
        store.salary,
        store.settings,
        store.expenses,
        store.pockets,
      );
      const res = await saveLedger(snapshot, store.ledgerId);
      if (res.ok) {
        lastPushed.current = snapshotSignature(snapshot);
        store.setBackupKey(res.ledgerId, res.savedAt);
        store.setSyncStatus({ state: "saved", at: res.savedAt });
      } else {
        store.setSyncStatus(
          res.code === "not_configured"
            ? { state: "off", reason: res.error }
            : { state: "error", reason: res.error },
        );
      }
    }, QUIET_MS);

    return () => clearTimeout(handle);
  }, [signature, ledgerId, hydrated]);
}

/** A one-line status, shown in the sidebar so the state is never a mystery. */
export function BackupStatus({ className }: { className?: string }) {
  const status = useLedger((s) => s.syncStatus);
  const ledgerId = useLedger((s) => s.ledgerId);

  if (!ledgerId) return null;

  const label =
    status.state === "saving"
      ? "Backing up…"
      : status.state === "saved"
        ? "Backed up"
        : status.state === "off"
          ? "Backup unavailable"
          : status.state === "error"
            ? "Backup failed — kept locally"
            : "Backup on";

  return (
    <p className={cn("flex items-center gap-1.5 text-[10.5px] leading-none", className)}>
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status.state === "error" || status.state === "off"
            ? "bg-out"
            : status.state === "saving"
              ? "animate-pulse bg-ink-3"
              : "bg-in",
        )}
      />
      <span className="text-ink-3">{label}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ */

export function BackupSection() {
  const salary = useLedger((s) => s.salary);
  const settings = useLedger((s) => s.settings);
  const expenses = useLedger((s) => s.expenses);
  const pockets = useLedger((s) => s.pockets);
  const ledgerId = useLedger((s) => s.ledgerId);
  const lastSavedAt = useLedger((s) => s.lastSavedAt);
  const status = useLedger((s) => s.syncStatus);
  const setBackupKey = useLedger((s) => s.setBackupKey);
  const setSyncStatus = useLedger((s) => s.setSyncStatus);
  const applySnapshot = useLedger((s) => s.applySnapshot);

  const [busy, setBusy] = useState(false);
  const [restoreKey, setRestoreKey] = useState("");
  const [message, setMessage] = useState<{ tone: "in" | "out"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function backUpNow() {
    setBusy(true);
    setMessage(null);
    setSyncStatus({ state: "saving" });
    const snapshot: LedgerSnapshot = buildSnapshot(salary, settings, expenses, pockets);
    const res = await saveLedger(snapshot, ledgerId);
    if (res.ok) {
      setBackupKey(res.ledgerId, res.savedAt);
      setSyncStatus({ state: "saved", at: res.savedAt });
      setMessage({
        tone: "in",
        text: ledgerId
          ? "Saved. Changes from here on are backed up automatically."
          : "Backed up. Keep the key below — it is the only way to bring this ledger back.",
      });
    } else {
      setSyncStatus(
        res.code === "not_configured"
          ? { state: "off", reason: res.error }
          : { state: "error", reason: res.error },
      );
      setMessage({ tone: "out", text: res.error });
    }
    setBusy(false);
  }

  async function restore() {
    const key = restoreKey.trim();
    if (!key) return;
    if (
      ledgerId &&
      !window.confirm(
        "Restoring replaces every expense and pocket in this browser with the saved ledger. Continue?",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await loadLedger(key);
    if (res.ok) {
      applySnapshot(res.snapshot);
      setSyncStatus({ state: "saved", at: res.snapshot.updatedAt });
      setMessage({
        tone: "in",
        text: `Restored ${res.snapshot.expenses.length} expenses and ${res.snapshot.pockets.length} pockets.`,
      });
      setRestoreKey("");
    } else {
      setMessage({ tone: "out", text: res.error });
    }
    setBusy(false);
  }

  const unavailable = status.state === "off";

  return (
    <div className="border-t border-rule pt-4">
      <div className="flex items-center justify-between gap-3">
        <Label>Backup</Label>
        {ledgerId ? (
          <Pill tone={status.state === "error" ? "out" : "in"}>
            {status.state === "saving" ? "saving…" : "on"}
          </Pill>
        ) : (
          <Pill>this browser only</Pill>
        )}
      </div>

      <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
        {ledgerId
          ? "Changes are saved automatically. The key below restores this ledger on another device."
          : "Your ledger lives in this browser and nowhere else. Backing it up saves a copy so it survives a lost phone — nothing is sent until you ask."}
      </p>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button variant={ledgerId ? "secondary" : "primary"} onClick={backUpNow} disabled={busy}>
          {busy ? "Working…" : ledgerId ? "Save now" : "Back up this ledger"}
        </Button>
        {ledgerId ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Stop backing up? The saved copy stays on the server and the key keeps working — this browser just stops sending changes.",
                )
              ) {
                setBackupKey(null, null);
                setSyncStatus({ state: "idle" });
                setMessage(null);
              }
            }}
          >
            Turn off
          </Button>
        ) : null}
      </div>

      {ledgerId ? (
        <div className="mt-3 rounded-lg bg-sunk px-3 py-2.5">
          <p className="eyebrow">Your ledger key</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="tnum min-w-0 flex-1 truncate text-[12px] text-ink">{ledgerId}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(ledgerId);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                } catch {
                  setMessage({ tone: "out", text: "Could not copy — select the key and copy it." });
                }
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
            Anyone with this key can read and replace this ledger, so treat it like a
            password. There are no accounts in this build.
            {lastSavedAt ? ` Last saved ${formatDate(lastSavedAt.slice(0, 10), "long")}.` : ""}
          </p>
        </div>
      ) : null}

      <div className="mt-3">
        <Label htmlFor="restore-key">Restore from a key</Label>
        <div className="mt-1.5 flex gap-2">
          <Input
            id="restore-key"
            placeholder="00000000-0000-0000-0000-000000000000"
            value={restoreKey}
            onChange={(e) => setRestoreKey(e.target.value)}
            className="text-[12.5px]"
          />
          <Button variant="secondary" onClick={restore} disabled={busy || !restoreKey.trim()}>
            Restore
          </Button>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">
          This replaces everything currently in this browser.
        </p>
      </div>

      {message ? (
        <p
          className={cn(
            "mt-3 rounded-lg px-3 py-2 text-[12px] leading-snug",
            message.tone === "in" ? "bg-in-soft text-in" : "bg-out-soft text-out",
          )}
        >
          {message.text}
        </p>
      ) : null}

      {unavailable ? (
        <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
          Backup needs <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> set
          on the deployment. Without them the app is unaffected — it simply keeps everything
          in this browser.
        </p>
      ) : null}
    </div>
  );
}

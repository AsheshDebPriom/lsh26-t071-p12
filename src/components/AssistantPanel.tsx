"use client";

/**
 * The assistant.
 *
 * It answers questions about this person's own money and it can do things in
 * the app — record an expense, create a pocket, change a contribution, run a
 * what-if, load a sample case, open a screen.
 *
 * Two properties make it safe enough to put next to someone's money:
 *
 *  - **Every figure it quotes was computed here, not there.** Each request
 *    carries a digest built by the same forecast and pocket simulation that
 *    draw the screens, and the model is told it may not invent a number.
 *  - **It cannot write to the ledger.** It returns a *typed proposal*, which is
 *    rendered as a card with Apply and Discard. The store is only ever written
 *    by this component, after the user says yes.
 *
 * Navigation is the one exception: opening a screen changes nothing, so it
 * happens immediately.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import {
  buildDigest,
  describeAction,
  needsConfirmation,
  parseAction,
  type ChatMessage,
  type ProposedAction,
} from "@/lib/assistant";
import type { Forecast } from "@/lib/forecast";
import type { PocketSimulation } from "@/lib/pockets";
import { useLedger } from "@/store/useLedger";
import type { Expense, Pocket, PublishedCase } from "@/lib/types";

import { Button, cn } from "./ui";

const SUGGESTIONS = [
  "Where is my money actually going?",
  "Can I afford the laptop sooner?",
  "I spent 420 taka on a CNG today",
  "What happens if I cut Food by 30%?",
];

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}-${(seq += 1).toString(36)}`;

export function AssistantPanel({
  fc,
  sim,
  pockets,
  expenses,
  onNavigate,
}: {
  fc: Forecast;
  sim: PocketSimulation;
  pockets: Pocket[];
  expenses: Expense[];
  onNavigate: (tab: "month" | "forecast" | "pockets" | "log") => void;
}) {
  const dpsRate = useLedger((s) => s.settings.dpsAnnualRatePercent);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const reduced = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;

    const mine: ChatMessage = { id: nextId(), role: "user", text };
    const history = [...messages, mine];
    setMessages(history);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, text: m.text })),
          digest: buildDigest(fc, sim, pockets, expenses, dpsRate),
        }),
      });
      const json = await res.json();

      if (!json.ok) {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", text: json.error, error: true },
        ]);
        return;
      }

      const action = parseAction(json.action);

      // Navigation changes nothing, so it just happens.
      if (action && !needsConfirmation(action)) {
        applyAction(action);
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            text: json.text || describeAction(action),
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          text: json.text,
          action: action ?? undefined,
          actionState: action ? "pending" : undefined,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          text: "That did not go through. Check your connection and try again — nothing else in the app depends on this.",
          error: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  /** The only place the assistant's intent reaches the store. */
  function applyAction(a: ProposedAction) {
    const s = useLedger.getState();
    switch (a.kind) {
      case "add_expense":
        s.addExpense({
          amount: a.amount,
          date: a.date,
          shop: a.shop,
          category: a.category,
          source: "manual",
        });
        break;
      case "add_pocket":
        s.addPocket({
          name: a.name,
          item: a.item,
          target: a.target,
          monthlyContribution: a.monthlyContribution,
        });
        break;
      case "set_pocket_contribution": {
        const match = s.pockets.find(
          (p) => p.name.toLowerCase() === a.pocket.toLowerCase(),
        );
        if (match) s.updatePocket(match.id, { monthlyContribution: a.monthlyContribution });
        break;
      }
      case "set_salary":
        s.setSalary(a.amount);
        break;
      case "set_what_if":
        s.clearAdjustments();
        s.setAdjustment(a.category, a.cutPercent);
        onNavigate("pockets");
        break;
      case "clear_what_if":
        s.clearAdjustments();
        break;
      case "load_sample_case":
        void loadCaseById(a.caseId, s.loadCase);
        break;
      case "show_tab":
        onNavigate(a.tab);
        break;
    }
  }

  /**
   * Clears the conversation only. Anything already applied is in the ledger and
   * stays there — this is a fresh chat, not an undo, and the empty state says so
   * by simply offering the suggestions again.
   */
  function resetChat() {
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  /**
   * Applying happens *before* the state update, never inside it. A setState
   * updater has to be pure — React is free to call it more than once — and
   * writing the ledger from inside one records the expense twice.
   */
  function decide(id: string, apply: boolean) {
    const target = messages.find(
      (m) => m.id === id && m.action && m.actionState === "pending",
    );
    if (!target?.action) return;

    if (apply) applyAction(target.action);

    setMessages((prev) =>
      prev.map((m) =>
        m.id === id && m.actionState === "pending"
          ? { ...m, actionState: apply ? "applied" : "discarded" }
          : m,
      ),
    );
  }

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 120);
        }}
        aria-expanded={open}
        aria-label={open ? "Close the assistant" : "Ask the assistant"}
        className={cn(
          "fixed z-40 flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-white shadow-lift-3",
          "transition-transform hover:scale-[1.03] active:scale-95",
          "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 lg:bottom-6 lg:right-6",
        )}
      >
        <span aria-hidden className="text-[15px] leading-none">
          {open ? "✕" : "✦"}
        </span>
        <span className="text-[13px] font-medium leading-none">
          {open ? "Close" : "Ask"}
        </span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.aside
            role="dialog"
            aria-label="Assistant"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: reduced ? 0 : 0.18, ease: [0.22, 0.9, 0.3, 1] }}
            className={cn(
              "fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-rule bg-surface shadow-lift-3",
              "inset-x-3 bottom-[calc(8rem+env(safe-area-inset-bottom))] top-16",
              "sm:inset-x-auto sm:right-4 sm:top-auto sm:h-[min(34rem,calc(100dvh-9rem))] sm:w-[24rem]",
              "sm:bottom-[calc(8rem+env(safe-area-inset-bottom))] lg:bottom-24 lg:right-6 lg:w-[26rem]",
            )}
          >
            <header className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold tracking-tight text-ink">
                  Ask about your money
                </p>
                <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
                  Answers come from your own figures. Anything that changes the ledger is
                  shown to you first.
                </p>
              </div>
              {messages.length > 0 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  disabled={busy}
                  onClick={resetChat}
                  title="Clear this conversation. Anything already applied stays in your ledger."
                >
                  New chat
                </Button>
              ) : null}
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <div>
                  <p className="text-[12.5px] leading-relaxed text-ink-2">
                    I can read your month and change things for you. Try one of these:
                  </p>
                  <div className="mt-2.5 space-y-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="w-full rounded-lg border border-rule bg-sunk px-3 py-2 text-left text-[12.5px] text-ink-2 transition-colors hover:bg-surface hover:text-ink"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((m) => (
                <Bubble key={m.id} message={m} onDecide={decide} />
              ))}

              {busy ? (
                <div className="flex items-center gap-2 text-[12.5px] text-ink-3" aria-live="polite">
                  <span className="flex gap-1" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-3"
                        style={{ animationDelay: `${i * 140}ms` }}
                      />
                    ))}
                  </span>
                  Reading your ledger…
                </div>
              ) : null}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="border-t border-rule p-3"
            >
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  placeholder="Ask, or tell me what you spent…"
                  aria-label="Message the assistant"
                  className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-lg border border-rule-strong bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-3/70"
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={busy || input.trim().length === 0}
                >
                  Send
                </Button>
              </div>
            </form>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Bubble({
  message,
  onDecide,
}: {
  message: ChatMessage;
  onDecide: (id: string, apply: boolean) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3 py-2 text-[13px] leading-relaxed text-white">
          {message.text}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {message.text ? (
        <p
          className={cn(
            "max-w-[92%] rounded-2xl rounded-bl-md px-3 py-2 text-[13px] leading-relaxed",
            message.error ? "bg-out-soft text-out" : "bg-sunk text-ink",
          )}
        >
          {message.text}
        </p>
      ) : null}

      {message.action ? (
        <div
          className={cn(
            "rounded-xl border px-3 py-2.5",
            message.actionState === "applied"
              ? "border-in/30 bg-in-soft"
              : message.actionState === "discarded"
                ? "border-rule bg-sunk"
                : "border-rule-strong bg-surface shadow-lift-1",
          )}
        >
          <p className="eyebrow">
            {message.actionState === "applied"
              ? "Done"
              : message.actionState === "discarded"
                ? "Discarded"
                : "Wants to"}
          </p>
          <p
            className={cn(
              "mt-1.5 text-[12.5px] leading-snug",
              message.actionState === "discarded" ? "text-ink-3 line-through" : "text-ink",
            )}
          >
            {describeAction(message.action)}
          </p>

          {message.actionState === "pending" ? (
            <div className="mt-2.5 flex gap-2">
              <Button size="sm" variant="primary" onClick={() => onDecide(message.id, true)}>
                Apply
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onDecide(message.id, false)}>
                Discard
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Sample cases live in a fetched fixture, so this one action is async. */
async function loadCaseById(
  caseId: string,
  load: (c: PublishedCase) => void,
): Promise<void> {
  try {
    const res = await fetch("/sample-data/P12_personal_ledger_public.json");
    if (!res.ok) return;
    const json = (await res.json()) as { cases: PublishedCase[] };
    const found = json.cases.find((c) => c.case_id === caseId);
    if (found) load(found);
  } catch {
    // Silent: the confirm card already said what was meant to happen, and the
    // Setup sheet is always available as the manual path.
  }
}

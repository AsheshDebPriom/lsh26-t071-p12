"use client";

/**
 * The small set of primitives the whole interface is built from.
 *
 * Amounts are the loudest thing on any screen they appear on and labels stay
 * quiet, so every figure goes through <Taka> — tabular lining numerals, and the
 * currency mark set smaller than the digits so columns line up.
 */

import { motion, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useEffect, type ReactNode } from "react";

import { formatAmount, type Paisa } from "@/lib/money";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

type TakaProps = {
  value: Paisa;
  decimals?: 0 | 2;
  /** Show a leading + or − even when positive. */
  signed?: boolean;
  className?: string;
};

export function Taka({ value, decimals = 0, signed = false, className }: TakaProps) {
  const negative = value < 0;
  const sign = negative ? "−" : signed ? "+" : "";
  return (
    <span className={cn("tnum whitespace-nowrap", className)}>
      {sign}
      <span className="taka">৳</span>
      {formatAmount(value, decimals)}
    </span>
  );
}

/**
 * The same figure, but it travels to a new value instead of snapping.
 *
 * Used where a number moves because the user moved something — the what-if
 * slider, a changed contribution — so that cause and effect are felt.
 */
export function AnimatedTaka({ value, decimals = 0, signed = false, className }: TakaProps) {
  const reduced = useReducedMotion();
  const spring = useSpring(value, { stiffness: 220, damping: 30, mass: 0.6 });
  // The sign has to sit outside the currency mark, so a positive surplus reads
  // "+৳0" and not "৳+0".
  const sign = useTransform(spring, (v): string =>
    Math.round(v) < 0 ? "−" : signed ? "+" : "",
  );
  const digits = useTransform(spring, (v) => formatAmount(Math.round(v), decimals));

  useEffect(() => {
    if (reduced) spring.jump(value);
    else spring.set(value);
  }, [value, spring, reduced]);

  return (
    <span className={cn("tnum whitespace-nowrap", className)}>
      <motion.span>{sign}</motion.span>
      <span className="taka">৳</span>
      <motion.span>{digits}</motion.span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className,
  as: As = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "li" | "article";
}) {
  return (
    <As
      className={cn(
        "rounded-xl border border-rule bg-surface shadow-[0_1px_2px_rgba(26,24,23,0.04)]",
        className,
      )}
    >
      {children}
    </As>
  );
}

export function CardHead({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{hint}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3"
    >
      {children}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors " +
    "disabled:cursor-not-allowed disabled:opacity-45";
  const sizes = {
    sm: "h-8 px-2.5 text-[12px]",
    md: "h-10 px-3.5 text-[13px]",
  };
  const variants = {
    primary: "bg-ink text-white hover:bg-ink/90 active:bg-ink",
    secondary: "border border-rule-strong bg-surface text-ink hover:bg-sunk",
    ghost: "text-ink-2 hover:bg-sunk hover:text-ink",
    danger: "border border-out/30 bg-surface text-out hover:bg-out-soft",
  };
  return <button className={cn(base, sizes[size], variants[variant], className)} {...rest} />;
}

export function Input({
  className,
  invalid,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-lg border bg-surface px-3 text-[15px] text-ink",
        "placeholder:text-ink-3/70 tnum",
        invalid ? "border-out" : "border-rule-strong",
        className,
      )}
      {...rest}
    />
  );
}

export function Select({
  className,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full appearance-none rounded-lg border border-rule-strong bg-surface px-3",
        "text-[15px] text-ink",
        className,
      )}
      {...rest}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Deltas — never colour alone: every one carries an arrow and a sign.  */
/* ------------------------------------------------------------------ */

export function Delta({
  value,
  decimals = 0,
  /** For spending, up is bad. For money kept, up is good. */
  upIsBad = true,
  suffix,
  className,
}: {
  value: Paisa;
  decimals?: 0 | 2;
  upIsBad?: boolean;
  suffix?: string;
  className?: string;
}) {
  if (value === 0) {
    return (
      <span className={cn("tnum text-[12px] text-ink-3", className)}>
        no change{suffix ? ` ${suffix}` : ""}
      </span>
    );
  }
  const up = value > 0;
  const bad = up === upIsBad;
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-1 text-[12px] font-medium",
        bad ? "text-out" : "text-in",
        className,
      )}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      <Taka value={Math.abs(value)} decimals={decimals} />
      {suffix ? <span className="font-normal text-ink-3">{suffix}</span> : null}
    </span>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "in" | "out" | "uncertain";
  className?: string;
}) {
  const tones = {
    neutral: "border-rule bg-sunk text-ink-2",
    in: "border-in/25 bg-in-soft text-in",
    out: "border-out/25 bg-out-soft text-out",
    uncertain: "border-uncertain-rule bg-uncertain-soft text-uncertain",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="text-[14px] font-medium text-ink">{title}</p>
      <p className="max-w-xs text-[13px] leading-relaxed text-ink-3">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-sunk", className)} />;
}

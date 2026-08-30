# Ledger — Personal Ledger Manager

**Team ID:** LSH26-T071 · **Problem ID:** P12 · **Repository:** `lsh26-t071-p12`

**Live URL: <https://lsh26-t071-p12.vercel.app>** — opens with two months of real
spending already in it. Nothing to set up, no sign-in.

---

## What it does

A salaried person in Dhaka knows what comes in and not where it goes. This records
spending with as little typing as possible, shows where the money went, says what
the rest of the month looks like, and puts a real date on each savings goal.

Four screens:

| Tab | What it answers |
|---|---|
| **Month** | What have I spent, against my salary, on what, and how does it compare with last month? |
| **Forecast** | What will the rest of this month cost, where do I finish, and what should I actually do about it? |
| **Pockets** | When do I get the laptop, and what would a DPS have done with the same money? |
| **Log** | Everything I have recorded. Tap any row to fix it. |

There is also an **assistant** on every screen. It answers questions about your
own month and it can do things for you — record an expense, create a pocket,
change a contribution, run a what-if, load a sample case, open a screen.

Add an expense by photographing the receipt, or by typing four fields.

---

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
```

The app is fully usable with no configuration — the sample ledger, the dashboard,
the forecast, the insights and the pockets all work offline with no key.

One environment variable enables the receipt camera:

```
GEMINI_API_KEY=<your Google AI Studio key>
```

Put it in `.env.local` for local development, or in the deployment's environment
variables. It is read **only** on the server, inside `src/app/api/receipt/route.ts`,
and never reaches the browser. Without it, that route answers with a clear message
and the "type it in" path continues to work.

Other commands:

```bash
npm run build          # production build
npm run typecheck      # tsc --noEmit
npm run check          # runs the engine over all 25 published cases + asserts the constraints
npm run check PUB-07   # one case in full: categories, monthly charges, insights, pockets, DPS
npx eslint src scripts
```

`npm run check` is the fastest way to audit the numbers. It prints a line per case
and fails loudly if any invariant breaks.

---

## Proof that each requirement is met

Figures below are from the ledger as it opens (published case **PUB-01**, salary
৳50,000, viewed as of 17 April 2026). Anyone can reproduce them with `npm run check PUB-01`.

### R1 — Salary, expenses, and reading a photographed receipt

*Setup → salary. Add → "Type it in" or "Photograph a receipt".*
`src/components/ReceiptFlow.tsx`, `src/app/api/receipt/route.ts`, `src/components/ExpenseForm.tsx`

The reader is called with the image and a **fixed response schema**, so the three
fields and their per-field confidences are decoded against that shape rather than
parsed out of a hopeful JSON string. What came back is shown beside the photograph,
and every field is editable before saving.

Checked against two receipts during the build:

| Receipt | Amount | Date | Shop |
|---|---|---|---|
| Clear supermarket bill | **2546.50** at 1.00 — correctly the grand total, not the ৳2,665 subtotal or the VAT line | `2026-04-11` at 0.95, from a day-first `11/04/2026` | `MEENA BAZAR` at 1.00 |
| Creased, smeared, total obscured | **null at 0.00** — left blank, not guessed | null at 0.00 | `SHWAPNO` at 1.00 |

The second row is the point. See the constraint section below.

### R2 — Monthly dashboard

*Month tab.* `src/components/DashboardTab.tsx`

- **Total spent against salary** — ৳27,083 of ৳50,000 (54%), with a three-part meter: spent, the ৳12,971 still forecast (hatched), and what remains.
- **Breakdown by category** — every category ranked, each bar carrying a thin mark at that category's whole total for March, so "below last month with 13 days to go" is visible at a glance.
- **Largest expenses** — the five biggest, with dates and categories. Here they are 80% of the month.
- **Change against last month** — given two ways, because only one of them is fair: the same 17 days of both months side by side (৳27,083 against ৳32,573, 17% below), and the whole month once the forecast plays out (৳40,054 against ৳43,536). Then a per-category delta list.

### R3 — Forecast and written insights

*Forecast tab.* `src/lib/forecast.ts`, `src/lib/insights.ts`, `src/components/ForecastTab.tsx`

- **Expected spending for the rest of the month** — ৳12,971 over the last 13 days, broken down by category, of which ৳2,474 is monthly charges that have not landed yet and the rest is day-to-day spending.
- **Expected money left or short at month end** — ৳9,946 clear.
- **Insights** — ten templates are tried, each firing with computed values or returning nothing, and the ones that fire are ranked by how much money each is about. All ten fire on the opening ledger. Six of them:

  > At your current rate you will end April with ৳9,946 clear — ৳40,054 spent against a ৳50,000 salary.
  > Your pockets ask for ৳41,000 a month but the forecast leaves ৳2,658, so ৳38,342 of contributions goes unfunded.
  > Mobile is on track for ৳4,921 this month, 352% above March's ৳1,089 — ৳3,832 more.
  > Groceries is down to ৳2,688, 67% below March's ৳8,260 — ৳5,572 kept.
  > Your three largest expenses — Landlord ৳16,000, DESCO ৳2,600, Star Cineplex ৳1,326 — account for 74% of the ৳27,083 spent this month.
  > ৳22,311 of your month is fixed — Landlord, DESCO, Popular Diagnostic and 2 more — which is 45% of salary before you buy anything.

  Every one names a category or a shop and an amount. None is generic advice.

- The **"How the forecast is built"** card states the whole method on screen and lists every monthly charge the model found, with whether it has already been paid.

### R4 — Savings pockets

*Pockets tab.* `src/lib/pockets.ts`, `src/components/PocketsTab.tsx`

Each pocket has a name, an item, a target and a monthly contribution. As the ledger
opens:

| Pocket | Item | Target | Each month | **Date from the forecast** | target ÷ contribution would say | DPS at 8.00% |
|---|---|---|---|---|---|---|
| Wedding | reception hall booking | ৳300,000 | ৳20,000 | **28 Feb 2034** (95 months) | 15 months | ৳423,184.20, of which ৳123,184.20 interest; hits ৳300,000 in Apr 2032, 22 months earlier |
| Laptop | MacBook Air M4 | ৳145,000 | ৳12,000 | **31 Jan 2038** (142 months) | 13 months | ৳171,616.74, of which ৳26,616.74 interest |
| Bike | Honda Livo | ৳150,000 | ৳9,000 | **31 Jan 2042** (190 months) | 17 months | ৳178,276.52, of which ৳28,276.52 interest |

The gap between columns five and six is the whole point, and the app prints both
side by side rather than asking to be believed.

---

## The four constraints

### 1. An unsure field is shown as unsure, and an amount is never guessed

The threshold is **0.8**, and it is the single most visible thing in the app.

- At or above it: the field is pre-filled and labelled with what was read and how sure the reader was.
- Below it: the box renders **empty**, outlined in the reserved amber, saying *"could not be read"* and *"left blank on purpose — the reader was not sure enough to fill this in."*

An amount below the threshold is never pre-filled. The photograph stays on screen
beside the fields so the figure can be checked against the paper, and **Save stays
disabled until all three fields are confirmed by hand** — the button counts them
down for you.

Two server-side guards back this up: a field whose value fails validation is
downgraded to "could not read" rather than shown as a fact, and a `null` value can
never carry a passing confidence, so an empty field can never render as though it
had been read.

That amber (`#b5730a`) is reserved. It appears nowhere else in the application.

### 2. The insights change when the numbers change

They are functions of the figures. There is no stored advice and no model-written
text anywhere in the insight path — each template either fires with computed values
or returns `null`, and the ones that fire are ranked by materiality.

`npm run check` proves it rather than claiming it: **editing one expense by ৳9,000
rewrites 8 of the 10 insights.** Try it in the app — Log → tap a row → change the
amount → Forecast.

### 3. Pocket dates come from the forecast, not from division

There is no `target / monthlyContribution` in `src/lib/pockets.ts`. A date is
produced by running the calendar forward, month by month, handing each pocket only
the surplus the forecast actually predicts — projected salary, minus projected
spending, minus whatever the pockets ahead of it in priority already took. When a
month is short the contribution is capped at what is really there and the date
slips; when a pocket finishes, the money it was taking frees up for the ones behind
it and their dates pull in.

**Why it matters.** Division says the Wedding pocket takes 15 months. It takes 95,
because ৳41,000 a month of contributions is being funded out of a ৳2,658 surplus.
Division would have promised this person a wedding in 2027 that the arithmetic puts
in 2034. Across all 25 published cases the simulation puts **24 dates later than
division would, and reports 15 pockets as not reachable at all** instead of
inventing a date for them.

It is also why the what-if slider works: cutting a category raises the surplus in
every future month, so more money reaches the pockets and the dates pull in on the
same frame as the drag.

### 4. The DPS rate and how interest is added

**8.00% a year by default, compounded monthly**, with the contribution deposited at
the start of each month. The rate is printed on screen next to every DPS figure, not
only here, and it is editable in Setup because the published cases carry rates from
7.50% to 10.00%.

Each month, in this order:

```
balance  = balance + deposit
interest = balance × rate ÷ 12 ÷ 100     rounded half up to the paisa
balance  = balance + interest            so later months earn on the interest too
```

This follows the published `dps_rule` in the fixture exactly. All money in this app
is an **integer number of paisa** — never a float — because that rule rounds every
month and floating point would drift over a 190-month simulation. The rounding is
done on integers (`Math.floor((n + 60000) / 120000)`), not by nudging a float, and
`scripts/check.ts` checks it against hand-worked values: ৳1,000 at 8.00% earns
৳6.67 in month one and ৳13.38 in month two, and a figure landing exactly on half a
paisa rounds up rather than to even.

The comparison uses the deposits the simulation **actually funds**, not the
contributions the user asked for — comparing against money this person does not
have would flatter the result.

---

## Sample data

All 25 published P12 cases ship in `public/sample-data/P12_personal_ledger_public.json`,
committed unmodified.

- **Loading one:** Setup → *Show the 25 cases* → pick one. It replaces the salary, expenses, pockets, DPS rate and the date being viewed with that case's own values.
- **Restoring the start state:** Setup → *Restore the sample ledger* (this is PUB-01, exactly as a first visit).
- **Starting clean:** Setup → *Clear everything*.

Each case carries its own `today`, which is why the app treats "today" as a
**setting** rather than reading the clock. A case dated April 2026 judged from a
machine whose clock says August would otherwise compute the entire forecast against
the wrong month. The date being viewed is always shown in the header.

---

## How the forecast works

Spending splits into two kinds.

**Monthly charges.** A shop that billed once last month for a material amount —
rent, the DESCO bill, a subscription. If it has already been paid this month it adds
nothing more; if it has not, and it is big enough that a month without it would be
the surprise, it is expected once before month end. If it is well past its usual
date it is treated as skipped rather than pretended into the forecast.

**Day-to-day spending.** Everything else, projected from a daily rate that blends
this month with last month, weighted by *how much of the month has actually
happened*. On the 3rd, four days of data say very little and last month carries the
projection; by the 28th this month has told us nearly everything.

Separating the two is not a nicety. Rent is the largest line in the fixture and is
always paid in the first days of the month. A plain daily-rate extrapolation on the
17th would forecast ৳16,000 of rent as ৳28,000 — and every pocket date downstream
would be wrong. `scripts/check.ts` asserts on all 25 cases that rent is never
extrapolated past one month, and that a projected whole month lands between 0.75×
and 1.30× of last month's actual (measured: 0.90× to 1.22×, median 1.08×).

The forecast is a pure function. It takes the expense list, the salary, the what-if
adjustments and the date, and returns a value — no clock, no state, no I/O. That is
why it can be recomputed on every drag event with no debounce and no memoisation,
and why its output is reproducible for any published case.

---

## Bonus features

All four required items work, so all three bonuses were built:

1. **The what-if control** (Forecast and Pockets tabs). Pick a category, drag, and every completion date under the slider moves with it. On the opening ledger a 60% cut moves Wedding from 2034 to 2028, Laptop from 2038 to 2029 and Bike from 2042 to 2030. The cut applies to *future* spending only — money already spent cannot be un-spent, which is why cutting Rent barely moves the month in progress but moves every month after it.
2. **Live contribution editing.** Each pocket card has a contribution slider that moves its own date as the thumb moves.
3. **Automatic recurring detection.** A shop billing in two consecutive months within 15% on the amount is marked `recurring` in the log and in the monthly-charges list. The forecast uses a deliberately wider notion of a monthly charge than this badge does, since a utility bill recurs monthly while varying far more than 15%.

---

## The assistant

Ask it anything about your money, or just tell it what you spent.

> **"I spent 420 taka on a CNG today"** → *Wants to: record ৳420 at CNG (Transport) on 17 April 2026.* → Apply
> **"Where is my money going?"** → *"So far this month you have spent ৳27,083, with another ৳12,971 expected over the remaining 13 days. Your three largest expenses — Landlord ৳16,000, DESCO ৳2,600, Star Cineplex ৳1,326 — account for 74% of what you have spent."*

Two properties make it safe to put beside someone's money, and both are the same
discipline as the receipt reader:

**It never computes a figure.** Every request carries a *digest* built by the
same `forecast()` and `simulatePockets()` that draw the screens — the month, the
categories, the monthly charges, the pockets with their simulated dates and DPS
figures, the written insights. The model quotes from that and is told it may not
estimate. Asked for something outside it, it says so:

> **"How much did I spend on Groceries in January 2025?"** → *"I do not have your spending figures for January 2025. I can tell you that for Groceries this month you have spent ৳547, and the projected month total is ৳2,688."*

**It cannot write to your ledger.** It returns a *typed tool call*, which is
validated (`parseAction` in `src/lib/assistant.ts` — an amount must be a
positive finite number, a date must be ISO, a case id must match `PUB-nn`) and
then rendered as a card with **Apply** and **Discard**. The store is only ever
written by the browser, after you agree. Opening a screen is the one exception,
because it changes nothing.

It asks rather than guesses, exactly as the receipt reader does:

> **"I bought something at Agora"** → *"How much was the Agora purchase, and what category was it (for example, Groceries)?"*

**The insight engine is untouched by any of this.** Requirement 3's sentences are
still templates over computed values, with no model text anywhere on that path.
The assistant is an extra way in, not a replacement for it — and the whole app
works without it if `GEMINI_API_KEY` is unset.

## Major decisions

**Integer paisa for all money.** The published DPS rule rounds half up to the paisa
every month; floats would drift across a long simulation. Nothing in the app holds
money as a decimal.

**"Today" is a setting, not `new Date()`.** Forced by the published cases, each of
which carries its own date. It also makes every screen reproducible.

**Charts are CSS, not a chart library.** The brief named Recharts. Every chart here
is a ranked horizontal bar, and a ranked bar is a `div` with a width — a chart
library would have added weight and a hydration surface for no gain. Recharts was
installed, went unused, and was removed rather than shipped as a dead dependency.

**Two layouts, one component tree.** On a phone this is a header, a scrolling
page and a thumb-reachable bottom bar. From `lg` up it becomes a fixed sidebar
beside a 1180px content column — a KPI row across the top, then a two-column
grid — because a judge opens the live URL on a laptop, and a phone column
stretched across a desktop is not a responsive design, it is an unfinished one.
Category bars sit in a fixed-width track beside their labels rather than
spanning the card, so a 3% category is a short bar in a short track instead of a
sliver stranded at the end of a 700px rule.

**Comparisons are like-for-like.** A category's delta compares this month so far
against *the same days* of last month, not against last month's finished total —
otherwise every category simply not yet touched would show as a saving it has
not made.

**One hue for every bar.** Identity comes from the row label beside each bar, so no
categorical palette is cycled and nothing rests on telling ten hues apart. Colour is
left to do one job: money out in crimson, money in in steel blue, and a reserved
amber for uncertain receipt fields. The three were checked with a palette validator
— 11.4 ΔE apart under protanopia, 20.3 ΔE between the amber and the crimson under
normal vision, all above 3:1 against the surface. Every delta also carries an arrow
and a sign, so colour never works alone.

**shadcn/ui was not installed.** The six primitives needed were written directly,
which is what copying them from shadcn produces anyway, without adding Radix and
`class-variance-authority` for six components.

**Gemini rather than Anthropic for the receipt reader.** The brief specified the
Anthropic API; the key available for this build was a Gemini key. The architecture is
unchanged — one server route holding the key, an image plus a fixed output schema so
the structure is guaranteed rather than probable, per-field confidences, and the
instruction to return `null` rather than guess carried in the schema's own field
descriptions.

**Pockets are funded in an explicit priority order.** When a month cannot cover every
contribution, something has to give, and a visible, reorderable order is more honest
than a silent pro-rata split. The order is shown on each card and can be changed
with the arrows.

---

## What is mocked

- **Persistence.** Everything lives in `localStorage` under the key `ledger-v1`, via zustand's `persist` middleware. There is no database, no account and no server copy. Data does not travel between browsers or devices, and clearing site data clears the ledger.
- **Seeded history.** The two months the app opens with are published case PUB-01, not a real person's spending.
- **The DPS.** An arithmetic illustration of the published rule. A real DPS also has a fixed term, a penalty for a missed instalment and tax on the interest — none of which is modelled. The app says so next to the figure.
- **Salary.** A single number entered by the user. No payroll integration, no mid-month changes, and it is assumed to arrive every month.

## Known limitations

- The forecast needs a previous month to blend against. With one month of data it projects from that month alone, which is a weaker forecast; the app still works, and the seeded ledger avoids the problem on a first visit.
- Only the current and previous month feed the forecast. A third month of history would improve the daily-rate blend and let seasonality show.
- The what-if control cuts one category at a time, deliberately, so the effect on screen is never the sum of several invisible adjustments.
- The recurring test is exact-shop-name. "GP recharge" and "Grameenphone" would not be matched as the same biller.
- Pocket completion dates land on a month end, because contributions are monthly. A within-month date would be false precision.
- No authentication, no multi-currency, no bank or mobile-money integration, no export. All out of scope by design.
- The receipt reader and the assistant depend on an external API. Its rate limits are modest, and it can be slow on a poor connection; the typed path is always available and is never hidden behind a failure.
- The assistant answers only from the digest it is handed, so it cannot reach beyond the current and previous month — the same horizon the forecast has. It holds no memory between sessions.
- Light theme only. A ledger reads as paper, and an automatic dark inversion would break the contrast checks the palette was chosen against.

## What would come next

1. **A real backend**, so the ledger survives a lost phone. This is the single biggest gap and the one every other item depends on.
2. **More history.** Twelve months would let the forecast see seasonality — Eid, admission season, winter gas bills — rather than blending two months.
3. **Reading the mobile-money screenshots directly.** bKash and Nagad confirmations are a fixed layout; they would parse far more reliably than a thermal receipt and are how much of this spending is actually recorded.
4. **Confidence learned from corrections.** The app already records which fields a user had to fix (`correctedFields` on each expense). Enough of those and the threshold could be tuned per field rather than fixed at 0.8.
5. **Pocket priority that suggests itself** — the app knows which pockets are starved and by how much, so it could propose an order rather than only accept one.

---

## Layout of the code

```
src/lib/          the engine, all pure, no React
  money.ts        integer paisa, half-up rounding, formatting
  dates.ts        YYYY-MM-DD and YYYY-MM arithmetic, no timezone surface
  forecast.ts     the forecast — monthly charges, blended burn rate, what-if cuts
  pockets.ts      forward simulation and the DPS arithmetic
  insights.ts     ten insight templates, ranked by materiality
  seed.ts         case PUB-01 in paisa, generated from the fixture
  types.ts
src/store/        zustand + persist
src/components/   the four tabs, the receipt flow, the sheets, the primitives
src/lib/assistant.ts  the digest the assistant may quote, and the typed action parser
src/app/
  api/receipt/    reads a photographed receipt
  api/chat/       the assistant; both routes hold the key, nothing else is server-side
scripts/check.ts  the 25-case harness and the constraint tests
```

The engine has no React import anywhere, which is what lets `scripts/check.ts` run
the exact code the browser runs against all 25 published cases in Node.

---

## Team and approach

See `evaluation-manifest.json` for per-member contributions and the AI-assistance
declaration, and [`EVENT.md`](./EVENT.md) for the event start record and the
pre-event material declaration.

The approach was to build the engine first and the interface second. The four
required items all rest on two pure functions — a forecast and a pocket simulation —
so those were written, then run against all 25 published cases and checked by hand
before a single screen existed. That is why the constraints are testable rather than
asserted, and why the what-if slider was cheap to add at the end: it is the same
function, called with one more argument.

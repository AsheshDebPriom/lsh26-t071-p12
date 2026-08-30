-- Ledger persistence.
--
-- The app works with no database at all: localStorage is the immediate source
-- of truth and always will be, because the live URL has to open and work with
-- zero setup. This schema is the *backup and restore* layer — it lets a ledger
-- survive a lost phone and move to another device.
--
-- Money is stored as an integer number of paisa, matching the application. A
-- numeric/float column here would reintroduce exactly the drift the app avoids
-- by never holding money as a float.
--
-- Applied to the project as two migrations: ledger_backup_schema and
-- bound_ledger_payload_size. This file is the combined, current state.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.ledgers (
  id                       uuid primary key default gen_random_uuid(),
  salary_paisa             bigint      not null default 0 check (salary_paisa >= 0),
  -- The date the app treats as "today". A setting, not the clock: every
  -- published sample case carries its own.
  as_of_date               date        not null,
  dps_annual_rate_percent  numeric(5,2) not null default 8.00
                             check (dps_annual_rate_percent >= 0
                                and dps_annual_rate_percent <= 100),
  loaded_case_id           text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.ledgers is
  'One saved ledger. The id doubles as the restore key — it is unguessable and is the only thing needed to bring a ledger back on another device.';

create table if not exists public.expenses (
  ledger_id        uuid   not null references public.ledgers(id) on delete cascade,
  id               text   not null,
  spent_on         date   not null,
  category         text   not null check (length(category) between 1 and 40),
  shop             text   not null check (length(shop) between 1 and 120),
  amount_paisa     bigint not null check (amount_paisa > 0),
  source           text   not null default 'manual'
                     check (source in ('manual', 'receipt')),
  -- Which fields the user had to correct because the receipt read was not
  -- confident. Kept so the confidence threshold could later be tuned per field
  -- from real corrections rather than left fixed at 0.8.
  corrected_fields text[] not null default '{}',
  primary key (ledger_id, id)
);

create index if not exists expenses_by_month
  on public.expenses (ledger_id, spent_on desc);

create table if not exists public.pockets (
  ledger_id                  uuid   not null references public.ledgers(id) on delete cascade,
  id                         text   not null,
  name                       text   not null check (length(name) between 1 and 80),
  item                       text   not null check (length(item) between 1 and 160),
  target_paisa               bigint not null check (target_paisa > 0),
  monthly_contribution_paisa bigint not null check (monthly_contribution_paisa > 0),
  -- Lower runs first when a month's surplus cannot fund every pocket.
  priority                   integer not null default 0,
  created_at_ms              bigint  not null,
  primary key (ledger_id, id)
);

create index if not exists pockets_by_priority
  on public.pockets (ledger_id, priority);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
--
-- Enabled with NO policies, deliberately. There is no user auth in this build,
-- so a publishable key reaching these tables directly would be able to read
-- every ledger that exists. Nothing can select from them.
--
-- The only way in is the two SECURITY DEFINER functions below, and both take a
-- ledger id. That id is a v4 uuid: unguessable, and the single thing needed to
-- reach one ledger and no other. Capability security rather than account
-- security — which is the honest trade for a build with no accounts, and it is
-- said plainly on screen next to the key.

alter table public.ledgers  enable row level security;
alter table public.expenses enable row level security;
alter table public.pockets  enable row level security;

revoke all on public.ledgers, public.expenses, public.pockets from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Atomic save
-- ---------------------------------------------------------------------------
--
-- The whole ledger goes in one call so a save can never half-succeed and leave
-- expenses belonging to a salary that was not written. Volumes are tens of rows,
-- so replacing the child rows outright is simpler and safer than diffing them.

create or replace function public.save_ledger(payload jsonb)
returns uuid
language plpgsql
security definer
-- Pinned so the definer's privileges cannot be redirected at another schema.
set search_path = public, pg_temp
as $$
declare
  v_id       uuid  := nullif(payload->>'ledgerId', '')::uuid;
  v_expenses jsonb := coalesce(payload->'expenses', '[]'::jsonb);
  v_pockets  jsonb := coalesce(payload->'pockets',  '[]'::jsonb);
begin
  -- Bounds live here, not only in the API route. save_ledger is reachable
  -- directly at /rest/v1/rpc/save_ledger with the publishable key, so a limit
  -- enforced only in TypeScript can simply be stepped around. A real ledger is
  -- tens of rows; these ceilings sit far above any honest use.
  if jsonb_typeof(v_expenses) <> 'array' or jsonb_typeof(v_pockets) <> 'array' then
    raise exception 'expenses and pockets must be arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(v_expenses) > 5000 then
    raise exception 'too many expenses in one ledger (limit 5000)' using errcode = '22023';
  end if;
  if jsonb_array_length(v_pockets) > 100 then
    raise exception 'too many pockets in one ledger (limit 100)' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.ledgers (salary_paisa, as_of_date, dps_annual_rate_percent, loaded_case_id)
    values (
      (payload->>'salaryPaisa')::bigint,
      (payload->>'asOfDate')::date,
      (payload->>'dpsAnnualRatePercent')::numeric,
      nullif(payload->>'loadedCaseId', '')
    )
    returning id into v_id;
  else
    update public.ledgers set
      salary_paisa            = (payload->>'salaryPaisa')::bigint,
      as_of_date              = (payload->>'asOfDate')::date,
      dps_annual_rate_percent = (payload->>'dpsAnnualRatePercent')::numeric,
      loaded_case_id          = nullif(payload->>'loadedCaseId', ''),
      updated_at              = now()
    where id = v_id;

    if not found then
      -- The key came from a browser whose ledger has since been deleted.
      -- Recreate it under the same id rather than silently losing the save.
      insert into public.ledgers (id, salary_paisa, as_of_date, dps_annual_rate_percent, loaded_case_id)
      values (
        v_id,
        (payload->>'salaryPaisa')::bigint,
        (payload->>'asOfDate')::date,
        (payload->>'dpsAnnualRatePercent')::numeric,
        nullif(payload->>'loadedCaseId', '')
      );
    end if;
  end if;

  delete from public.expenses where ledger_id = v_id;
  delete from public.pockets  where ledger_id = v_id;

  insert into public.expenses (ledger_id, id, spent_on, category, shop, amount_paisa, source, corrected_fields)
  select
    v_id,
    e->>'id',
    (e->>'date')::date,
    e->>'category',
    e->>'shop',
    (e->>'amount')::bigint,
    coalesce(e->>'source', 'manual'),
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(e->'correctedFields')),
      '{}'
    )
  from jsonb_array_elements(v_expenses) as e;

  insert into public.pockets (ledger_id, id, name, item, target_paisa, monthly_contribution_paisa, priority, created_at_ms)
  select
    v_id,
    p->>'id',
    p->>'name',
    p->>'item',
    (p->>'target')::bigint,
    (p->>'monthlyContribution')::bigint,
    coalesce((p->>'priority')::int, 0),
    coalesce((p->>'createdAt')::bigint, 0)
  from jsonb_array_elements(v_pockets) as p;

  return v_id;
end;
$$;

comment on function public.save_ledger is
  'Replaces a ledger and all its rows in one transaction. Returns the ledger id, creating one when none was supplied.';

-- ---------------------------------------------------------------------------
-- Read back
-- ---------------------------------------------------------------------------

create or replace function public.load_ledger(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'ledgerId',             l.id,
    'salaryPaisa',          l.salary_paisa,
    'asOfDate',             l.as_of_date,
    'dpsAnnualRatePercent', l.dps_annual_rate_percent,
    'loadedCaseId',         l.loaded_case_id,
    'updatedAt',            l.updated_at,
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'date', e.spent_on, 'category', e.category, 'shop', e.shop,
        'amount', e.amount_paisa, 'source', e.source,
        'correctedFields', to_jsonb(e.corrected_fields)
      ) order by e.spent_on desc)
      from public.expenses e where e.ledger_id = l.id
    ), '[]'::jsonb),
    'pockets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'item', p.item,
        'target', p.target_paisa,
        'monthlyContribution', p.monthly_contribution_paisa,
        'priority', p.priority, 'createdAt', p.created_at_ms
      ) order by p.priority)
      from public.pockets p where p.ledger_id = l.id
    ), '[]'::jsonb)
  )
  from public.ledgers l
  where l.id = p_id;
$$;

-- The functions are the entire public surface. Executing one still requires the
-- ledger's uuid, so holding the publishable key alone reaches nothing.
revoke all on function public.save_ledger(jsonb) from public;
revoke all on function public.load_ledger(uuid) from public;
grant execute on function public.save_ledger(jsonb) to anon, authenticated;
grant execute on function public.load_ledger(uuid)  to anon, authenticated;

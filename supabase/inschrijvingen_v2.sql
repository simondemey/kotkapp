-- Inschrijvingen v2: één inschrijving per account met 1 tot 10 deelnemers (zoals het vroegere Google-formulier).
-- Voer uit in Supabase > SQL Editor. LET OP: dit verwijdert de bestaande (test)inschrijvingen.
-- Nieuwe projecten: voer schema.sql en accounts.sql uit; accounts.sql bevat deze versie al.

drop table if exists public.inschrijvingen cascade;

-- Elke deelnemer: {"naam": "...", "loopt": bool, "wandelt": bool, "supporter": bool}, minstens één ervan true
create or replace function public.deelnemers_geldig(d jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(d) = 'array'
     and jsonb_array_length(d) between 1 and 10
     and not exists (
       select 1 from jsonb_array_elements(d) e
       where jsonb_typeof(e -> 'naam') is distinct from 'string'
          or char_length(btrim(e ->> 'naam')) not between 1 and 100
          or jsonb_typeof(e -> 'loopt') is distinct from 'boolean'
          or jsonb_typeof(e -> 'wandelt') is distinct from 'boolean'
          or (e ? 'supporter' and jsonb_typeof(e -> 'supporter') is distinct from 'boolean')
          or not ((e ->> 'loopt')::boolean
                  or (e ->> 'wandelt')::boolean
                  or coalesce((e ->> 'supporter')::boolean, false))
     );
$$;

create table public.inschrijvingen (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  email       text,
  deelnemers  jsonb not null check (public.deelnemers_geldig(deelnemers)),
  vragen      text check (char_length(vragen) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger inschrijving_bijwerken
  before insert or update on public.inschrijvingen
  for each row execute function public.inschrijving_bijwerken();

alter table public.inschrijvingen enable row level security;

revoke all on public.inschrijvingen from anon;
grant select, insert, update, delete on public.inschrijvingen to authenticated;

create policy "eigen inschrijving of admin lezen"
  on public.inschrijvingen for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "eigen inschrijving toevoegen"
  on public.inschrijvingen for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "eigen inschrijving aanpassen"
  on public.inschrijvingen for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "eigen inschrijving of admin verwijderen"
  on public.inschrijvingen for delete
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

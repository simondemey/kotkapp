-- Starten aan de administratiepost: enkel een beheerder kan een deelnemer laten starten.
-- Een deelnemer kan pas "Klaar met lopen" ingeven nadat hij gestart is (een beheerder kan altijd rondjes ingeven).
-- Voer uit in Supabase > SQL Editor (na sponsors.sql). Veilig om opnieuw uit te voeren.

create table if not exists public.starts (
  deelnemer_id uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  gestart_op   timestamptz not null default now(),
  gestart_door uuid
);

alter table public.starts enable row level security;
revoke all on public.starts from anon;
grant select on public.starts to authenticated;   -- schrijven enkel via start_deelnemer()

drop policy if exists "eigen start of admin lezen" on public.starts;
create policy "eigen start of admin lezen" on public.starts for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Starten (p_start = true) of de start ongedaan maken (false) – enkel beheerders
create or replace function public.start_deelnemer(p_deelnemer uuid, p_start boolean default true)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  eigenaar uuid;
  d        jsonb;
  tijd     timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Enkel beheerders kunnen deelnemers starten' using errcode = '42501';
  end if;

  select i.user_id, e into eigenaar, d
    from public.inschrijvingen i, jsonb_array_elements(i.deelnemers) e
   where e ->> 'id' = p_deelnemer::text limit 1;
  if eigenaar is null then raise exception 'Deelnemer niet gevonden'; end if;
  if not (coalesce((d ->> 'loopt')::boolean, false) or coalesce((d ->> 'wandelt')::boolean, false)) then
    raise exception 'Supporters starten niet';
  end if;

  if p_start then
    insert into public.starts (deelnemer_id, user_id, gestart_op, gestart_door)
    values (p_deelnemer, eigenaar, now(), auth.uid())
    on conflict (deelnemer_id) do nothing;
    select gestart_op into tijd from public.starts where deelnemer_id = p_deelnemer;
  else
    delete from public.starts where deelnemer_id = p_deelnemer;
  end if;

  return json_build_object('gestart', p_start, 'gestart_op', tijd);
end;
$$;
revoke all on function public.start_deelnemer(uuid, boolean) from public, anon;
grant execute on function public.start_deelnemer(uuid, boolean) to authenticated;

-- Rondjes opslaan: deelnemers zelf pas na hun start
create or replace function public.rondjes_opslaan(p_deelnemer uuid, p_aantal integer, p_opnieuw boolean default false)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  eigenaar uuid;
  d        jsonb;
  s        record;
  gemaild  integer := 0;
  admin    boolean := public.is_admin();
begin
  select i.user_id, e into eigenaar, d
    from public.inschrijvingen i, jsonb_array_elements(i.deelnemers) e
   where e ->> 'id' = p_deelnemer::text limit 1;

  if eigenaar is null then raise exception 'Deelnemer niet gevonden'; end if;
  if auth.uid() is distinct from eigenaar and not admin then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  if not admin and not exists (select 1 from public.starts where deelnemer_id = p_deelnemer) then
    raise exception 'Je bent nog niet gestart. Meld je aan bij de administratiepost.' using errcode = 'P0001';
  end if;
  if not (coalesce((d ->> 'loopt')::boolean, false) or coalesce((d ->> 'wandelt')::boolean, false)) then
    raise exception 'Supporters hebben geen rondjes';
  end if;
  if p_aantal is null or p_aantal < 0 or p_aantal > 200 then
    raise exception 'Ongeldig aantal rondjes';
  end if;

  insert into public.rondjes (deelnemer_id, user_id, aantal, klaar_op, ingevoerd_door)
  values (p_deelnemer, eigenaar, p_aantal, now(), auth.uid())
  on conflict (deelnemer_id) do update
    set aantal = excluded.aantal, klaar_op = now(), ingevoerd_door = excluded.ingevoerd_door;

  for s in select id from public.sponsors
            where deelnemer_id = p_deelnemer
              and communicatie = 'mail' and email is not null
              and (p_opnieuw or mail_verstuurd_op is null)
  loop
    if public.stuur_sponsormail(s.id) then gemaild := gemaild + 1; end if;
  end loop;

  return json_build_object('aantal', p_aantal, 'gemaild', gemaild);
end;
$$;
revoke all on function public.rondjes_opslaan(uuid, integer, boolean) from public, anon;
grant execute on function public.rondjes_opslaan(uuid, integer, boolean) to authenticated;

notify pgrst, 'reload schema';

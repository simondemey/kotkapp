-- Sponsors per deelnemer, rondjes na het lopen en automatische sponsormails.
-- Voer uit in Supabase > SQL Editor (na accounts.sql, nummers en bevestigingsmail). Veilig om opnieuw uit te voeren.
--
-- Overzicht:
--   * Elke deelnemer in inschrijvingen.deelnemers krijgt een vaste "id" (naast het nummer voor lopers).
--   * Tabel sponsors: per deelnemer onbeperkt sponsors (per rondje of vast bedrag), optioneel met e-mail.
--   * Tabel rondjes: het aantal rondjes per deelnemer, ingegeven via "Klaar met lopen" of door een beheerder.
--   * Functie rondjes_opslaan(): bewaart de rondjes en mailt sponsors die een e-mail hebben en "mail" kozen.

-- =====================================================================
-- 1. Vaste id + nummer per deelnemer
-- =====================================================================
-- Regels per deelnemer (in deze volgorde):
--   a. de pagina stuurt een bestaande id mee           -> die deelnemer (id + nummer) behouden
--   b. anders: een bestaande deelnemer met dezelfde naam -> diens id (+ nummer) behouden
--   c. anders: nieuwe id; lopers krijgen het volgende vrije nummer
-- Wandelaars en supporters hebben geen nummer.
create or replace function public.deelnemer_nummers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  oud        jsonb;
  gebruikt   bigint[] := '{}';   -- posities van oude deelnemers die al gekoppeld zijn
  resultaat  jsonb    := '[]';
  e          jsonb;
  m          jsonb;
  mpos       bigint;
  loper      boolean;
  nr         bigint;
begin
  -- Upsert op een bestaande inschrijving: de UPDATE-trigger die hierna volgt doet het werk
  if tg_op = 'INSERT' and exists (select 1 from public.inschrijvingen where user_id = new.user_id) then
    return new;
  end if;

  select i.deelnemers into oud from public.inschrijvingen i where i.user_id = new.user_id;
  oud := coalesce(oud, '[]');

  for e in select value from jsonb_array_elements(new.deelnemers) with ordinality order by ordinality loop
    m := null; mpos := null;

    -- a. op id
    if jsonb_typeof(e -> 'id') = 'string' then
      select x.o, x.pos into m, mpos
        from jsonb_array_elements(oud) with ordinality as x(o, pos)
       where x.o ->> 'id' = e ->> 'id' and not x.pos = any (gebruikt)
       order by x.pos limit 1;
    end if;
    -- b. op naam
    if m is null then
      select x.o, x.pos into m, mpos
        from jsonb_array_elements(oud) with ordinality as x(o, pos)
       where lower(btrim(x.o ->> 'naam')) = lower(btrim(e ->> 'naam')) and not x.pos = any (gebruikt)
       order by x.pos limit 1;
    end if;

    loper := coalesce((e ->> 'loopt')::boolean, false);
    e := e - 'id' - 'nr';
    if m is not null then
      gebruikt := gebruikt || mpos;
    end if;
    e := e || jsonb_build_object('id', coalesce(m ->> 'id', gen_random_uuid()::text));

    if loper then
      if m is not null and jsonb_typeof(m -> 'nr') = 'number' and coalesce((m ->> 'loopt')::boolean, false) then
        nr := (m ->> 'nr')::bigint;
      else
        nr := nextval('public.deelnemer_nr');
      end if;
      e := e || jsonb_build_object('nr', nr);
    end if;

    resultaat := resultaat || jsonb_build_array(e);
  end loop;

  new.deelnemers := resultaat;
  return new;
end;
$$;

-- Bestaande deelnemers een id geven (nummers blijven gelijk), zonder bevestigingsmails
alter table public.inschrijvingen disable trigger stuur_bevestigingsmail;
update public.inschrijvingen set deelnemers = deelnemers;
alter table public.inschrijvingen enable trigger stuur_bevestigingsmail;

-- Hoort deze deelnemer-id bij de ingelogde gebruiker? (gebruikt in de beveiligingsregels)
create or replace function public.is_eigen_deelnemer(p_deelnemer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.inschrijvingen i, jsonb_array_elements(i.deelnemers) e
     where i.user_id = auth.uid() and e ->> 'id' = p_deelnemer::text
  );
$$;
grant execute on function public.is_eigen_deelnemer(uuid) to authenticated;

-- =====================================================================
-- 2. Sponsors
-- =====================================================================
create table if not exists public.sponsors (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deelnemer_id     uuid not null,
  naam             text not null check (char_length(btrim(naam)) between 1 and 100),
  soort            text not null check (soort in ('per_rondje', 'vast')),
  bedrag           numeric(8, 2) not null check (bedrag > 0 and bedrag <= 10000),
  email            text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  communicatie     text not null default 'zelf' check (communicatie in ('mail', 'zelf')),
  mail_verstuurd_op timestamptz,
  created_at       timestamptz not null default now(),
  constraint mail_vraagt_email check (communicatie = 'zelf' or email is not null)
);
create index if not exists sponsors_deelnemer on public.sponsors (deelnemer_id);

alter table public.sponsors enable row level security;
revoke all on public.sponsors from anon;
grant select, insert, update, delete on public.sponsors to authenticated;

drop policy if exists "eigen sponsors of admin lezen" on public.sponsors;
create policy "eigen sponsors of admin lezen" on public.sponsors for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "sponsor toevoegen bij eigen deelnemer" on public.sponsors;
create policy "sponsor toevoegen bij eigen deelnemer" on public.sponsors for insert to authenticated
  with check (user_id = auth.uid() and public.is_eigen_deelnemer(deelnemer_id) and mail_verstuurd_op is null);

drop policy if exists "eigen sponsors aanpassen" on public.sponsors;
create policy "eigen sponsors aanpassen" on public.sponsors for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check ((user_id = auth.uid() and public.is_eigen_deelnemer(deelnemer_id)) or public.is_admin());

drop policy if exists "eigen sponsors of admin verwijderen" on public.sponsors;
create policy "eigen sponsors of admin verwijderen" on public.sponsors for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- =====================================================================
-- 3. Rondjes
-- =====================================================================
create table if not exists public.rondjes (
  deelnemer_id   uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  aantal         integer not null check (aantal between 0 and 200),
  klaar_op       timestamptz not null default now(),
  ingevoerd_door uuid
);

alter table public.rondjes enable row level security;
revoke all on public.rondjes from anon;
grant select on public.rondjes to authenticated;   -- schrijven enkel via rondjes_opslaan()

drop policy if exists "eigen rondjes of admin lezen" on public.rondjes;
create policy "eigen rondjes of admin lezen" on public.rondjes for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- =====================================================================
-- 4. Sponsormail
-- =====================================================================
create or replace function public.euro(b numeric)
returns text
language sql
immutable
set search_path = ''
as $$ select '€ ' || replace(to_char(round(b, 2), 'FM999990.00'), '.', ','); $$;

create or replace function public.stuur_sponsormail(p_sponsor uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  s        public.sponsors%rowtype;
  d        jsonb;
  eigenaar text;
  aantal   integer;
  totaal   numeric;
  sleutel  text;
  wat      text;
  berekening text;
  wandelaar boolean;
  html     text;
begin
  select * into s from public.sponsors where id = p_sponsor;
  if s.id is null or s.email is null or s.communicatie <> 'mail' then return false; end if;

  select e, i.email into d, eigenaar
    from public.inschrijvingen i, jsonb_array_elements(i.deelnemers) e
   where e ->> 'id' = s.deelnemer_id::text limit 1;
  select r.aantal into aantal from public.rondjes r where r.deelnemer_id = s.deelnemer_id;
  if d is null or aantal is null then return false; end if;

  select decrypted_secret into sleutel from vault.decrypted_secrets where name = 'brevo_api_key' limit 1;
  if sleutel is null then raise warning 'sponsormail: geen brevo_api_key'; return false; end if;

  wandelaar := not coalesce((d ->> 'loopt')::boolean, false);
  wat := case when wandelaar then 'de wandeltocht uitgewandeld' else aantal || ' rondjes gelopen' end;
  if s.soort = 'per_rondje' and not wandelaar then
    totaal := s.bedrag * aantal;
    berekening := aantal || ' rondjes × ' || public.euro(s.bedrag) || ' per rondje';
  else
    totaal := s.bedrag;
    berekening := 'vast bedrag';
  end if;

  html :=
    '<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>'
    '<body style="margin:0;padding:0;background:#FDF8EC;">'
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8EC;"><tr><td align="center" style="padding:32px 16px;">'
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:3px solid #FBE3B0;border-radius:18px;">'
    '<tr><td align="center" style="padding:28px 28px 4px;"><img src="https://runningforpauline.be/static/img/lopers.png" width="140" alt="" style="display:block;width:140px;max-width:50%;height:auto;border:0;"></td></tr>'
    '<tr><td align="center" style="padding:6px 28px 0;font-family:Impact,''Arial Narrow Bold'',''Arial Black'',Arial,sans-serif;font-size:40px;line-height:1;"><span style="color:#E0611F;">SPONSOR</span><span style="color:#F6B21C;">LOOP</span></td></tr>'
    '<tr><td align="center" style="padding:4px 28px 0;font-family:Impact,''Arial Narrow Bold'',Arial,sans-serif;font-size:20px;color:#E0611F;">RUNNING FOR <span style="color:#F6B21C;">PAULINE</span></td></tr>'
    '<tr><td style="padding:24px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#3A2A20;">'
    '<p style="margin:0 0 12px;">Beste ' || public.html_tekst(s.naam) || ',</p>'
    '<p style="margin:0;"><strong>' || public.html_tekst(d ->> 'naam') || '</strong> heeft tijdens de sponsorloop <strong>'
    || wat || '</strong> voor Pauline en Kom op tegen Kanker. Bedankt om te sponsoren! 💛</p>'
    '</td></tr>'
    '<tr><td align="center" style="padding:12px 28px;">'
    '<div style="background:#FDF8EC;border:3px solid #FBE3B0;border-radius:14px;padding:14px 18px;font-family:Arial,Helvetica,sans-serif;">'
    '<div style="font-size:13px;color:#E08A5A;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Jouw sponsoring</div>'
    '<div style="font-family:Impact,''Arial Narrow Bold'',Arial,sans-serif;font-size:40px;color:#E0611F;line-height:1.2;">' || public.euro(totaal) || '</div>'
    '<div style="font-size:14px;color:#3A2A20;">' || berekening || '</div>'
    '</div></td></tr>'
    '<tr><td style="padding:8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#3A2A20;">'
    '<p style="margin:0 0 8px;"><strong>Betalen kan op twee manieren:</strong></p>'
    '<p style="margin:0 0 10px;"><strong>1. Via Kom op tegen Kanker</strong> (komt op onze teampagina)<br>'
    'Online: <a href="https://www.komoptegenkanker.be/de-100km-run/steun-een-team/05275b58-30d4-46a8-b8bc-8c741227fa4f" style="color:#E0611F;">onze teampagina</a><br>'
    'Of overschrijving naar <strong>BE56 7360 3575 6688</strong> met mededeling <strong>GIFT 340194808</strong> (belangrijk!)</p>'
    '<p style="margin:0;"><strong>2. Rechtstreeks voor Pauline''s behandeling</strong><br>'
    'Overschrijving naar <strong>BE32 8937 5011 4102</strong> met mededeling <strong>Sponsorloop ' || public.html_tekst(d ->> 'naam') || '</strong></p>'
    '</td></tr>'
    '<tr><td style="padding:16px 28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#3A2A20;">'
    'Heel erg bedankt voor je steun!<br>Team Running for Pauline'
    '</td></tr>'
    '<tr><td align="center" style="padding:16px 28px;border-top:2px solid #FBE3B0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#E08A5A;">'
    '<span style="color:#F6B21C;">Een actie voor</span> <strong style="color:#E0611F;">Kom op</strong> <strong style="color:#F6B21C;">tegen Kanker</strong> · <a href="https://runningforpauline.be" style="color:#E0611F;">runningforpauline.be</a>'
    '</td></tr></table></td></tr></table></body></html>';

  perform net.http_post(
    url     := 'https://api.brevo.com/v3/smtp/email',
    headers := jsonb_build_object('api-key', sleutel, 'Content-Type', 'application/json', 'accept', 'application/json'),
    body    := jsonb_build_object(
                 'sender',  jsonb_build_object('name', 'Running for Pauline', 'email', 'noreply@runningforpauline.be'),
                 'replyTo', jsonb_build_object('email', coalesce(eigenaar, 'sponserloopkotk@gmail.com')),
                 'to',      jsonb_build_array(jsonb_build_object('email', s.email, 'name', s.naam)),
                 'subject', (d ->> 'naam') || ' heeft ' || wat || ' – jouw sponsoring',
                 'htmlContent', html));

  update public.sponsors set mail_verstuurd_op = now() where id = s.id;
  return true;
exception when others then
  raise warning 'sponsormail mislukt: %', sqlerrm;
  return false;
end;
$$;
revoke all on function public.stuur_sponsormail(uuid) from public, anon, authenticated;

-- =====================================================================
-- 5. Rondjes opslaan (deelnemer zelf of beheerder) + sponsors mailen
-- =====================================================================
-- p_opnieuw = true: ook sponsors die al een mail kregen opnieuw mailen (bv. na een correctie)
-- (in starts.sql vervangen door een versie die eerst een start door een beheerder vereist)
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
begin
  select i.user_id, e into eigenaar, d
    from public.inschrijvingen i, jsonb_array_elements(i.deelnemers) e
   where e ->> 'id' = p_deelnemer::text limit 1;

  if eigenaar is null then raise exception 'Deelnemer niet gevonden'; end if;
  if auth.uid() is distinct from eigenaar and not public.is_admin() then
    raise exception 'Geen toegang' using errcode = '42501';
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

-- Controle: deelnemers met hun id en nummer
select coalesce(e ->> 'nr', '–') as nr, e ->> 'naam' as naam, e ->> 'id' as id
from public.inschrijvingen i, jsonb_array_elements(i.deelnemers) e
order by (e ->> 'nr')::bigint nulls last;

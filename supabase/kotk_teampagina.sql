-- Sponsormail: betalen aan Kom op tegen Kanker enkel nog via de teampagina (geen rekeningnummer meer).
-- Voer uit in Supabase > SQL Editor. Veilig om opnieuw uit te voeren.

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
    '<p style="margin:0 0 10px;"><strong>1. Via Kom op tegen Kanker</strong><br>'
    'Doneer online via <a href="https://www.komoptegenkanker.be/de-100km-run/steun-een-team/05275b58-30d4-46a8-b8bc-8c741227fa4f" style="color:#E0611F;font-weight:bold;">onze teampagina</a>.</p>'
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

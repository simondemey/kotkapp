-- Bevestigingsmail na inschrijven, met alle deelnemers en hun nummer.
-- Voer uit in Supabase > SQL Editor (na nummers.sql). Je kan het veilig opnieuw uitvoeren.
--
-- Werking:
--   * Na elke nieuwe inschrijving, en na elke wijziging van de deelnemers, verstuurt de database
--     een mail via de Brevo-API naar het e-mailadres van het account.
--   * De Brevo API-sleutel staat versleuteld in de Supabase Vault onder de naam "brevo_api_key"
--     (zie de stappen in de chat; de sleutel staat NIET in dit bestand).
--   * Lukt het versturen niet, dan blijft de inschrijving gewoon bewaard.

create extension if not exists pg_net with schema extensions;

-- Tekst veilig in HTML zetten (namen van deelnemers)
create or replace function public.html_tekst(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

create or replace function public.stuur_bevestigingsmail()
returns trigger
language plpgsql
security definer          -- mag de Vault lezen en pg_net gebruiken
set search_path = ''
as $$
declare
  sleutel text;
  rijen   text;
  html    text;
begin
  -- Enkel bij een nieuwe inschrijving of als de deelnemers veranderd zijn
  if tg_op = 'UPDATE' and old.deelnemers is not distinct from new.deelnemers then
    return new;
  end if;
  if new.email is null then
    return new;
  end if;

  select decrypted_secret into sleutel
    from vault.decrypted_secrets
   where name = 'brevo_api_key'
   limit 1;
  if sleutel is null then
    raise warning 'bevestigingsmail: geen brevo_api_key in de Vault';
    return new;
  end if;

  select string_agg(
           format(
             '<tr>'
             '<td style="padding:10px 12px;border-bottom:1px solid #FBE3B0;font-family:Impact,''Arial Narrow Bold'',Arial,sans-serif;font-size:30px;line-height:1;color:#E0611F;white-space:nowrap;">%s</td>'
             '<td style="padding:10px 12px;border-bottom:1px solid #FBE3B0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#3A2A20;"><strong>%s</strong><br><span style="color:#E08A5A;font-size:14px;">%s</span></td>'
             '</tr>',
             case when e ? 'nr' then 'nr. ' || (e ->> 'nr') else '' end,
             public.html_tekst(e ->> 'naam'),
             case
               when (e ->> 'loopt')::boolean then '🏃 Loopt (rondjes van 1,7 km)'
               when (e ->> 'wandelt')::boolean then '🚶 Wandelt (rondjes van 5 km)'
               else '📣 Supporter'
             end),
           '' order by (e ->> 'nr')::bigint nulls last)
    into rijen
    from jsonb_array_elements(new.deelnemers) e;

  html :=
    '<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>'
    '<body style="margin:0;padding:0;background:#FDF8EC;">'
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8EC;"><tr><td align="center" style="padding:32px 16px;">'
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:3px solid #FBE3B0;border-radius:18px;">'
    '<tr><td align="center" style="padding:28px 28px 4px;"><img src="https://runningforpauline.be/static/img/lopers.png" width="140" alt="" style="display:block;width:140px;max-width:50%;height:auto;border:0;"></td></tr>'
    '<tr><td align="center" style="padding:6px 28px 0;font-family:Impact,''Arial Narrow Bold'',''Arial Black'',Arial,sans-serif;font-size:40px;line-height:1;"><span style="color:#E0611F;">SPONSOR</span><span style="color:#F6B21C;">LOOP</span></td></tr>'
    '<tr><td align="center" style="padding:4px 28px 0;font-family:Impact,''Arial Narrow Bold'',Arial,sans-serif;font-size:20px;color:#E0611F;">RUNNING FOR <span style="color:#F6B21C;">PAULINE</span></td></tr>'
    '<tr><td style="padding:24px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#3A2A20;">'
    '<p style="margin:0 0 12px;">Hallo!</p>'
    '<p style="margin:0;">Bedankt voor je inschrijving voor de sponsorloop op <strong>zondag 14 februari 2027</strong>. Dit zijn jullie deelnemers. Lopers krijgen een nummer.</p>'
    '</td></tr>'
    '<tr><td style="padding:8px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8EC;border-radius:12px;">'
    || coalesce(rijen, '') ||
    '</table></td></tr>'
    '<tr><td style="padding:16px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#3A2A20;">'
    '<p style="margin:0 0 8px;"><strong>Waar?</strong> Daverlostraat 164, 8310 Assebroek<br>'
    '<strong>Wanneer?</strong> Starten vanaf 12.00 uur, lopen of wandelen tot 17.00 uur</p>'
    '</td></tr>'
    '<tr><td style="padding:4px 16px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBE3B0;border-radius:12px;"><tr>'
    '<td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#3A2A20;">'
    '📌 <strong>Belangrijk:</strong> meld je op de dag zelf eerst aan bij de <strong>administratiepost</strong>. '
    '<strong>Lopers</strong> geven daar hun <strong>nummer</strong> door. Bewaar deze mail dus goed!'
    '</td></tr></table></td></tr>'
    '<tr><td align="center" style="padding:12px 28px 24px;">'
    '<a href="https://runningforpauline.be/inschrijven.html" style="display:inline-block;background:#E0611F;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:999px;">Mijn inschrijving bekijken</a>'
    '</td></tr>'
    '<tr><td align="center" style="padding:16px 28px;border-top:2px solid #FBE3B0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#E08A5A;">'
    'Vragen? Mail naar <a href="mailto:sponserloopkotk@gmail.com" style="color:#E0611F;">sponserloopkotk@gmail.com</a><br>'
    '<span style="color:#F6B21C;">Een actie voor</span> <strong style="color:#E0611F;">Kom op</strong> <strong style="color:#F6B21C;">tegen Kanker</strong>'
    '</td></tr></table></td></tr></table></body></html>';

  perform net.http_post(
    url     := 'https://api.brevo.com/v3/smtp/email',
    headers := jsonb_build_object(
                 'api-key', sleutel,
                 'Content-Type', 'application/json',
                 'accept', 'application/json'),
    body    := jsonb_build_object(
                 'sender',  jsonb_build_object('name', 'Running for Pauline', 'email', 'noreply@runningforpauline.be'),
                 'replyTo', jsonb_build_object('name', 'Running for Pauline', 'email', 'sponserloopkotk@gmail.com'),
                 'to',      jsonb_build_array(jsonb_build_object('email', new.email)),
                 'subject', case when tg_op = 'INSERT'
                                 then 'Je inschrijving voor Running for Pauline'
                                 else 'Je inschrijving voor Running for Pauline is aangepast' end,
                 'htmlContent', html)
  );
  return new;
exception when others then
  -- Nooit de inschrijving laten mislukken door de mail
  raise warning 'bevestigingsmail mislukt: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists stuur_bevestigingsmail on public.inschrijvingen;
create trigger stuur_bevestigingsmail
  after insert or update on public.inschrijvingen
  for each row execute function public.stuur_bevestigingsmail();

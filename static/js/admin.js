// Beheer: inschrijvingen opvolgen (tellers, deelnemerslijst, rondjes, sponsors, vragen) + export naar CSV.
// Enkel voor beheerders (zie supabase/accounts.sql).
(function () {
  const db = window.sb;
  const status = document.getElementById("admin-status");
  const inhoud = document.getElementById("admin-inhoud");
  if (!db || !status) return;

  const datumFormaat = new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const zoek = document.getElementById("zoek");
  let inschrijvingen = [];
  let deelnemers = []; // één rij per deelnemer
  let sponsors = [];
  const euro = (b) => "€ " + Number(b).toFixed(2).replace(".", ",");
  const bedragVan = (s, rondjes) => (s.soort === "vast" ? Number(s.bedrag) : rondjes == null ? 0 : Number(s.bedrag) * rondjes);

  async function start() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
      status.innerHTML = 'Je bent niet ingelogd. <a href="inschrijven.html">Log eerst in</a> met je beheerdersaccount.';
      return;
    }
    if (!(await window.sbIsAdmin())) {
      status.textContent = `Het account ${session.user.email} heeft geen beheerdersrechten.`;
      return;
    }
    await laad();
    laadPartners();
  }

  async function laad() {
    const [ins, sp, ro, st] = await Promise.all([
      db.from("inschrijvingen").select("*").order("created_at"),
      db.from("sponsors").select("*").order("created_at"),
      db.from("rondjes").select("deelnemer_id, aantal"),
      db.from("starts").select("deelnemer_id, gestart_op"),
    ]);
    const data = ins.data;
    const error = ins.error || sp.error || ro.error || st.error;
    if (error) {
      console.error(error);
      status.hidden = false;
      status.textContent = "De inschrijvingen konden niet geladen worden.";
      return;
    }
    inschrijvingen = data;
    sponsors = sp.data;
    const rondjesVan = Object.fromEntries(ro.data.map((r) => [r.deelnemer_id, r.aantal]));
    const startVan = Object.fromEntries(st.data.map((r) => [r.deelnemer_id, r.gestart_op]));
    deelnemers = data.flatMap((i) =>
      i.deelnemers.map((d) => {
        const eigen = sponsors.filter((s) => s.deelnemer_id === d.id);
        const rondjes = rondjesVan[d.id] ?? null;
        return {
          ...d, email: i.email, created_at: i.created_at, vragen: i.vragen, user_id: i.user_id,
          sponsors: eigen, rondjes, gestart_op: startVan[d.id] ?? null,
          opgehaald: eigen.reduce((som, s) => som + bedragVan(s, rondjes), 0),
        };
      })
    ).sort((a, b) => (a.nr ?? Infinity) - (b.nr ?? Infinity));
    status.hidden = true;
    inhoud.hidden = false;
    toonStats();
    toonTabel();
    toonVragen();
  }

  function toonStats() {
    const weekGeleden = Date.now() - 7 * 864e5;
    const zet = (id, w) => (document.getElementById(id).textContent = w);
    zet("stat-deelnemers", deelnemers.length);
    zet("stat-lopers", deelnemers.filter((d) => d.loopt).length);
    zet("stat-wandelaars", deelnemers.filter((d) => d.wandelt).length);
    zet("stat-supporters", deelnemers.filter((d) => d.supporter).length);
    zet("stat-inschrijvingen", inschrijvingen.length);
    zet("stat-gestart", deelnemers.filter((d) => d.gestart_op).length);
    zet("stat-klaar", deelnemers.filter((d) => d.rondjes != null).length);
    zet("stat-rondjes", deelnemers.filter((d) => d.loopt).reduce((som, d) => som + (d.rondjes || 0), 0));
    zet("stat-opgehaald", euro(deelnemers.filter((d) => d.rondjes != null).reduce((som, d) => som + d.opgehaald, 0)).replace(",00", ""));
    zet("stat-week", inschrijvingen.filter((i) => new Date(i.created_at) > weekGeleden).reduce((som, i) => som + i.deelnemers.length, 0));
  }

  // mailto-link met onderwerp en (optioneel) tekst, opent het mailprogramma van de beheerder
  function mailLink(email, tekst, onderwerp = "Running for Pauline", body = "") {
    const a = document.createElement("a");
    a.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(onderwerp)}` + (body ? `&body=${encodeURIComponent(body)}` : "");
    a.textContent = tekst;
    return a;
  }

  function cel(tr, waarde, klasse) {
    const td = document.createElement("td");
    td.textContent = waarde;
    if (klasse) td.className = klasse;
    tr.append(td);
    return td;
  }

  function toonTabel() {
    const term = zoek.value.trim().toLowerCase();
    const zichtbaar = deelnemers.filter((d) => !term || d.naam.toLowerCase().includes(term) || (d.email || "").toLowerCase().includes(term) || String(d.nr ?? "") === term);
    const tbody = document.getElementById("admin-rijen");
    tbody.replaceChildren(
      ...zichtbaar.map((d) => {
        const tr = document.createElement("tr");
        startCel(tr, d);
        cel(tr, d.naam);
        cel(tr, d.loopt ? "✓" : "", "ja");
        cel(tr, d.wandelt ? "✓" : "", "ja");
        cel(tr, d.supporter ? "✓" : "", "ja");
        rondjesCel(tr, d);
        cel(tr, d.supporter ? "" : d.sponsors.length);
        cel(tr, d.sponsors.length ? euro(d.opgehaald) + (d.rondjes == null && d.sponsors.some((s) => s.soort === "per_rondje") ? " +" : "") : "");
        const mailCel = cel(tr, "");
        if (d.email) mailCel.append(mailLink(d.email, d.email));
        cel(tr, datumFormaat.format(new Date(d.created_at)));
        const td = cel(tr, "");
        const weg = document.createElement("button");
        weg.type = "button";
        weg.className = "link-knop gevaar";
        weg.textContent = "Inschrijving verwijderen";
        weg.title = `Verwijdert de volledige inschrijving van ${d.email}`;
        weg.addEventListener("click", () => verwijder(d));
        td.append(weg);
        return tr;
      })
    );
    if (!zichtbaar.length) {
      const tr = document.createElement("tr");
      cel(tr, term ? "Geen deelnemers gevonden." : "Nog geen inschrijvingen.").colSpan = 11;
      tbody.append(tr);
    }
  }

  // Starten aan de administratiepost: klik op het nummer (wandelaars: op "Start")
  const uur = new Intl.DateTimeFormat("nl-BE", { hour: "2-digit", minute: "2-digit" });
  function startCel(tr, d) {
    const td = cel(tr, "");
    if (d.supporter) return void (td.textContent = "–");
    const knop = document.createElement("button");
    knop.type = "button";
    knop.className = "start-knop" + (d.gestart_op ? " gestart" : "");
    knop.textContent = d.nr ?? "▶";
    knop.title = d.gestart_op
      ? `Gestart om ${uur.format(new Date(d.gestart_op))} – klik om de start ongedaan te maken`
      : `Klik om ${d.naam} te laten starten`;
    knop.addEventListener("click", async () => {
      const starten = !d.gestart_op;
      if (!starten && !confirm(`De start van ${d.naam} ongedaan maken?`)) return;
      knop.disabled = true;
      const { error } = await db.rpc("start_deelnemer", { p_deelnemer: d.id, p_start: starten });
      knop.disabled = false;
      if (error) {
        console.error(error);
        return alert("Starten mislukt.");
      }
      laad();
    });
    td.append(knop);
    if (d.gestart_op) {
      const t = document.createElement("small");
      t.className = "start-uur";
      t.textContent = uur.format(new Date(d.gestart_op));
      td.append(t);
    }
  }

  // Rondjes ingeven of aanpassen (aan de administratiepost)
  function rondjesCel(tr, d) {
    const td = cel(tr, "");
    if (d.supporter) return;
    if (!d.loopt) return wandelKlaarKnop(td, d); // wandelaars: vaste tocht, geen rondjes
    const wrap = document.createElement("div");
    wrap.className = "rondjes-invoer";
    const inp = Object.assign(document.createElement("input"), { type: "number", min: 0, max: 200, inputMode: "numeric", value: d.rondjes ?? "" });
    inp.setAttribute("aria-label", `Rondjes van ${d.naam}`);
    const knop = Object.assign(document.createElement("button"), { type: "button", className: "knop-klein", textContent: "✓" });
    knop.title = "Rondjes opslaan";
    knop.addEventListener("click", async () => {
      const aantal = parseInt(inp.value, 10);
      if (!(aantal >= 0 && aantal <= 200)) return alert("Geef een aantal rondjes in (0 tot 200).");
      const gemaild = d.sponsors.filter((s) => s.communicatie === "mail" && s.mail_verstuurd_op).length;
      const nieuw = d.sponsors.filter((s) => s.communicatie === "mail" && !s.mail_verstuurd_op).length;
      let vraag = `${d.naam}: ${aantal} rondjes opslaan?`;
      if (nieuw) vraag += `\n\n${nieuw} sponsor(s) krijgen een mail met het bedrag.`;
      if (!confirm(vraag)) return;
      let opnieuw = false;
      if (gemaild && d.rondjes !== aantal) {
        opnieuw = confirm(`${gemaild} sponsor(s) kregen al een mail met het oude aantal (${d.rondjes}).\nWil je hen een nieuwe mail sturen met het juiste bedrag?`);
      }
      knop.disabled = true;
      const { data, error } = await db.rpc("rondjes_opslaan", { p_deelnemer: d.id, p_aantal: aantal, p_opnieuw: opnieuw });
      knop.disabled = false;
      if (error) {
        console.error(error);
        return alert("Opslaan mislukt.");
      }
      if (data?.gemaild) alert(`${data.gemaild} sponsor(s) gemaild.`);
      laad();
    });
    wrap.append(inp, knop);
    td.append(wrap);
  }

  // Wandelaars: één knop "Klaar" (vaste tocht; bewaard als 1 = volbracht)
  function wandelKlaarKnop(td, d) {
    const knop = Object.assign(document.createElement("button"), { type: "button" });
    knop.className = "knop-klein" + (d.rondjes != null ? " klaar-ok" : "");
    knop.textContent = d.rondjes != null ? "✓ Klaar" : "Klaar";
    knop.title = d.rondjes != null ? "Wandeltocht volbracht" : `${d.naam} heeft de wandeltocht uitgewandeld`;
    knop.disabled = d.rondjes != null;
    knop.addEventListener("click", async () => {
      const nieuw = d.sponsors.filter((s) => s.communicatie === "mail" && !s.mail_verstuurd_op).length;
      if (!confirm(`${d.naam} heeft de wandeltocht uitgewandeld?` + (nieuw ? `\n\n${nieuw} sponsor(s) krijgen een mail met het bedrag.` : ""))) return;
      knop.disabled = true;
      const { data, error } = await db.rpc("rondjes_opslaan", { p_deelnemer: d.id, p_aantal: 1 });
      if (error) {
        console.error(error);
        knop.disabled = false;
        return alert("Opslaan mislukt.");
      }
      if (data?.gemaild) alert(`${data.gemaild} sponsor(s) gemaild.`);
      laad();
    });
    td.append(knop);
  }

  function toonVragen() {
    const lijst = document.getElementById("vragen-lijst");
    const metVraag = inschrijvingen.filter((i) => i.vragen);
    lijst.replaceChildren(
      ...metVraag.map((i) => {
        const div = document.createElement("article");
        div.className = "vraag";
        const p = document.createElement("p");
        p.textContent = i.vragen;
        const f = document.createElement("footer");
        f.textContent = `${i.email} · ${i.deelnemers.map((d) => d.naam).join(", ")} · ${datumFormaat.format(new Date(i.created_at))}`;
        const citaat = i.vragen.split("\n").map((r) => "> " + r).join("\n");
        const body = `Hallo,\n\n\n\nSportieve groeten,\nRunning for Pauline\n\n${citaat}`;
        const antwoord = mailLink(i.email, "✉️ Beantwoorden", "Re: je vraag – Running for Pauline", body);
        antwoord.className = "knop-klein vraag-antwoord";
        div.append(p, f, antwoord);
        return div;
      })
    );
    if (!metVraag.length) lijst.innerHTML = '<p class="intro">Nog geen vragen of opmerkingen.</p>';
  }

  async function verwijder(d) {
    const i = inschrijvingen.find((x) => x.user_id === d.user_id);
    const namen = i.deelnemers.map((x) => x.naam).join(", ");
    if (!confirm(`De volledige inschrijving van ${i.email} verwijderen?\n\nDeelnemers: ${namen}`)) return;
    const { error } = await db.from("inschrijvingen").delete().eq("user_id", d.user_id);
    if (error) {
      console.error(error);
      return alert("Verwijderen mislukt.");
    }
    await laad();
  }

  // ---------- Bedrijfssponsors (tabel partners + logo's in bucket partners) ----------
  const P = window.partners;
  const partnerLijst = document.getElementById("partners-lijst");
  const pForm = document.getElementById("partner-form");
  const pMelding = pForm.querySelector(".form-melding");
  const pKnop = pForm.querySelector("button[type=submit]");
  const pAnnuleer = document.getElementById("partner-annuleer");
  const pGekozen = pForm.querySelector(".foto-gekozen");
  const pVoorbeeld = pForm.querySelector(".partner-voorbeeld");
  const LOGO_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
  const LOGO_MAX = 2 * 1024 * 1024;
  let partnerRijen = [];
  let bewerkt = null;   // partner die bewerkt wordt (null = nieuwe)
  let logoBestand = null;

  function pToon(tekst, fout = false) {
    pMelding.hidden = !tekst;
    pMelding.textContent = tekst || "";
    pMelding.classList.toggle("fout", fout);
  }

  async function laadPartners() {
    const { data, error } = await db.from("partners").select("*");
    if (error) {
      console.error(error);
      partnerLijst.innerHTML = '<p class="intro">De bedrijfssponsors konden niet geladen worden. Is <code>supabase/partners.sql</code> al uitgevoerd?</p>';
      return;
    }
    partnerRijen = P.sorteer(data);
    toonPartners();
  }

  function toonPartners() {
    partnerLijst.replaceChildren();
    if (!partnerRijen.length) {
      partnerLijst.innerHTML = '<p class="intro">Nog geen bedrijfssponsors. Voeg er hieronder een toe.</p>';
      return;
    }
    P.NIVEAUS.forEach((n) => {
      const groep = partnerRijen.filter((p) => p.niveau === n.key);
      if (!groep.length) return;
      const kop = document.createElement("h3");
      kop.textContent = n.meervoud;
      partnerLijst.append(kop);
      groep.forEach((p, i) => partnerLijst.append(partnerRij(p, groep, i)));
    });
  }

  function knopje(tekst, titel, actie, klasse = "knop-klein") {
    const b = Object.assign(document.createElement("button"), { type: "button", className: klasse, textContent: tekst, title: titel });
    b.addEventListener("click", actie);
    return b;
  }

  function partnerRij(p, groep, i) {
    const rij = document.createElement("article");
    rij.className = "partner-rij" + (p.zichtbaar ? "" : " verborgen");
    const img = Object.assign(document.createElement("img"), { src: P.logoUrl(p), alt: "", loading: "lazy" });
    const info = document.createElement("div");
    const naam = document.createElement("strong");
    naam.textContent = p.naam + (p.zichtbaar ? "" : " (verborgen)");
    info.append(naam);
    if (p.tekst) {
      const t = document.createElement("small");
      t.textContent = p.tekst;
      info.append(t);
    }
    const acties = document.createElement("div");
    acties.className = "partner-acties";
    const omhoog = knopje("▲", "Hoger in de lijst", () => verschuif(groep, i, -1));
    const omlaag = knopje("▼", "Lager in de lijst", () => verschuif(groep, i, 1));
    omhoog.disabled = i === 0;
    omlaag.disabled = i === groep.length - 1;
    acties.append(
      omhoog, omlaag,
      knopje(p.zichtbaar ? "🙈 Verbergen" : "👁️ Tonen", p.zichtbaar ? "Niet meer tonen aan bezoekers" : "Terug tonen", () => zetZichtbaar(p)),
      knopje("✏️ Bewerken", "Gegevens of logo aanpassen", () => bewerk(p)),
      knopje("Verwijderen", `${p.naam} definitief verwijderen`, () => verwijderPartner(p), "link-knop gevaar")
    );
    rij.append(img, info, acties);
    return rij;
  }

  async function bijwerken(id, velden) {
    const { error } = await db.from("partners").update(velden).eq("id", id);
    if (error) {
      console.error(error);
      alert("Opslaan mislukt. Ben je nog ingelogd als beheerder?");
      return false;
    }
    return true;
  }

  // Volgorde binnen een niveau: hernummer de groep en wissel twee buren
  async function verschuif(groep, i, stap) {
    const nieuw = [...groep];
    [nieuw[i], nieuw[i + stap]] = [nieuw[i + stap], nieuw[i]];
    const wijzigingen = nieuw.map((p, volgorde) => (p.volgorde === volgorde ? null : bijwerken(p.id, { volgorde }))).filter(Boolean);
    await Promise.all(wijzigingen);
    laadPartners();
  }

  async function zetZichtbaar(p) {
    if (await bijwerken(p.id, { zichtbaar: !p.zichtbaar })) laadPartners();
  }

  async function verwijderPartner(p) {
    if (!confirm(`${p.naam} definitief verwijderen? Het logo wordt ook verwijderd.\n\nTip: met "Verbergen" kan je hem later terug tonen.`)) return;
    const { error } = await db.from("partners").delete().eq("id", p.id);
    if (error) {
      console.error(error);
      return alert("Verwijderen mislukt. Ben je nog ingelogd als beheerder?");
    }
    const { error: logoFout } = await db.storage.from(P.BUCKET).remove([p.logo_pad]);
    if (logoFout) console.error(logoFout); // sponsor is weg; logo blijft enkel in de opslag
    if (bewerkt?.id === p.id) resetPartnerForm();
    laadPartners();
  }

  function zetLogo(bestand, url) {
    if (pVoorbeeld.src.startsWith("blob:")) URL.revokeObjectURL(pVoorbeeld.src);
    logoBestand = bestand;
    pGekozen.hidden = !(bestand || url);
    if (bestand) pVoorbeeld.src = URL.createObjectURL(bestand);
    else if (url) pVoorbeeld.src = url;
    else pVoorbeeld.removeAttribute("src");
  }

  function bewerk(p) {
    bewerkt = p;
    const f = pForm.elements;
    f.naam.value = p.naam;
    f.niveau.value = p.niveau;
    f.tekst.value = p.tekst || "";
    f.url.value = p.url || "";
    zetLogo(null, P.logoUrl(p));
    document.getElementById("partner-form-titel").textContent = `${p.naam} bewerken`;
    pAnnuleer.hidden = false;
    pToon("");
    pForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetPartnerForm() {
    bewerkt = null;
    pForm.reset();
    zetLogo(null);
    document.getElementById("partner-form-titel").textContent = "Sponsor toevoegen";
    pAnnuleer.hidden = true;
  }

  pAnnuleer.addEventListener("click", () => {
    resetPartnerForm();
    pToon("");
  });

  pForm.elements.logo.addEventListener("change", (e) => {
    const bestand = e.target.files[0];
    e.target.value = ""; // zelfde bestand opnieuw kiezen moet ook werken
    if (!bestand) return;
    if (!LOGO_TYPES[bestand.type]) return pToon("Kies een PNG-, JPG- of WebP-afbeelding (geen SVG of PDF).", true);
    if (bestand.size > LOGO_MAX) return pToon(`Dit logo is ${(bestand.size / 1048576).toFixed(1)} MB; het mag maximaal 2 MB zijn.`, true);
    pToon("");
    zetLogo(bestand);
  });

  pForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = pForm.elements;
    const naam = f.naam.value.trim();
    const tekst = f.tekst.value.trim() || null;
    let url = f.url.value.trim() || null;
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    if (url) url = url.replace(/^http:\/\//i, "https://");
    if (!naam) return pToon("Vul de naam van het bedrijf in.", true);
    if (url && !P.veiligeUrl(url)) return pToon("Dat is geen geldig webadres.", true);
    if (!bewerkt && !logoBestand) return pToon("Kies een logo.", true);

    pKnop.disabled = true;
    pToon("Bezig met opslaan…");
    let nieuwPad = null;
    try {
      if (logoBestand) {
        nieuwPad = `${crypto.randomUUID()}.${LOGO_TYPES[logoBestand.type]}`;
        const { error } = await db.storage.from(P.BUCKET).upload(nieuwPad, logoBestand, { contentType: logoBestand.type });
        if (error) throw error;
      }
      const velden = { naam, niveau: f.niveau.value, tekst, url };
      if (nieuwPad) velden.logo_pad = nieuwPad;

      if (bewerkt) {
        if (bewerkt.niveau !== velden.niveau) velden.volgorde = 999; // achteraan in het nieuwe niveau
        const { error } = await db.from("partners").update(velden).eq("id", bewerkt.id);
        if (error) throw error;
        if (nieuwPad) {
          const { error: oudFout } = await db.storage.from(P.BUCKET).remove([bewerkt.logo_pad]);
          if (oudFout) console.error(oudFout);
        }
      } else {
        velden.volgorde = 999; // nieuwe sponsors achteraan in hun niveau
        const { error } = await db.from("partners").insert(velden);
        if (error) throw error;
      }
      const melding = bewerkt ? `${naam} is bijgewerkt.` : `${naam} staat nu op de sponsorpagina.`;
      resetPartnerForm();
      pToon(melding);
      laadPartners();
    } catch (err) {
      console.error(err);
      if (nieuwPad) db.storage.from(P.BUCKET).remove([nieuwPad]); // geen wees-logo achterlaten
      pToon("Opslaan mislukt. Ben je nog ingelogd als beheerder?", true);
    } finally {
      pKnop.disabled = false;
    }
  });

  zoek.addEventListener("input", toonTabel);
  document.getElementById("vernieuw-knop").addEventListener("click", laad);

  // CSV (één rij per deelnemer) met ; en BOM zodat Excel met Belgische instellingen het meteen goed opent
  document.getElementById("csv-knop").addEventListener("click", () => {
    const kop = ["nr", "naam", "loopt", "wandelt", "supporter", "gestart om", "rondjes", "aantal sponsors", "opgehaald", "ingeschreven door", "vragen", "datum"];
    const veilig = (w) => `"${String(w ?? "").replace(/"/g, '""')}"`;
    const regels = deelnemers.map((d) =>
      [d.nr ?? "", d.naam, d.loopt ? "ja" : "nee", d.wandelt ? "ja" : "nee", d.supporter ? "ja" : "nee", d.gestart_op ? new Date(d.gestart_op).toLocaleTimeString("nl-BE") : "", d.loopt ? d.rondjes ?? "" : d.rondjes != null ? "klaar" : "", d.sponsors.length, d.sponsors.length ? d.opgehaald.toFixed(2).replace(".", ",") : "", d.email, d.vragen, new Date(d.created_at).toLocaleString("nl-BE")].map(veilig).join(";")
    );
    const csv = [kop.join(";"), ...regels].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "deelnemers-running-for-pauline.csv" });
    a.click();
    URL.revokeObjectURL(url);
  });

  // CSV met alle sponsors (één rij per sponsor) – handig om betalingen op te volgen
  document.getElementById("csv-sponsors-knop").addEventListener("click", () => {
    const kop = ["deelnemer nr", "deelnemer", "sponsor", "soort", "bedrag", "rondjes", "te betalen", "communicatie", "e-mail sponsor", "gemaild op", "ingeschreven door"];
    const veilig = (w) => `"${String(w ?? "").replace(/"/g, '""')}"`;
    const komma = (n) => Number(n).toFixed(2).replace(".", ",");
    const regels = deelnemers.flatMap((d) =>
      d.sponsors.map((s) =>
        [d.nr ?? "", d.naam, s.naam, s.soort === "vast" ? "vast bedrag" : "per rondje", komma(s.bedrag), d.rondjes ?? "",
         d.rondjes == null && s.soort === "per_rondje" ? "" : komma(bedragVan(s, d.rondjes)),
         s.communicatie === "mail" ? "mail" : "zelf", s.email ?? "",
         s.mail_verstuurd_op ? new Date(s.mail_verstuurd_op).toLocaleString("nl-BE") : "", d.email]
          .map(veilig).join(";")
      )
    );
    const csv = [kop.join(";"), ...regels].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "sponsors-running-for-pauline.csv" });
    a.click();
    URL.revokeObjectURL(url);
  });

  start();
})();

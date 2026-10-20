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
  }

  async function laad() {
    const [ins, sp, ro] = await Promise.all([
      db.from("inschrijvingen").select("*").order("created_at"),
      db.from("sponsors").select("*").order("created_at"),
      db.from("rondjes").select("deelnemer_id, aantal"),
    ]);
    const data = ins.data;
    const error = ins.error || sp.error || ro.error;
    if (error) {
      console.error(error);
      status.hidden = false;
      status.textContent = "De inschrijvingen konden niet geladen worden.";
      return;
    }
    inschrijvingen = data;
    sponsors = sp.data;
    const rondjesVan = Object.fromEntries(ro.data.map((r) => [r.deelnemer_id, r.aantal]));
    deelnemers = data.flatMap((i) =>
      i.deelnemers.map((d) => {
        const eigen = sponsors.filter((s) => s.deelnemer_id === d.id);
        const rondjes = rondjesVan[d.id] ?? null;
        return {
          ...d, email: i.email, created_at: i.created_at, vragen: i.vragen, user_id: i.user_id,
          sponsors: eigen, rondjes,
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
    zet("stat-klaar", deelnemers.filter((d) => d.rondjes != null).length);
    zet("stat-rondjes", deelnemers.reduce((som, d) => som + (d.rondjes || 0), 0));
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
        cel(tr, d.nr ?? "–");
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

  // Rondjes ingeven of aanpassen (aan de administratiepost)
  function rondjesCel(tr, d) {
    const td = cel(tr, "");
    if (d.supporter) return;
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

  zoek.addEventListener("input", toonTabel);
  document.getElementById("vernieuw-knop").addEventListener("click", laad);

  // CSV (één rij per deelnemer) met ; en BOM zodat Excel met Belgische instellingen het meteen goed opent
  document.getElementById("csv-knop").addEventListener("click", () => {
    const kop = ["nr", "naam", "loopt", "wandelt", "supporter", "rondjes", "aantal sponsors", "opgehaald", "ingeschreven door", "vragen", "datum"];
    const veilig = (w) => `"${String(w ?? "").replace(/"/g, '""')}"`;
    const regels = deelnemers.map((d) =>
      [d.nr ?? "", d.naam, d.loopt ? "ja" : "nee", d.wandelt ? "ja" : "nee", d.supporter ? "ja" : "nee", d.rondjes ?? "", d.sponsors.length, d.sponsors.length ? d.opgehaald.toFixed(2).replace(".", ",") : "", d.email, d.vragen, new Date(d.created_at).toLocaleString("nl-BE")].map(veilig).join(";")
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

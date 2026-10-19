// Beheer: inschrijvingen opvolgen (tellers, deelnemerslijst, vragen) + export naar CSV.
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
    const { data, error } = await db.from("inschrijvingen").select("*").order("created_at");
    if (error) {
      console.error(error);
      status.hidden = false;
      status.textContent = "De inschrijvingen konden niet geladen worden.";
      return;
    }
    inschrijvingen = data;
    deelnemers = data.flatMap((i) =>
      i.deelnemers.map((d) => ({ ...d, email: i.email, created_at: i.created_at, vragen: i.vragen, user_id: i.user_id }))
    );
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
    const zichtbaar = deelnemers.filter((d) => !term || d.naam.toLowerCase().includes(term) || (d.email || "").toLowerCase().includes(term));
    const tbody = document.getElementById("admin-rijen");
    tbody.replaceChildren(
      ...zichtbaar.map((d, i) => {
        const tr = document.createElement("tr");
        cel(tr, i + 1);
        cel(tr, d.naam);
        cel(tr, d.loopt ? "✓" : "", "ja");
        cel(tr, d.wandelt ? "✓" : "", "ja");
        cel(tr, d.supporter ? "✓" : "", "ja");
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
      cel(tr, term ? "Geen deelnemers gevonden." : "Nog geen inschrijvingen.").colSpan = 8;
      tbody.append(tr);
    }
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
    if (!metVraag.length) lijst.innerHTML = '<p class="intro">Nog geen vragen.</p>';
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
    const kop = ["naam", "loopt", "wandelt", "supporter", "ingeschreven door", "vragen", "datum"];
    const veilig = (w) => `"${String(w ?? "").replace(/"/g, '""')}"`;
    const regels = deelnemers.map((d) =>
      [d.naam, d.loopt ? "ja" : "nee", d.wandelt ? "ja" : "nee", d.supporter ? "ja" : "nee", d.email, d.vragen, new Date(d.created_at).toLocaleString("nl-BE")].map(veilig).join(";")
    );
    const csv = [kop.join(";"), ...regels].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "deelnemers-running-for-pauline.csv" });
    a.click();
    URL.revokeObjectURL(url);
  });

  start();
})();

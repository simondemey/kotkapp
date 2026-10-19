// Beheer: overzicht van alle inschrijvingen + export naar CSV. Enkel voor beheerders (zie supabase/accounts.sql).
(function () {
  const db = window.sb;
  const status = document.getElementById("admin-status");
  const inhoud = document.getElementById("admin-inhoud");
  if (!db || !status) return;

  const KM_PER_RONDJE = { lopen: 1.7, wandelen: 5 };
  const datumFormaat = new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  let rijen = [];

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

    const { data, error } = await db.from("inschrijvingen").select("*").order("created_at");
    if (error) {
      console.error(error);
      status.textContent = "De inschrijvingen konden niet geladen worden.";
      return;
    }
    rijen = data;
    status.hidden = true;
    inhoud.hidden = false;
    toon();
  }

  function toon() {
    const lopers = rijen.filter((r) => r.deelname === "lopen");
    const km = rijen.reduce((som, r) => som + (r.rondjes_doel || 0) * (KM_PER_RONDJE[r.deelname] || 0), 0);
    document.getElementById("stat-totaal").textContent = rijen.length;
    document.getElementById("stat-lopers").textContent = lopers.length;
    document.getElementById("stat-wandelaars").textContent = rijen.length - lopers.length;
    document.getElementById("stat-km").textContent = Math.round(km);

    const tbody = document.getElementById("admin-rijen");
    tbody.replaceChildren(
      ...rijen.map((r) => {
        const tr = document.createElement("tr");
        [
          `${r.voornaam} ${r.achternaam}`,
          r.deelname === "lopen" ? "🏃 lopen" : "🚶 wandelen",
          r.rondjes_doel ?? "",
          r.email ?? "",
          r.telefoon ?? "",
          r.opmerking ?? "",
          datumFormaat.format(new Date(r.created_at)),
        ].forEach((waarde) => {
          const td = document.createElement("td");
          td.textContent = waarde;
          tr.append(td);
        });
        return tr;
      })
    );
    if (!rijen.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="7">Nog geen inschrijvingen.</td>';
      tbody.append(tr);
    }
  }

  // CSV met ; en BOM zodat Excel (Belgische instellingen) het meteen goed opent
  document.getElementById("csv-knop").addEventListener("click", () => {
    const kolommen = ["voornaam", "achternaam", "deelname", "rondjes_doel", "email", "telefoon", "opmerking", "created_at"];
    const cel = (w) => `"${String(w ?? "").replace(/"/g, '""')}"`;
    const csv = [kolommen.join(";"), ...rijen.map((r) => kolommen.map((k) => cel(r[k])).join(";"))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "inschrijvingen-running-for-pauline.csv" });
    a.click();
    URL.revokeObjectURL(url);
  });

  start();
})();

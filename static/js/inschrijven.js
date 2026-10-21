// Inschrijven: inloggen met een e-mail-inloglink, daarna de eigen inschrijving (1–10 deelnemers) invullen of aanpassen.
// Elke deelnemer kiest precies één: loopt, wandelt of supporter.
(function () {
  const db = window.sb;
  const laden = document.getElementById("account-laden");
  const loginForm = document.getElementById("login-form");
  const form = document.getElementById("inschrijf-form");
  if (!db || !loginForm || !form) return;

  const MAX = Number(form.dataset.max) || 10;
  const lijst = document.getElementById("deelnemers");
  const sjabloon = document.getElementById("deelnemer-sjabloon");
  const toevoegen = document.getElementById("deelnemer-toevoegen");
  const badge = document.getElementById("status-badge");
  const uitschrijven = document.getElementById("uitschrijven");
  const adminLink = document.getElementById("admin-link");
  let gebruiker = null;

  function melding(formulier, tekst, fout = false) {
    const el = formulier.querySelector(".form-melding");
    el.hidden = !tekst;
    el.textContent = tekst || "";
    el.classList.toggle("fout", fout);
  }

  // ---------- Inloggen ----------
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = loginForm.elements.email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return melding(loginForm, "Vul een geldig e-mailadres in.", true);

    const knop = loginForm.querySelector("button");
    knop.disabled = true;
    melding(loginForm, "Bezig met versturen…");
    const { error } = await db.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    knop.disabled = false;
    if (error) {
      console.error(error);
      const teSnel = error.status === 429 || /rate|seconds/i.test(error.message);
      return melding(loginForm, teSnel ? "Even geduld: je kan zo dadelijk opnieuw een link aanvragen." : "Versturen mislukt. Probeer het opnieuw.", true);
    }
    melding(loginForm, loginForm.dataset.bedankt);
  });

  document.getElementById("uitloggen").addEventListener("click", () => db.auth.signOut());

  // ---------- Deelnemers ----------
  function hernummer() {
    const kaarten = [...lijst.children];
    kaarten.forEach((k, i) => {
      k.querySelector(".nr").textContent = i + 1;
      k.querySelector(".d-weg").hidden = kaarten.length === 1;
    });
    toevoegen.hidden = kaarten.length >= MAX;
  }

  let volgnummer = 0; // maakt de name van de keuzerondjes per deelnemer uniek

  // Een deelnemer kiest precies één: loopt, wandelt of supporter
  function keuzeVan(d) {
    if (d.loopt) return "loopt";
    if (d.wandelt) return "wandelt";
    if (d.supporter) return "supporter";
    return "";
  }

  function voegDeelnemerToe(d = { naam: "", loopt: false, wandelt: false, supporter: false }) {
    if (lijst.children.length >= MAX) return null;
    const kaart = sjabloon.content.firstElementChild.cloneNode(true);
    const naam = `keuze-${++volgnummer}`;
    kaart.querySelector(".d-naam").value = d.naam;
    // Vast nummer (uitgedeeld door de database na het opslaan)
    if (d.id) kaart.dataset.id = d.id; // vaste id (voor sponsors en rondjes)
    if (d.nr) {
      kaart.dataset.nr = d.nr;
      const badge = kaart.querySelector(".d-nummer");
      badge.textContent = `nr. ${d.nr}`;
      badge.hidden = false;
    }
    kaart.querySelectorAll(".d-keuze").forEach((r) => {
      r.name = naam;
      r.checked = r.value === keuzeVan(d);
    });
    kaart.querySelector(".d-weg").addEventListener("click", () => {
      kaart.remove();
      hernummer();
    });
    lijst.append(kaart);
    hernummer();
    return kaart;
  }

  toevoegen.addEventListener("click", () => voegDeelnemerToe()?.querySelector(".d-naam").focus());

  function leesDeelnemers() {
    return [...lijst.children].map((k) => {
      const keuze = k.querySelector(".d-keuze:checked")?.value;
      return {
        ...(k.dataset.id ? { id: k.dataset.id } : {}), // bestaande deelnemer behouden
        ...(k.dataset.nr ? { nr: Number(k.dataset.nr) } : {}), // bestaand nummer behouden
        naam: k.querySelector(".d-naam").value.trim(),
        loopt: keuze === "loopt",
        wandelt: keuze === "wandelt",
        supporter: keuze === "supporter",
      };
    });
  }

  // ---------- Inschrijving laden / opslaan ----------
  async function toonInschrijving() {
    const { data, error } = await db.from("inschrijvingen").select("deelnemers, vragen").eq("user_id", gebruiker.id).maybeSingle();
    if (error) console.error(error);

    form.reset();
    lijst.replaceChildren();
    document.getElementById("account-email").textContent = gebruiker.email;
    (data?.deelnemers?.length ? data.deelnemers : [undefined]).forEach((d) => voegDeelnemerToe(d));
    form.elements.vragen.value = data?.vragen ?? "";
    form.elements.privacy.checked = !!data;
    badge.hidden = !data;
    uitschrijven.hidden = !data;
    melding(form, "");
    adminLink.hidden = !(await window.sbIsAdmin());
    const metNummer = (data?.deelnemers ?? []).filter((d) => d.nr);
    toonNummers(metNummer);
    return !!data;
  }

  // Overzicht met grote nummers bovenaan
  function toonNummers(deelnemers) {
    const overzicht = document.getElementById("nummers-overzicht");
    overzicht.hidden = !deelnemers.length;
    overzicht.replaceChildren(
      ...deelnemers.map((d) => {
        const kaart = document.createElement("div");
        kaart.className = "nummer-kaart";
        const nr = document.createElement("span");
        nr.className = "nummer-groot";
        nr.textContent = d.nr;
        const naam = document.createElement("span");
        naam.className = "nummer-naam";
        naam.textContent = d.naam;
        const soort = document.createElement("span");
        soort.className = "nummer-soort";
        soort.textContent = d.loopt ? "🏃 Loopt" : d.wandelt ? "🚶 Wandelt" : "📣 Supporter";
        kaart.append(nr, naam, soort);
        return kaart;
      })
    );
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const deelnemers = leesDeelnemers();
    const zonderNaam = deelnemers.findIndex((d) => !d.naam);
    if (zonderNaam >= 0) return melding(form, `Vul de naam van deelnemer ${zonderNaam + 1} in.`, true);
    const zonderKeuze = deelnemers.findIndex((d) => !d.loopt && !d.wandelt && !d.supporter);
    if (zonderKeuze >= 0) return melding(form, `Kies of deelnemer ${zonderKeuze + 1} loopt, wandelt of komt supporteren.`, true);
    if (!form.elements.privacy.checked) return melding(form, "Vink het privacyvakje aan.", true);

    const knop = form.querySelector("button[type=submit]");
    knop.disabled = true;

    // Login nog geldig? getSession vernieuwt een verlopen login automatisch
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
      knop.disabled = false;
      return sessieVerlopen();
    }

    const { error } = await db.from("inschrijvingen").upsert(
      { user_id: gebruiker.id, deelnemers, vragen: form.elements.vragen.value.trim() || null },
      { onConflict: "user_id" }
    );
    knop.disabled = false;
    if (error) {
      console.error(error);
      if (error.code === "42501" || error.status === 401 || /jwt/i.test(error.message)) return sessieVerlopen();
      return melding(form, "Opslaan mislukt. Probeer het opnieuw.", true);
    }
    // Naar "Mijn deelname": nummers, sponsors en later de rondjes
    melding(form, form.dataset.opgeslagen);
    location.href = "deelname.html?nieuw=1";
  });

  uitschrijven.addEventListener("click", async () => {
    if (!confirm("Wil je je inschrijving echt verwijderen?")) return;
    const { error } = await db.from("inschrijvingen").delete().eq("user_id", gebruiker.id);
    if (error) {
      console.error(error);
      return melding(form, "Verwijderen mislukt. Probeer het opnieuw.", true);
    }
    await toonInschrijving();
    melding(form, "Je inschrijving is verwijderd.");
  });

  // Login verlopen: terug naar het inlogformulier met uitleg
  async function sessieVerlopen() {
    await render(null);
    melding(loginForm, "Je bent niet meer ingelogd. Vraag hieronder een nieuwe inloglink aan en sla daarna opnieuw op.", true);
    loginForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---------- Juiste stap tonen ----------
  // Al ingeschreven? Dan is "Mijn deelname" de startpagina; aanpassen kan via ?aanpassen=1
  const aanpassen = new URLSearchParams(location.search).has("aanpassen");

  async function render(session) {
    gebruiker = session?.user ?? null;
    loginForm.hidden = !!gebruiker;
    form.hidden = true;
    if (!gebruiker) {
      laden.hidden = true;
      return;
    }
    const ingeschreven = await toonInschrijving();
    if (ingeschreven && !aanpassen) return location.replace("deelname.html");
    laden.hidden = true;
    form.hidden = false;
  }

  db.auth.onAuthStateChange((_event, session) => {
    // Supabase raadt aan geen andere Supabase-calls in deze callback te awaiten
    setTimeout(() => render(session), 0);
  });
})();

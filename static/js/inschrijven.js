// Inschrijven: inloggen met een e-mail-inloglink, daarna de eigen inschrijving (1–10 deelnemers) invullen of aanpassen.
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

  function voegDeelnemerToe(d = { naam: "", loopt: false, wandelt: false }) {
    if (lijst.children.length >= MAX) return null;
    const kaart = sjabloon.content.firstElementChild.cloneNode(true);
    kaart.querySelector(".d-naam").value = d.naam;
    kaart.querySelector(".d-loopt").checked = d.loopt;
    kaart.querySelector(".d-wandelt").checked = d.wandelt;
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
    return [...lijst.children].map((k) => ({
      naam: k.querySelector(".d-naam").value.trim(),
      loopt: k.querySelector(".d-loopt").checked,
      wandelt: k.querySelector(".d-wandelt").checked,
    }));
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
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const deelnemers = leesDeelnemers();
    const zonderNaam = deelnemers.findIndex((d) => !d.naam);
    if (zonderNaam >= 0) return melding(form, `Vul de naam van deelnemer ${zonderNaam + 1} in.`, true);
    const zonderKeuze = deelnemers.findIndex((d) => !d.loopt && !d.wandelt);
    if (zonderKeuze >= 0) return melding(form, `Kies of deelnemer ${zonderKeuze + 1} loopt, wandelt of allebei.`, true);
    if (!form.elements.privacy.checked) return melding(form, "Vink het privacyvakje aan.", true);

    const knop = form.querySelector("button[type=submit]");
    knop.disabled = true;
    const { error } = await db.from("inschrijvingen").upsert(
      { user_id: gebruiker.id, deelnemers, vragen: form.elements.vragen.value.trim() || null },
      { onConflict: "user_id" }
    );
    knop.disabled = false;
    if (error) {
      console.error(error);
      return melding(form, "Opslaan mislukt. Probeer het opnieuw.", true);
    }
    badge.hidden = false;
    uitschrijven.hidden = false;
    melding(form, form.dataset.opgeslagen);
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

  // ---------- Juiste stap tonen ----------
  async function render(session) {
    gebruiker = session?.user ?? null;
    laden.hidden = true;
    loginForm.hidden = !!gebruiker;
    form.hidden = !gebruiker;
    if (gebruiker) await toonInschrijving();
  }

  db.auth.onAuthStateChange((_event, session) => {
    // Supabase raadt aan geen andere Supabase-calls in deze callback te awaiten
    setTimeout(() => render(session), 0);
  });
})();

// Inschrijven: inloggen met een e-mail-inloglink, daarna de eigen inschrijving invullen of aanpassen.
(function () {
  const db = window.sb;
  const laden = document.getElementById("account-laden");
  const loginForm = document.getElementById("login-form");
  const form = document.getElementById("inschrijf-form");
  if (!db || !loginForm || !form) return;

  const VELDEN = ["voornaam", "achternaam", "telefoon", "deelname", "rondjes_doel", "opmerking"];
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

  document.getElementById("uitloggen").addEventListener("click", async () => {
    await db.auth.signOut();
  });

  // ---------- Inschrijving ----------
  async function toonInschrijving() {
    const { data, error } = await db.from("inschrijvingen").select(VELDEN.join(",")).eq("user_id", gebruiker.id).maybeSingle();
    if (error) console.error(error);

    form.reset();
    document.getElementById("account-email").textContent = gebruiker.email;
    badge.hidden = !data;
    uitschrijven.hidden = !data;
    form.elements.privacy.checked = !!data;
    if (data) {
      VELDEN.forEach((v) => {
        if (data[v] == null) return;
        if (v === "deelname") form.querySelector(`input[name=deelname][value="${data[v]}"]`).checked = true;
        else form.elements[v].value = data[v];
      });
    }
    melding(form, "");
    adminLink.hidden = !(await window.sbIsAdmin());
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const el = form.elements;
    const rij = {
      user_id: gebruiker.id,
      voornaam: el.voornaam.value.trim(),
      achternaam: el.achternaam.value.trim(),
      telefoon: el.telefoon.value.trim() || null,
      deelname: el.deelname.value,
      rondjes_doel: el.rondjes_doel.value === "" ? null : Number(el.rondjes_doel.value),
      opmerking: el.opmerking.value.trim() || null,
    };
    if (!rij.voornaam || !rij.achternaam) return melding(form, "Vul je voor- en achternaam in.", true);
    if (!rij.deelname) return melding(form, "Kies of je loopt of wandelt.", true);
    if (!el.privacy.checked) return melding(form, "Vink het privacyvakje aan.", true);

    const knop = form.querySelector("button[type=submit]");
    knop.disabled = true;
    const { error } = await db.from("inschrijvingen").upsert(rij, { onConflict: "user_id" });
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
    document.getElementById("account-intro").hidden = !!gebruiker;
    if (gebruiker) await toonInschrijving();
  }

  db.auth.onAuthStateChange((_event, session) => {
    // Supabase raadt aan geen andere Supabase-calls in deze callback te awaiten
    setTimeout(() => render(session), 0);
  });
})();

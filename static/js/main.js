// Mobiel menu openen/sluiten
(function () {
  const knop = document.querySelector(".menu-knop");
  const menu = document.getElementById("hoofdmenu");
  if (!knop || !menu) return;

  knop.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    knop.setAttribute("aria-expanded", String(open));
  });
})();

// Kopieerknoppen (bv. rekeningnummer)
document.querySelectorAll("[data-kopieer]").forEach((knop) => {
  const label = knop.textContent;
  knop.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(knop.dataset.kopieer);
      knop.textContent = "✓ Gekopieerd";
    } catch {
      knop.textContent = "Kopiëren lukte niet";
    }
    setTimeout(() => (knop.textContent = label), 2000);
  });
});

// Menu-items "Mijn deelname" (ingeschreven) en "Beheer" (beheerders) tonen.
// Menu-item "Beheer" tonen voor beheerders. Werkt op elke pagina, ook zonder de Supabase-bibliotheek:
// we lezen de login uit de browser en vragen de database of dit account beheerder is.
(function () {
  const link = document.querySelector(".nav-admin");
  const deelnameLink = document.querySelector(".nav-deelname");
  if (!link) return;
  const { sbUrl, sbKey } = document.body.dataset;

  let token = null;
  try {
    const sleutel = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k));
    const sessie = sleutel && JSON.parse(localStorage.getItem(sleutel));
    if (sessie?.access_token && sessie.expires_at * 1000 > Date.now()) token = sessie.access_token;
  } catch {
    return;
  }
  if (!token) return;

  // Mijn deelname: ingeschreven? (de database toont enkel je eigen inschrijving)
  if (deelnameLink && deelnameLink.hidden) {
    fetch(`${sbUrl}/rest/v1/inschrijvingen?select=user_id&limit=1`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rijen) => (deelnameLink.hidden = !rijen.length))
      .catch(() => {});
  }
  if (!link.hidden) return;

  // Antwoord even onthouden zodat niet elke pagina opnieuw moet vragen
  const cache = `isAdmin:${token.slice(-16)}`;
  try {
    if (sessionStorage.getItem(cache) === "1") return void (link.hidden = false);
    if (sessionStorage.getItem(cache) === "0") return;
  } catch {}

  fetch(`${sbUrl}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: { apikey: sbKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  })
    .then((r) => (r.ok ? r.json() : false))
    .then((isAdmin) => {
      link.hidden = isAdmin !== true;
      try { sessionStorage.setItem(cache, isAdmin === true ? "1" : "0"); } catch {}
    })
    .catch(() => {});
})();

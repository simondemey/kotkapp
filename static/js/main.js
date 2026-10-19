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

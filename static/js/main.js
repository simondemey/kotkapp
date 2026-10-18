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

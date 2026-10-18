// Countdown tot de start van de sponsorloop.
// Start- en eindtijd komen uit content/evenement.yaml (data-attributen op .countdown).
(function () {
  const el = document.querySelector(".countdown");
  if (!el) return;

  const start = new Date(el.dataset.start).getTime();
  const einde = new Date(el.dataset.einde).getTime();
  const bericht = document.querySelector(".countdown-bericht");
  const velden = {};
  el.querySelectorAll("[data-eenheid]").forEach((v) => (velden[v.dataset.eenheid] = v));

  const pad = (n) => String(n).padStart(2, "0");

  function toonBericht(tekst) {
    el.hidden = true;
    bericht.hidden = false;
    bericht.textContent = tekst;
  }

  function tick() {
    const nu = Date.now();

    if (nu >= einde) {
      toonBericht("Bedankt om mee te lopen! ♡");
      return;
    }
    if (nu >= start) {
      toonBericht("We lopen! Kom ons aanmoedigen ♡");
      setTimeout(tick, 1000);
      return;
    }

    let s = Math.floor((start - nu) / 1000);
    const dagen = Math.floor(s / 86400); s %= 86400;
    const uren = Math.floor(s / 3600); s %= 3600;
    const minuten = Math.floor(s / 60);
    const seconden = s % 60;

    velden.dagen.textContent = dagen;
    velden.uren.textContent = pad(uren);
    velden.minuten.textContent = pad(minuten);
    velden.seconden.textContent = pad(seconden);

    setTimeout(tick, 1000 - (nu % 1000));
  }

  tick();
})();

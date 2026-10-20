// Live teller op de homepagina: aantal lopers, wandelaars en supporters (via de functie tellers() in Supabase).
(function () {
  const el = document.getElementById("teller");
  if (!el) return;
  const { sbUrl, sbKey } = document.body.dataset;

  fetch(`${sbUrl}/rest/v1/rpc/tellers`, {
    method: "POST",
    headers: { apikey: sbKey, "Content-Type": "application/json" },
    body: "{}",
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((t) => {
      if (!t || !t.totaal) return;
      const delen = [
        [t.lopers, "loper", "lopers"],
        [t.wandelaars, "wandelaar", "wandelaars"],
        [t.supporters, "supporter", "supporters"],
      ]
        .filter(([n]) => n > 0)
        .map(([n, een, meer]) => `<strong>${n}</strong> ${n === 1 ? een : meer}`);
      const lijst = delen.length > 1 ? `${delen.slice(0, -1).join(", ")} en ${delen.at(-1)}` : delen[0];
      el.innerHTML = `🎉 Al ${lijst} ingeschreven!`;
      el.hidden = false;
    })
    .catch(() => {}); // teller is een extraatje: bij een fout tonen we gewoon niets
})();

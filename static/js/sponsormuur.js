// Sponsormuur: bedrijfssponsors als posts, per niveau. Hoe hoger het niveau, hoe groter de post.
(function () {
  const muur = document.getElementById("sponsormuur");
  if (!muur || !window.partners) return;
  const { NIVEAUS, laad, logoUrl, veiligeUrl } = window.partners;

  function el(tag, klasse, tekst) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst != null) e.textContent = tekst;
    return e;
  }

  function status(tekst) {
    return el("p", "intro muur-status", tekst);
  }

  function kaart(p, niveau) {
    const href = p.url && veiligeUrl(p.url);
    const k = el("article", `sponsor-post niveau-${p.niveau}`);
    if (p.niveau === "hoofd") k.append(el("span", "sponsor-label", niveau.label));

    const logo = el("div", "sponsor-post-logo");
    const img = Object.assign(document.createElement("img"), { src: logoUrl(p), alt: `Logo ${p.naam}`, loading: "lazy" });
    if (href) {
      const a = Object.assign(el("a"), { href, target: "_blank", rel: "noopener" });
      a.append(img);
      logo.append(a);
    } else {
      logo.append(img);
    }
    k.append(logo);

    const tekst = el("div", "sponsor-post-tekst");
    tekst.append(el("h3", null, p.naam));
    if (p.tekst) tekst.append(el("p", null, p.tekst));
    if (href) {
      const a = Object.assign(el("a", "sponsor-post-link", `${new URL(href).hostname.replace(/^www\./, "")} →`), { href, target: "_blank", rel: "noopener" });
      tekst.append(a);
    }
    k.append(tekst);
    return k;
  }

  laad()
    .then((lijst) => {
      muur.replaceChildren();
      if (!lijst.length) return muur.append(status(muur.dataset.leeg));
      NIVEAUS.forEach((niveau) => {
        const groep = lijst.filter((p) => p.niveau === niveau.key);
        if (!groep.length) return;
        const sectie = el("section", `sponsor-niveau niveau-${niveau.key}`);
        if (niveau.key !== "hoofd") sectie.append(el("h2", "sponsor-niveau-titel", niveau.meervoud));
        const rooster = el("div", "sponsor-rooster");
        groep.forEach((p) => rooster.append(kaart(p, niveau)));
        sectie.append(rooster);
        muur.append(sectie);
      });
    })
    .catch((err) => {
      console.error(err);
      muur.replaceChildren(status("De sponsors konden niet geladen worden. Probeer later opnieuw."));
    });
})();

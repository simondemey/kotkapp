// Bedrijfssponsors (tabel partners): gedeeld door de sponsormuur, de "Met dank aan"-strook, de beamer en Beheer.
// Werkt zonder de Supabase-bibliotheek: één REST-aanvraag met de publieke sleutel (RLS toont enkel zichtbare sponsors).
//
// Lokaal testen met voorbeeldsponsors: open http://localhost:8000/?mock (blijft aan in dit tabblad; ?mock=0 zet het uit).
// De testgegevens staan in static/mock/ en worden nooit gepubliceerd (zie build.py).
(function () {
  const { sbUrl, sbKey } = document.body.dataset;
  const BUCKET = "partners";

  const NIVEAUS = [
    { key: "hoofd", label: "Hoofdsponsor", meervoud: "Hoofdsponsor" },
    { key: "goud", label: "Gouden sponsor", meervoud: "Gouden sponsors" },
    { key: "zilver", label: "Zilveren sponsor", meervoud: "Zilveren sponsors" },
    { key: "brons", label: "Bronzen sponsor", meervoud: "Bronzen sponsors" },
  ];
  const rang = Object.fromEntries(NIVEAUS.map((n, i) => [n.key, i]));

  // ---------- Testmodus (enkel op de eigen computer) ----------
  const lokaal = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  let mock = false;
  if (lokaal) {
    try {
      const param = new URLSearchParams(location.search).get("mock");
      if (param !== null) sessionStorage.setItem("partnersMock", param === "0" ? "0" : "1");
      mock = sessionStorage.getItem("partnersMock") === "1";
    } catch {}
  }

  // hoofd → goud → zilver → brons, dan de volgorde van de beheerder, dan de naam
  function sorteer(lijst) {
    return [...lijst].sort((a, b) =>
      rang[a.niveau] - rang[b.niveau] || (a.volgorde ?? 0) - (b.volgorde ?? 0) || a.naam.localeCompare(b.naam, "nl")
    );
  }

  function logoUrl(p) {
    if (p.logo) return p.logo; // testgegevens
    return `${sbUrl}/storage/v1/object/public/${BUCKET}/${p.logo_pad.split("/").map(encodeURIComponent).join("/")}`;
  }

  // Enkel https-links (nooit javascript: e.d.)
  function veiligeUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === "https:" ? u.href : null;
    } catch {
      return null;
    }
  }

  let cache = null;
  function laad() {
    if (!cache) {
      const bron = mock
        ? fetch("static/mock/partners.json")
        : fetch(`${sbUrl}/rest/v1/partners?select=id,naam,niveau,tekst,url,logo_pad,volgorde&zichtbaar=is.true`, {
            headers: { apikey: sbKey },
          });
      cache = bron
        .then((r) => {
          if (!r.ok) throw new Error(`partners: ${r.status}`);
          return r.json();
        })
        .then((lijst) => sorteer(lijst.filter((p) => p.niveau in rang)));
      cache.catch(() => (cache = null)); // bij een fout later opnieuw proberen
    }
    return cache;
  }

  // Opnieuw ophalen (beamer: nieuwe of verborgen sponsors oppikken)
  function ververs() {
    cache = null;
    return laad();
  }

  window.partners = { NIVEAUS, sorteer, logoUrl, veiligeUrl, laad, ververs, mock, BUCKET };

  // ---------- "Met dank aan"-strook onderaan de pagina ----------
  const strook = document.querySelector(".dank-strook");
  if (!strook) return;
  laad()
    .then((lijst) => {
      if (!lijst.length) return;
      const rij = strook.querySelector(".dank-logos");
      lijst.forEach((p) => {
        const href = p.url && veiligeUrl(p.url);
        const item = document.createElement(href ? "a" : "span");
        item.className = `dank-logo niveau-${p.niveau}`;
        if (href) Object.assign(item, { href, target: "_blank", rel: "noopener" });
        item.title = p.naam;
        const img = Object.assign(document.createElement("img"), { src: logoUrl(p), alt: p.naam, loading: "lazy" });
        item.append(img);
        rij.append(item);
      });
      strook.hidden = false;
    })
    .catch(() => {}); // strook blijft gewoon verborgen
})();

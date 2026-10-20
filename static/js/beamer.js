// Beamer: diavoorstelling met foto's van de fotomuur en af en toe een ranking, totalen of de sponsors.
// Foto's en sponsors zijn publiek; rankings enkel als deze browser ingelogd is als beheerder (beamer_data()).
(function () {
  const db = window.sb;
  const podium = document.getElementById("bm-podium");
  const balk = document.getElementById("bm-balk");
  const startScherm = document.getElementById("bm-start");
  const startInfo = document.getElementById("bm-start-info");
  if (!db || !podium) return;

  const FOTO_TIJD = 7000;      // ms per foto
  const RANKING_TIJD = 12000;  // ms per ranking-dia
  const ELKE_N_FOTOS = 5;      // na zoveel foto's een ranking
  const SPONSOR_TIJD = 10000;  // ms per sponsordia
  const ELKE_N_SPONSOR = 4;    // na zoveel dia's een sponsordia (telkens één sponsor)
  const VERVERS = 60000;       // nieuwe posts, cijfers en sponsors ophalen

  // € 412 of € 5.234,50 (centen enkel als het geen rond bedrag is)
  const euro = (b) => {
    const n = Number(b);
    const d = Number.isInteger(n) ? 0 : 2;
    return "€ " + n.toLocaleString("nl-BE", { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const bucket = "fotomuur";

  let posts = [];
  let cijfers = null;          // null = geen beheerder of nog niet geladen
  let reeks = [];              // volgorde van dia's
  let positie = -1;
  let timer = null;
  let gepauzeerd = false;
  let rankingSoort = 0;
  let partners = [];
  let sponsorBeurt = 0;        // welke sponsor de volgende sponsordia krijgt

  // ---------- Gegevens ----------
  async function laadPosts() {
    const { data, error } = await db
      .from("posts")
      .select("id, created_at, naam, bericht, foto_pad")
      .order("created_at", { ascending: false })
      .limit(150);
    if (!error) posts = data;
  }

  async function laadCijfers() {
    const { data, error } = await db.rpc("beamer_data");
    cijfers = error ? null : data;
  }

  async function laadPartners() {
    try {
      partners = await window.partners.ververs();
    } catch {} // vorige lijst behouden
  }

  async function ververs() {
    await Promise.all([laadPosts(), laadCijfers(), laadPartners()]);
    bouwReeks();
    voorlaadLogos();
  }

  // Volgorde: foto's (nieuwste eerst), na elke N foto's een ranking-dia, en regelmatig een sponsordia
  function bouwReeks() {
    const huidig = reeks[positie];
    const soorten = rankingSoorten();
    const basis = [];
    posts.forEach((p, i) => {
      basis.push({ soort: "post", post: p });
      if (soorten.length && (i + 1) % ELKE_N_FOTOS === 0) basis.push({ soort: "ranking" });
    });
    if (soorten.length && (!posts.length || posts.length % ELKE_N_FOTOS)) basis.push({ soort: "ranking" });
    reeks = [];
    basis.forEach((d, i) => {
      reeks.push(d);
      if (partners.length && (i + 1) % ELKE_N_SPONSOR === 0) reeks.push({ soort: "sponsor" });
    });
    // altijd minstens één sponsordia per ronde (ook zonder posts)
    if (partners.length && (!basis.length || basis.length % ELKE_N_SPONSOR)) reeks.push({ soort: "sponsor" });
    if (!reeks.length) reeks.push({ soort: "leeg" });
    // probeer op dezelfde post verder te gaan
    if (huidig?.post) {
      const zelfde = reeks.findIndex((d) => d.post?.id === huidig.post.id);
      if (zelfde >= 0) positie = zelfde;
    }
    if (positie >= reeks.length) positie = -1;
  }

  function rankingSoorten() {
    if (!cijfers) return [];
    const s = [];
    if (cijfers.lopers?.length) s.push("lopers");
    if (cijfers.opgehaald?.length) s.push("opgehaald");
    s.push("totaal");
    return s;
  }

  // ---------- Dia's tekenen ----------
  function el(tag, klasse, tekst) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (tekst != null) e.textContent = tekst;
    return e;
  }

  function postDia(p) {
    const dia = el("section", "bm-dia");
    if (p.foto_pad) {
      const wrap = el("div", "bm-foto");
      const img = el("img");
      img.src = db.storage.from(bucket).getPublicUrl(p.foto_pad).data.publicUrl;
      img.alt = `Foto van ${p.naam}`;
      const onder = el("div", "bm-onderschrift");
      onder.append(el("strong", null, p.naam));
      if (p.bericht) onder.append(el("span", null, p.bericht));
      wrap.append(img, onder);
      dia.append(wrap);
    } else {
      const c = el("div", "bm-citaat");
      c.append(el("p", null, p.bericht || ""), el("strong", null, `– ${p.naam}`));
      dia.append(c);
    }
    return dia;
  }

  function rankingDia() {
    const soorten = rankingSoorten();
    const soort = soorten[rankingSoort++ % soorten.length];
    const dia = el("section", "bm-dia");

    if (soort === "totaal") {
      const t = cijfers.totaal;
      const box = el("div", "bm-totalen");
      box.append(el("h2", null, "Samen voor Pauline 💛"));
      const tegels = el("div", "bm-tegels");
      const tegel = (waarde, label, groot) => {
        const d = el("div", "bm-tegel" + (groot ? " groot" : ""));
        d.append(el("b", null, waarde), el("span", null, label));
        return d;
      };
      tegels.append(
        tegel(t.lopers, "lopers"),
        tegel(t.wandelaars, "wandelaars"),
        tegel(t.rondjes, `rondjes (${t.km} km)`),
        tegel(euro(t.opgehaald), "opgehaald tot nu toe", true)
      );
      box.append(tegels);
      dia.append(box);
      return dia;
    }

    const box = el("div", "bm-ranking");
    const lijst = el("ol");
    if (soort === "lopers") {
      box.append(el("h2", null, "🏃 Meeste rondjes"));
      cijfers.lopers.slice(0, 8).forEach((r, i) => lijst.append(rij(i, r, `${r.rondjes} rondjes`)));
    } else {
      box.append(el("h2", null, "💛 Meest opgehaald"));
      cijfers.opgehaald.slice(0, 8).forEach((r, i) => lijst.append(rij(i, r, euro(r.bedrag))));
    }
    box.append(lijst);
    dia.append(box);
    return dia;
  }

  function rij(i, r, waarde) {
    const li = el("li");
    li.style.animationDelay = `${i * 80}ms`;
    const naam = el("span");
    if (r.nr) naam.append(el("span", "bm-nr", `#${r.nr}`));
    naam.append(r.naam);
    li.append(el("span", "bm-plaats", i < 3 ? ["🥇", "🥈", "🥉"][i] : `${i + 1}`), naam, el("span", "bm-waarde", waarde));
    return li;
  }

  // Volgorde van de sponsordia's: elke sponsor apart, de hoofdsponsor om de andere beurt (komt dus vaker)
  function sponsorBeurten() {
    const hoofden = partners.filter((p) => p.niveau === "hoofd");
    const anderen = partners.filter((p) => p.niveau !== "hoofd");
    if (!hoofden.length || !anderen.length) return [...hoofden, ...anderen];
    return anderen.flatMap((p, i) => [hoofden[i % hoofden.length], p]);
  }

  // Sponsordia: één sponsor op het scherm onder "Met dank aan"; hoe hoger het niveau, hoe groter het logo
  function sponsorDia() {
    const { NIVEAUS, logoUrl } = window.partners;
    const beurten = sponsorBeurten();
    const p = beurten[sponsorBeurt++ % beurten.length];
    const niveau = NIVEAUS.find((n) => n.key === p.niveau);
    const dia = el("section", "bm-dia");
    const box = el("div", `bm-sponsor niveau-${p.niveau}`);
    const logo = el("div", "bm-sp-logo");
    logo.append(Object.assign(el("img"), { src: logoUrl(p), alt: p.naam }));
    box.append(el("h2", null, "Met dank aan"), logo, el("strong", null, p.naam), el("span", "bm-sp-label", niveau.label));
    if (p.tekst) box.append(el("p", null, p.tekst));
    dia.append(box);
    return dia;
  }

  function leegDia() {
    const dia = el("section", "bm-dia");
    const c = el("div", "bm-citaat");
    c.append(el("p", null, "Nog geen foto's… Scan de QR-code en post de eerste!"));
    dia.append(c);
    return dia;
  }

  // ---------- Afspelen ----------
  function toon(stap) {
    clearTimeout(timer);
    positie = (positie + stap + reeks.length) % reeks.length;
    const d = reeks[positie];
    const dia = d.soort === "post" ? postDia(d.post) : d.soort === "ranking" ? rankingDia() : d.soort === "sponsor" ? sponsorDia() : leegDia();
    podium.replaceChildren(dia);
    // QR verbergen bij rankings en sponsors (anders valt hij over de lijst of de logo's)
    document.body.classList.toggle("ranking-dia", d.soort === "ranking" || d.soort === "sponsor");
    voorladen();

    const duur = d.soort === "ranking" ? RANKING_TIJD : d.soort === "sponsor" ? SPONSOR_TIJD : FOTO_TIJD;
    balk.style.transition = "none";
    balk.style.width = "0";
    requestAnimationFrame(() => {
      balk.style.transition = gepauzeerd ? "none" : `width ${duur}ms linear`;
      balk.style.width = gepauzeerd ? "0" : "100%";
    });
    if (!gepauzeerd) timer = setTimeout(() => toon(1), duur);
  }

  // Volgende foto alvast laden, zodat er geen witte flits is
  function voorladen() {
    const volgende = reeks.slice(positie + 1).find((d) => d.post?.foto_pad);
    if (volgende) new Image().src = db.storage.from(bucket).getPublicUrl(volgende.post.foto_pad).data.publicUrl;
  }

  // Sponsorlogo's één keer voorladen (de browser houdt ze daarna in de cache)
  const voorgeladen = new Set();
  function voorlaadLogos() {
    partners.forEach((p) => {
      const url = window.partners.logoUrl(p);
      if (!voorgeladen.has(url)) {
        voorgeladen.add(url);
        new Image().src = url;
      }
    });
  }

  function klok() {
    document.getElementById("bm-klok").textContent = new Intl.DateTimeFormat("nl-BE", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  }

  document.addEventListener("keydown", (e) => {
    if (startScherm.hidden === false) return;
    if (e.key === " ") {
      e.preventDefault();
      gepauzeerd = !gepauzeerd;
      toon(0);
    } else if (e.key === "ArrowRight") toon(1);
    else if (e.key === "ArrowLeft") toon(-1);
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) document.body.classList.remove("loopt");
  });

  document.getElementById("bm-start-knop").addEventListener("click", async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {}
    startScherm.hidden = true;
    document.body.classList.add("loopt");
    toon(1);
  });

  // ---------- Start ----------
  (async () => {
    klok();
    setInterval(klok, 15000);
    await ververs();
    setInterval(ververs, VERVERS);
    const fotos = posts.filter((p) => p.foto_pad).length;
    startInfo.textContent =
      `${fotos} foto's, ${posts.length - fotos} berichten en ${partners.length} sponsors geladen. ` +
      (cijfers ? "Rankings staan aan (ingelogd als beheerder)." : "Rankings staan uit: log in als beheerder om ze te tonen.");
  })();
})();

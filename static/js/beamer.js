// Beamer: diavoorstelling met foto's van de fotomuur en af en toe een ranking of totalen.
// Foto's zijn publiek; rankings enkel als deze browser ingelogd is als beheerder (beamer_data()).
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
  const VERVERS = 60000;       // nieuwe posts en cijfers ophalen

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

  async function ververs() {
    await Promise.all([laadPosts(), laadCijfers()]);
    bouwReeks();
  }

  // Volgorde: foto's (nieuwste eerst), na elke N foto's een ranking-dia
  function bouwReeks() {
    const huidig = reeks[positie];
    const soorten = rankingSoorten();
    reeks = [];
    posts.forEach((p, i) => {
      reeks.push({ soort: "post", post: p });
      if (soorten.length && (i + 1) % ELKE_N_FOTOS === 0) reeks.push({ soort: "ranking" });
    });
    if (soorten.length && (!posts.length || posts.length % ELKE_N_FOTOS)) reeks.push({ soort: "ranking" });
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
    const dia = d.soort === "post" ? postDia(d.post) : d.soort === "ranking" ? rankingDia() : leegDia();
    podium.replaceChildren(dia);
    document.body.classList.toggle("ranking-dia", d.soort === "ranking"); // QR verbergen bij rankings
    voorladen();

    const duur = d.soort === "ranking" ? RANKING_TIJD : FOTO_TIJD;
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
      `${fotos} foto's en ${posts.length - fotos} berichten geladen. ` +
      (cijfers ? "Rankings staan aan (ingelogd als beheerder)." : "Rankings staan uit: log in als beheerder om ze te tonen.");
  })();
})();

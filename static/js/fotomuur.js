// Fotomuur: posts insturen (ter goedkeuring) en goedgekeurde posts tonen via Supabase.
(function () {
  const muur = document.getElementById("muur");
  const form = document.getElementById("post-form");
  if (!muur || !form || !window.supabase) return;

  const cfg = muur.dataset;
  const db = window.supabase.createClient(cfg.url, cfg.key);
  const melding = form.querySelector(".form-melding");
  const knop = form.querySelector("button[type=submit]");
  const fotoInputs = [form.elements.camera, form.elements.foto];
  const gekozen = form.querySelector(".foto-gekozen");
  const voorbeeld = form.querySelector(".foto-voorbeeld");
  let fotoBestand = null;

  const MAX_ZIJDE = 1600;
  const datumFormaat = new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  // ---------- Muur tonen ----------
  async function laadMuur() {
    const { data, error } = await db
      .from("posts")
      .select("id, created_at, naam, bericht, foto_pad")
      .order("created_at", { ascending: false })
      .limit(200);

    muur.replaceChildren();
    if (error) {
      muur.append(statusTekst("De fotomuur kon niet geladen worden. Probeer later opnieuw."));
      console.error(error);
      return;
    }
    if (!data.length) {
      muur.append(statusTekst(cfg.leeg));
      return;
    }
    data.forEach((post) => muur.append(postKaart(post)));
  }

  function statusTekst(tekst) {
    const p = document.createElement("p");
    p.className = "intro muur-status";
    p.textContent = tekst;
    return p;
  }

  function postKaart(post) {
    const kaart = document.createElement("article");
    kaart.className = "post";

    if (post.foto_pad) {
      const img = document.createElement("img");
      img.src = db.storage.from(cfg.bucket).getPublicUrl(post.foto_pad).data.publicUrl;
      img.alt = `Foto van ${post.naam}`;
      img.loading = "lazy";
      kaart.append(img);
    }

    const tekst = document.createElement("div");
    tekst.className = "post-tekst";
    if (post.bericht) {
      const p = document.createElement("p");
      p.textContent = post.bericht;
      tekst.append(p);
    }
    const meta = document.createElement("footer");
    const naam = document.createElement("strong");
    naam.textContent = post.naam;
    meta.append(naam, " · " + datumFormaat.format(new Date(post.created_at)));
    tekst.append(meta);
    kaart.append(tekst);
    return kaart;
  }

  // ---------- Foto verkleinen voor upload ----------
  async function verklein(bestand) {
    const bitmap = await createImageBitmap(bestand, { imageOrientation: "from-image" });
    const schaal = Math.min(1, MAX_ZIJDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * schaal);
    canvas.height = Math.round(bitmap.height * schaal);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise((ok, fout) =>
      canvas.toBlob((blob) => (blob ? ok(blob) : fout(new Error("verkleinen mislukt"))), "image/jpeg", 0.85)
    );
  }

  function zetFoto(bestand) {
    if (voorbeeld.src) URL.revokeObjectURL(voorbeeld.src);
    voorbeeld.removeAttribute("src");
    fotoBestand = bestand;
    gekozen.hidden = !bestand;
    if (bestand) voorbeeld.src = URL.createObjectURL(bestand);
  }

  fotoInputs.forEach((input) =>
    input.addEventListener("change", () => {
      const bestand = input.files[0];
      input.value = ""; // zelfde foto opnieuw kiezen moet ook werken
      if (!bestand) return;
      if (!bestand.type.startsWith("image/")) {
        zetFoto(null);
        return toon("Kies een foto (JPG, PNG of HEIC).", true);
      }
      melding.hidden = true;
      zetFoto(bestand);
    })
  );

  form.querySelector(".foto-wis").addEventListener("click", () => zetFoto(null));

  // ---------- Post insturen ----------
  function toon(tekst, fout = false) {
    melding.hidden = false;
    melding.textContent = tekst;
    melding.classList.toggle("fout", fout);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const naam = form.elements.naam.value.trim();
    const bericht = form.elements.bericht.value.trim();
    const bestand = fotoBestand;

    if (form.elements.website.value) return; // bot
    if (!naam) return toon("Vul je naam in.", true);
    if (!bericht && !bestand) return toon("Voeg een bericht of een foto toe.", true);
    if (!form.elements.toestemming.checked) return toon("Vink het toestemmingsvakje aan.", true);

    knop.disabled = true;
    toon("Bezig met plaatsen…");

    try {
      let foto_pad = null;
      if (bestand) {
        let blob;
        try {
          blob = await verklein(bestand);
        } catch {
          throw new Error("Deze foto kon niet gelezen worden. Probeer een JPG- of PNG-foto.");
        }
        foto_pad = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.jpg`;
        const { error } = await db.storage.from(cfg.bucket).upload(foto_pad, blob, { contentType: "image/jpeg" });
        if (error) throw error;
      }

      const { error } = await db.from("posts").insert({ naam, bericht: bericht || null, foto_pad });
      if (error) throw error;

      form.reset();
      zetFoto(null);
      toon(cfg.bedankt);
    } catch (err) {
      console.error(err);
      toon(err.message?.startsWith("Deze foto") ? err.message : "Er ging iets mis bij het plaatsen. Probeer het opnieuw.", true);
    } finally {
      knop.disabled = false;
    }
  });

  laadMuur();
})();

// Fotomuur: posts insturen en zichtbare posts (goedgekeurd = true) tonen via Supabase.
// Ingelogde beheerders krijgen bij elke post een verwijderknop.
(function () {
  const muur = document.getElementById("muur");
  const form = document.getElementById("post-form");
  if (!muur || !form || !window.sb) return;

  const cfg = muur.dataset;
  const db = window.sb;
  let isAdmin = false;
  const melding = form.querySelector(".form-melding");
  const knop = form.querySelector("button[type=submit]");
  const fotoInputs = [form.elements.camera, form.elements.foto];
  const gekozen = form.querySelector(".foto-gekozen");
  const voorbeeld = form.querySelector(".foto-voorbeeld");
  let fotoBestand = null;

  const MAX_ZIJDE = 1600;
  const datumFormaat = new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  // ---------- Muur tonen ----------
  // Per 60 posts laden (spaart dataverkeer); "Meer laden" haalt de volgende 60
  const PER_KEER = 60;
  let geladen = 0;
  const meerKnop = Object.assign(document.createElement("button"), {
    type: "button",
    className: "knop knop-licht meer-laden",
    textContent: "Meer laden",
  });
  meerKnop.addEventListener("click", () => laadMuur(true));

  async function laadMuur(meer = false) {
    if (!meer) geladen = 0;
    meerKnop.disabled = true;
    const { data, error } = await db
      .from("posts")
      .select("id, created_at, naam, bericht, foto_pad")
      .order("created_at", { ascending: false })
      .range(geladen, geladen + PER_KEER - 1);
    meerKnop.disabled = false;

    if (!meer) muur.replaceChildren();
    meerKnop.remove();
    if (error) {
      muur.append(statusTekst("De fotomuur kon niet geladen worden. Probeer later opnieuw."));
      console.error(error);
      return;
    }
    if (!geladen && !data.length) {
      muur.append(statusTekst(cfg.leeg));
      return;
    }
    data.forEach((post) => muur.append(postKaart(post)));
    geladen += data.length;
    if (data.length === PER_KEER) muur.after(meerKnop);
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
    if (isAdmin) kaart.append(verwijderKnop(post, kaart));
    return kaart;
  }

  // ---------- Beheer: post (en foto) verwijderen ----------
  function verwijderKnop(post, kaart) {
    const knop = document.createElement("button");
    knop.type = "button";
    knop.className = "post-verwijder";
    knop.textContent = "🗑️ Verwijderen";
    knop.addEventListener("click", async () => {
      if (!confirm(`Post van ${post.naam} verwijderen?`)) return;
      knop.disabled = true;
      const { error } = await db.from("posts").delete().eq("id", post.id);
      if (error) {
        console.error(error);
        alert("Verwijderen mislukt. Ben je nog ingelogd als beheerder?");
        knop.disabled = false;
        return;
      }
      if (post.foto_pad) {
        const { error: fotoFout } = await db.storage.from(cfg.bucket).remove([post.foto_pad]);
        if (fotoFout) console.error(fotoFout); // post is weg; foto blijft enkel in de opslag
      }
      kaart.remove();
      if (!muur.querySelector(".post")) muur.append(statusTekst(cfg.leeg));
    });
    return knop;
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
      await laadMuur();
      muur.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      console.error(err);
      toon(err.message?.startsWith("Deze foto") ? err.message : "Er ging iets mis bij het plaatsen. Probeer het opnieuw.", true);
    } finally {
      knop.disabled = false;
    }
  });

  window.sbIsAdmin().then((admin) => {
    isAdmin = admin;
    if (isAdmin) document.body.classList.add("is-admin");
    laadMuur();
  });
})();

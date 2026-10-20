// Mijn deelname: nummers, sponsors per deelnemer en "Klaar met lopen" (rondjes ingeven).
// Gegevens: inschrijvingen (deelnemers met id), sponsors en rondjes in Supabase – zie supabase/sponsors.sql.
(function () {
  const db = window.sb;
  const status = document.getElementById("dn-status");
  const inhoud = document.getElementById("dn-inhoud");
  const lijst = document.getElementById("dn-deelnemers");
  const sjabloon = document.getElementById("dn-deelnemer-sjabloon");
  if (!db || !status) return;

  const betaal = JSON.parse(document.getElementById("betaal-info").textContent);
  const html = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const euro = (b) => "€ " + Number(b).toFixed(2).replace(".", ",");
  let gebruiker = null;

  // ---------- Bedragen ----------
  function bedragVan(s, rondjes) {
    if (s.soort === "vast") return Number(s.bedrag);
    return rondjes == null ? null : Number(s.bedrag) * rondjes;
  }

  function sponsorOmschrijving(s) {
    return s.soort === "vast" ? `${euro(s.bedrag)} vast bedrag` : `${euro(s.bedrag)} per rondje`;
  }

  // Tekst om zelf naar een sponsor te sturen
  function kopieertekst(d, s, rondjes) {
    const wat = d.loopt ? "gelopen" : "gewandeld";
    const bedrag = bedragVan(s, rondjes);
    const regels = [`Hallo ${s.naam}!`, ""];
    if (rondjes == null) {
      regels.push(
        `Bedankt dat je me sponsort voor de sponsorloop Running for Pauline op 14 februari 2027 (${sponsorOmschrijving(s)}).`
      );
    } else {
      const berekening = s.soort === "vast" ? "vast bedrag" : `${rondjes} rondjes × ${euro(s.bedrag)}`;
      regels.push(`Ik heb tijdens de sponsorloop Running for Pauline ${rondjes} rondjes ${wat}! 🎉`);
      regels.push(`Jouw sponsoring: ${euro(bedrag)} (${berekening}).`);
    }
    regels.push(
      "",
      "Betalen kan op twee manieren:",
      `1. Via Kom op tegen Kanker (komt op onze teampagina): online via ${betaal.kotk_url}`,
      `   of overschrijving naar ${betaal.kotk_iban} met mededeling "${betaal.kotk_mededeling}" (belangrijk!)`,
      `2. Rechtstreeks voor Pauline's behandeling: overschrijving naar ${betaal.pauline_iban} met mededeling "Sponsorloop ${d.naam}"`,
      "",
      "Heel erg bedankt voor je steun! 💛",
      d.naam,
      betaal.site
    );
    return regels.join("\n");
  }

  async function kopieer(tekst, knop) {
    const label = knop.textContent;
    try {
      await navigator.clipboard.writeText(tekst);
      knop.textContent = "✓ Gekopieerd";
    } catch {
      knop.textContent = "Kopiëren lukte niet";
    }
    setTimeout(() => (knop.textContent = label), 2000);
  }

  // ---------- Laden en tonen ----------
  async function laad() {
    const [ins, sp, ro] = await Promise.all([
      db.from("inschrijvingen").select("deelnemers").eq("user_id", gebruiker.id).maybeSingle(),
      db.from("sponsors").select("*").eq("user_id", gebruiker.id).order("created_at"),
      db.from("rondjes").select("deelnemer_id, aantal").eq("user_id", gebruiker.id),
    ]);
    const fout = ins.error || sp.error || ro.error;
    if (fout) {
      console.error(fout);
      status.textContent = "Je gegevens konden niet geladen worden. Probeer de pagina te verversen.";
      return;
    }
    if (!ins.data) {
      status.innerHTML = 'Je bent nog niet ingeschreven. <a href="inschrijven.html">Schrijf je eerst in</a>.';
      return;
    }

    const rondjes = Object.fromEntries((ro.data || []).map((r) => [r.deelnemer_id, r.aantal]));
    lijst.replaceChildren(
      ...ins.data.deelnemers.map((d) =>
        deelnemerKaart(d, (sp.data || []).filter((s) => s.deelnemer_id === d.id), rondjes[d.id])
      )
    );
    status.hidden = true;
    inhoud.hidden = false;
  }

  function deelnemerKaart(d, sponsors, rondjes) {
    const kaart = sjabloon.content.firstElementChild.cloneNode(true);
    const loperOfWandelaar = d.loopt || d.wandelt;

    if (d.nr) {
      const nr = kaart.querySelector(".dn-nummer");
      nr.textContent = d.nr;
      nr.hidden = false;
    }
    kaart.querySelector(".dn-naam").textContent = d.naam;
    kaart.querySelector(".dn-soort").textContent = d.loopt
      ? "🏃 Loopt (rondjes van 1,7 km)"
      : d.wandelt
        ? "🚶 Wandelt (rondjes van 5 km)"
        : "📣 Supporter";

    if (!loperOfWandelaar) {
      kaart.querySelector(".dn-sponsors").remove();
      kaart.querySelector(".dn-toevoegen").remove();
      kaart.querySelector(".dn-klaar").remove();
      const p = document.createElement("p");
      p.className = "klein";
      p.textContent = "Supporters hebben geen sponsors of rondjes. Bedankt om te komen aanmoedigen!";
      kaart.append(p);
      return kaart;
    }

    toonSponsors(kaart, d, sponsors, rondjes);
    koppelFormulier(kaart, d);
    koppelKlaar(kaart, d, sponsors, rondjes);
    return kaart;
  }

  function toonSponsors(kaart, d, sponsors, rondjes) {
    const ul = kaart.querySelector(".dn-sponsorlijst");
    kaart.querySelector(".dn-geen").hidden = sponsors.length > 0;

    ul.replaceChildren(
      ...sponsors.map((s) => {
        const li = document.createElement("li");
        li.className = "dn-sponsor";

        const info = document.createElement("div");
        const naam = document.createElement("strong");
        naam.textContent = s.naam;
        const detail = document.createElement("span");
        detail.className = "klein";
        detail.textContent =
          sponsorOmschrijving(s) + (s.communicatie === "mail" ? ` · mail naar ${s.email}` : " · je laat het zelf weten");
        info.append(naam, detail);

        const rechts = document.createElement("div");
        rechts.className = "dn-sponsor-rechts";
        const bedrag = bedragVan(s, rondjes);
        if (bedrag != null) {
          const b = document.createElement("span");
          b.className = "dn-bedrag";
          b.textContent = euro(bedrag);
          rechts.append(b);
        }
        if (s.communicatie === "mail" && s.mail_verstuurd_op) {
          const ok = document.createElement("span");
          ok.className = "dn-gemaild";
          ok.textContent = "✓ gemaild";
          rechts.append(ok);
        }
        if (s.communicatie === "zelf" || rondjes == null) {
          const kop = document.createElement("button");
          kop.type = "button";
          kop.className = "knop-klein";
          kop.textContent = "📋 Kopieer tekst";
          kop.title = "Tekst met de betaalgegevens kopiëren om zelf te versturen";
          kop.addEventListener("click", () => kopieer(kopieertekst(d, s, rondjes), kop));
          rechts.append(kop);
        }
        if (!s.mail_verstuurd_op) {
          const weg = document.createElement("button");
          weg.type = "button";
          weg.className = "link-knop gevaar";
          weg.textContent = "Verwijderen";
          weg.addEventListener("click", async () => {
            if (!confirm(`Sponsor ${s.naam} verwijderen?`)) return;
            const { error } = await db.from("sponsors").delete().eq("id", s.id);
            if (error) return alert("Verwijderen mislukt.");
            laad();
          });
          rechts.append(weg);
        }

        li.append(info, rechts);
        return li;
      })
    );

    // Totaal
    const totaalEl = kaart.querySelector(".dn-totaal");
    const bedragen = sponsors.map((s) => bedragVan(s, rondjes));
    if (sponsors.length && bedragen.every((b) => b != null)) {
      totaalEl.innerHTML = `Totaal opgehaald: <strong>${euro(bedragen.reduce((a, b) => a + b, 0))}</strong>`;
      totaalEl.hidden = false;
    } else if (sponsors.length) {
      const perRondje = sponsors.filter((s) => s.soort === "per_rondje").reduce((a, s) => a + Number(s.bedrag), 0);
      const vast = sponsors.filter((s) => s.soort === "vast").reduce((a, s) => a + Number(s.bedrag), 0);
      totaalEl.innerHTML = `Je haalt <strong>${euro(perRondje)} per rondje</strong>${vast ? ` + <strong>${euro(vast)}</strong> vast` : ""} op.`;
      totaalEl.hidden = false;
    }
  }

  function koppelFormulier(kaart, d) {
    const form = kaart.querySelector(".dn-form");
    const melding = form.querySelector(".form-melding");
    const emailVeld = form.querySelector(".dn-email-veld");
    const toon = (t, fout = false) => {
      melding.hidden = !t;
      melding.textContent = t || "";
      melding.classList.toggle("fout", fout);
    };
    // Unieke namen voor de keuzerondjes per kaart
    form.querySelectorAll("input[type=radio]").forEach((r) => (r.name = `${r.name}-${d.id}`));
    const veld = (naam) => form.querySelector(`input[name="${naam}-${d.id}"]:checked`)?.value;
    const wisselEmail = () => (emailVeld.hidden = veld("communicatie") !== "mail");
    form.querySelectorAll(`input[name="communicatie-${d.id}"]`).forEach((r) => r.addEventListener("change", wisselEmail));
    wisselEmail();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const naam = form.elements.naam.value.trim();
      const bedrag = Number(String(form.elements.bedrag.value).replace(",", "."));
      const communicatie = veld("communicatie");
      const email = form.elements.email.value.trim();
      if (!naam) return toon("Vul de naam van de sponsor in.", true);
      if (!(bedrag > 0)) return toon("Vul een bedrag in.", true);
      if (communicatie === "mail" && !/^\S+@\S+\.\S+$/.test(email)) return toon("Vul een geldig e-mailadres in, of kies 'Ik laat het zelf weten'.", true);

      const knop = form.querySelector("button[type=submit]");
      knop.disabled = true;
      const { error } = await db.from("sponsors").insert({
        deelnemer_id: d.id,
        naam,
        soort: veld("soort"),
        bedrag,
        communicatie,
        email: communicatie === "mail" ? email : null,
      });
      knop.disabled = false;
      if (error) {
        console.error(error);
        return toon("Opslaan mislukt. Probeer het opnieuw.", true);
      }
      laad();
    });
  }

  function koppelKlaar(kaart, d, sponsors, rondjes) {
    const vraag = kaart.querySelector(".dn-klaar-vraag");
    const resultaat = kaart.querySelector(".dn-klaar-resultaat");
    const form = kaart.querySelector(".dn-rondjes-form");
    const melding = form.querySelector(".form-melding");
    const wat = d.loopt ? "gelopen" : "gewandeld";
    kaart.querySelector(".dn-klaar-vraag h3").textContent = d.loopt ? "Klaar met lopen?" : "Klaar met wandelen?";
    form.querySelector("button").textContent = d.loopt ? "🏁 Klaar met lopen" : "🏁 Klaar met wandelen";

    if (rondjes != null) {
      vraag.hidden = true;
      resultaat.hidden = false;
      const totaal = sponsors.reduce((a, s) => a + bedragVan(s, rondjes), 0);
      resultaat.querySelector(".dn-resultaat-tekst").innerHTML =
        `🏁 ${html(d.naam)} heeft <strong>${rondjes} rondjes</strong> ${wat}` +
        (sponsors.length ? ` en haalt <strong>${euro(totaal)}</strong> op!` : "!");
      form.elements.aantal.value = rondjes;
    }
    resultaat.querySelector(".dn-rondjes-wijzig").addEventListener("click", () => {
      resultaat.hidden = true;
      vraag.hidden = false;
      form.elements.aantal.focus();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const aantal = parseInt(form.elements.aantal.value, 10);
      if (!(aantal >= 0 && aantal <= 200)) {
        melding.hidden = false;
        melding.classList.add("fout");
        melding.textContent = "Vul een aantal rondjes in (0 tot 200).";
        return;
      }
      const teMailen = sponsors.filter((s) => s.communicatie === "mail" && !s.mail_verstuurd_op).length;
      const uitleg = teMailen ? `\n\n${teMailen} sponsor(s) krijgen dan meteen een mail met het bedrag.` : "";
      if (!confirm(`${d.naam} heeft ${aantal} rondjes ${wat}?${uitleg}`)) return;

      const knop = form.querySelector("button");
      knop.disabled = true;
      const { data, error } = await db.rpc("rondjes_opslaan", { p_deelnemer: d.id, p_aantal: aantal });
      knop.disabled = false;
      if (error) {
        console.error(error);
        melding.hidden = false;
        melding.classList.add("fout");
        melding.textContent = "Opslaan mislukt. Probeer het opnieuw.";
        return;
      }
      if (data?.gemaild) alert(`Bedankt! ${data.gemaild} sponsor(s) kregen een mail met het bedrag.`);
      laad();
    });
  }

  // ---------- Start ----------
  document.getElementById("dn-uitloggen").addEventListener("click", async () => {
    await db.auth.signOut();
    location.href = "inschrijven.html";
  });

  if (new URLSearchParams(location.search).has("nieuw")) {
    document.getElementById("dn-welkom").hidden = false;
  }

  db.auth.getSession().then(({ data: { session } }) => {
    if (!session) {
      status.innerHTML = 'Je bent niet ingelogd. <a href="inschrijven.html">Log in via de pagina Inschrijven</a>.';
      return;
    }
    gebruiker = session.user;
    document.getElementById("dn-email").textContent = gebruiker.email;
    laad();
  });
})();

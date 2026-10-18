export function macheDrehknopf(regler, beschriftung, weg, fein) {
  const ZIEH_WEG = weg;
  const FEIN = fein;
  // Grenzen einmal lesen. Nicht Number(regler.max) || 100: bei max="0" (Weißpunkt)
  // ist 0 "falsch" und es käme 100 heraus
  const min = regler.min === "" ? 0 : Number(regler.min);
  const max = regler.max === "" ? 100 : Number(regler.max);
  const spanne = max - min;
  const startwert = Number(regler.value); // deshalb erst NACH dem Setzen der Startwerte aufrufen

  // ein Schritt für Tasten und Mausrad: ein Hundertstel des Bereichs,
  // aber nie feiner als der Regler selbst kann (step im HTML)
  const schritt = Math.max(Number(regler.step) || 0, spanne / 100);

  const knopf = document.createElement("button");
  knopf.type = "button";
  knopf.className = "knopf";
  knopf.setAttribute("role", "slider"); // Screenreader: "Schieberegler", nicht "Schaltfläche"
  knopf.setAttribute("aria-label", beschriftung);
  knopf.setAttribute("aria-valuemin", String(min));
  knopf.setAttribute("aria-valuemax", String(max));

  regler.classList.add("regler-versteckt");
  regler.tabIndex = -1; // mit Tab nur noch zum Knopf, nicht vorher zum unsichtbaren Regler
  regler.insertAdjacentElement("afterend", knopf); // direkt hinter den Regler ins HTML
  regler.closest("label").classList.add("mit-knopf"); // closest: das nächste umgebende <label>

  // Wert → Winkel: min = -135°, max = +135° (oben ist 0°, unten bleiben 90° frei)
  function aktualisiere() {
    const wert = Number(regler.value);
    const anteil = spanne === 0 ? 0 : (wert - min) / spanne;
    knopf.style.setProperty("--winkel", `${-135 + anteil * 270}deg`);
    knopf.setAttribute("aria-valuenow", String(wert));
  }

  function setzeWert(wert) {
    regler.value = String(wert); // der Regler rundet selbst auf step und kappt an min/max
    regler.dispatchEvent(new Event("input", { bubbles: true }));
  }

  regler.addEventListener("input", aktualisiere);
  regler.aktualisiereKnopf = aktualisiere; // für haltePaar (und später MIDI)
  aktualisiere();

  // Ziehen: in jedem Schritt nur die Bewegung seit dem letzten Mal dazurechnen.
  // So kann man mitten im Ziehen Shift drücken, ohne dass der Wert springt.
  let letztesY = 0;
  let wertZiehen = 0; // ungerundet, sonst gingen feine Bewegungen unter einem step verloren

  knopf.addEventListener("pointerdown", (event) => {
    event.preventDefault(); // beim Ziehen keinen Text markieren
    letztesY = event.clientY;
    wertZiehen = Number(regler.value);
    knopf.setPointerCapture(event.pointerId); // Bewegungen kommen auch außerhalb des Knopfs an
    knopf.focus(); // preventDefault verhindert auch den Fokus, also selbst fokussieren
  });

  knopf.addEventListener("pointermove", (event) => {
    if (!knopf.hasPointerCapture(event.pointerId)) return; // nur während gedrückt
    const weg = letztesY - event.clientY; // nach oben = positiv
    letztesY = event.clientY;
    const teiler = event.shiftKey ? ZIEH_WEG * FEIN : ZIEH_WEG;
    wertZiehen = Math.min(
      max,
      Math.max(min, wertZiehen + (weg * spanne) / teiler),
    );
    setzeWert(wertZiehen);
  });

  knopf.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault(); // nicht die Seite scrollen
      // Shift + Rad wird in manchen Browsern zu deltaX, deshalb beides ansehen
      const richtung = -Math.sign(event.deltaY || event.deltaX); // Rad hoch = mehr
      setzeWert(Number(regler.value) + richtung * schritt);
    },
    { passive: false }, // sonst darf preventDefault beim Rad nicht wirken
  );

  knopf.addEventListener("dblclick", () => setzeWert(startwert));

  knopf.addEventListener("keydown", (event) => {
    const grob = event.shiftKey ? 10 : 1;
    const wert = Number(regler.value);
    // Nachschlagen statt if-Kette: Taste → neuer Wert
    const TASTEN = {
      ArrowUp: wert + schritt * grob,
      ArrowRight: wert + schritt * grob,
      ArrowDown: wert - schritt * grob,
      ArrowLeft: wert - schritt * grob,
      Home: min,
      End: max,
    };
    if (!(event.key in TASTEN)) return; // andere Tasten (Tab …) normal lassen
    event.preventDefault(); // Pfeiltasten scrollen sonst die Seite
    setzeWert(TASTEN[event.key]);
  });
}

import { macheDrehknopf } from "./knopfRegler.js";

const spieler = hole("spieler");
const canvas = hole("bild");
const ctx = canvas.getContext("2d");

const canvas2 = hole("skala");
const ctx2 = canvas2.getContext("2d");

const ansicht = hole("ansicht");

const startBtn = hole("startBtn");

const fftRegler = hole("fftRegler");
const fftAnzeige = hole("fftAnzeige");
const glaettung = hole("glaettung");
const glaettungAnzeige = hole("glaettungAnzeige");

// ihre Zahl der Regler ist dann Number(element.value)
const minDb = hole("minDb");
const minDbAnzeige = hole("minDbAnzeige");
const maxDb = hole("maxDb");
const maxDbAnzeige = hole("maxDbAnzeige");

const lautstaerke = hole("lautstaerke");
const lautstaerkeAnzeige = hole("lautstaerkeAnzeige");

const tiefen = hole("tiefen");
const tiefenAnzeige = hole("tiefenAnzeige");
const hoehen = hole("hoehen");
const hoehenAnzeige = hole("hoehenAnzeige");
const hoeren = hole("hoeren"); // Auswahl: alles / tiefen / mitten / hoehen

const wrapper = hole("feld"); // der Rahmen um beide Canvas, bekommt Klassen fürs Seitenverhältnis
const spektrumOben = hole("spektrumOben"); // Häkchen: beim Wasserfall das Spektrum darüber
const spektrumObenLabel = hole("spektrumObenLabel"); // nur beim Wasserfall sichtbar

// Anteil der Canvas-Höhe für das Spektrum über dem Wasserfall.
// Das CSS macht den Rahmen dann 1,25-mal so hoch (style.css, .mit-spektrum),
// so bleibt der Wasserfall genauso groß wie ohne: 0,25 / 1,25 = 0,2
const OBEN_ANTEIL = 0.2;
let oben = 0; // Höhe des Spektrum-Bereichs in Pixeln, 0 = kein Spektrum oben

const MIN_FREQUENZ = 20;
const MAX_FREQUENZ = 20000;
// Hörbereich des Menschen, ungefähr

const ZIEH_WEG = 180; // Pixel für den ganzen Bereich
const FEIN = 10; // mit Shift braucht man den zehnfachen Weg

let audio = null; // AudioContext, erst nach dem Klick
let analyser = null;
let werte = null; // Uint8Array für die Lautstärken
let anteile = null;
let laufId = null;
let verlauf = null; // Farbverlauf über die ganze Höhe (Spektrum allein)
let verlaufOben = null; // Farbverlauf nur über den Bereich oben (Spektrum über dem Wasserfall)
let verstaerker = null;
let hochpaesse = []; // zwei Hochpässe hintereinander: lassen nur durch, was ÜBER ihrer Frequenz liegt
let tiefpaesse = []; // zwei Tiefpässe hintereinander: lassen nur durch, was UNTER ihrer Frequenz liegt

// Nachschlagewerke: welche Fächer in welche Pixelspalte / Pixelzeile fallen
let vonFach = null; // Int32Array: erstes Fach jeder Pixelspalte (Spektrum)
let bisFach = null; // Int32Array: letztes Fach jeder Pixelspalte (Spektrum)
let vonFachZeile = null; // Int32Array: erstes Fach jeder Pixelzeile (Spektrogramm)
let bisFachZeile = null; // Int32Array: letztes Fach jeder Pixelzeile (Spektrogramm)

let spalte = null; // ImageData: die neue Spalte ganz rechts im Spektrogramm, 1 Pixel breit
let zeile = null; // ImageData: die neue Zeile ganz oben im Wasserfall, 1 Pixel hoch

const SKALA = [50, 100, 200, 500, 1000, 2000, 5000, 10000]; // feste Frequenzen in Hz

// immer sinnvolle Hilfsfunktion
//------------------------------------------------------
function hole(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Im HTML fehlt ein Element mit id="${id}"`);
  return element;
}

let dpr = 2;

function passeGroesseAn() {
  // mindestens doppelt so fein rechnen, auch bei normalen Monitoren mit dpr 1
  dpr = Math.max(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  canvas2.width = Math.round(canvas2.clientWidth * dpr);
  canvas2.height = Math.round(canvas2.clientHeight * dpr);
  zeichneSkala(); // Größe setzen leert den Canvas, also gleich neu zeichnen
  if (audio) berechneTabellen(); // Spalten- und Zeilentabellen hängen von der Größe ab
}
//------------------------------------------------------

hole("datei").addEventListener("change", (event) => {
  const datei = event.target.files[0];
  if (!datei) return;
  spieler.src = URL.createObjectURL(datei); // die Datei bleibt auf deinem Rechner
});

startBtn.addEventListener("click", () => {
  if (!audio) baueAudioAuf(); // nur beim ersten Klick
  if (laufId === null) {
    zeichne(); // starten
    startBtn.textContent = "Stop";
  } else {
    cancelAnimationFrame(laufId); // anhalten
    laufId = null;
    startBtn.textContent = "Start";
  }
});

function baueAudioAuf() {
  audio = new AudioContext();

  // die AudioQuelle 
  const meineAudio = audio.createMediaElementSource(spieler);
  verstaerker = audio.createGain(); // Lautstärke der Ausgabe, Wert setzt setzeLautstaerke()
  analyser = audio.createAnalyser();
  analyser.fftSize = fftGroesse(); // fft - Fast Fourier Transform
  // (wie viele Samples die FFT auf einmal anschaut, die Hälfte davon gibt es als Fächer)
  analyser.smoothingTimeConstant = Number(glaettung.value);
  setzeAnalyserDb(Number(minDb.value), Number(maxDb.value)); // Schwarz- und Weißpunkt
  // je zwei gleiche Filter hintereinander: doppelt so steil (24 statt 12 dB pro Oktave)
  hochpaesse = [baueFilter("highpass"), baueFilter("highpass")];
  tiefpaesse = [baueFilter("lowpass"), baueFilter("lowpass")];

  // Quelle -> 2 Hochpässe -> 2 Tiefpässe -> Analyser -> Verstärker -> Lautsprecher
  // Filter VOR dem Analyser: man sieht nur, was man hört
  // connect gibt sein Ziel zurück, deshalb lässt sich die Kette aneinanderhängen
  meineAudio
    .connect(hochpaesse[0])
    .connect(hochpaesse[1])
    .connect(tiefpaesse[0])
    .connect(tiefpaesse[1])
    .connect(analyser)
    .connect(verstaerker)
    .connect(audio.destination);
  setzeLautstaerke(); // Regler-Wert auf den Verstärker übernehmen
  setzeFilter(); // gewähltes Band auf die Filter übernehmen
  richteFaecherEin();
}

// Ansicht oder Häkchen geändert: Klassen am Rahmen setzen (CSS ändert damit das
// Seitenverhältnis, der ResizeObserver passt danach die Canvas an), Reste wegräumen
function wechsleAnsicht() {
  const wasserfall = ansicht.value === "wasserfall";
  wrapper.classList.toggle("wasserfall", wasserfall); // toggle(name, an): Klasse an oder aus
  wrapper.classList.toggle("mit-spektrum", wasserfall && spektrumOben.checked);
  spektrumObenLabel.hidden = !wasserfall; // Häkchen nur beim Wasserfall zeigen

  oben =
    wasserfall && spektrumOben.checked
      ? Math.round(canvas.height * OBEN_ANTEIL)
      : 0;
  if (audio) verlaufOben = baueVerlauf(oben);
  // ändert sich dadurch die Größe, rechnet passeGroesseAn -> berechneTabellen beides gleich neu
  ctx.clearRect(0, 0, canvas.width, canvas.height); // Reste der alten Ansicht weg
  zeichneSkala();
}

ansicht.addEventListener("change", wechsleAnsicht); // einfach die Skala neu zeichnen
spektrumOben.addEventListener("change", wechsleAnsicht);

// Regler liefert den Exponenten 11–15, fftSize muss eine Zweierpotenz sein
function fftGroesse() {
  return 2 ** Number(fftRegler.value); // value ist Text, Number macht eine Zahl daraus
}

function deutsch(zahl) {
  return zahl.toLocaleString("de-DE", { maximumFractionDigits: 2 }); // 0.34 → "0,34"
}

function zeigeFft() {
  fftAnzeige.textContent = fftGroesse();
}

function zeigeGlaettung() {
  glaettungAnzeige.textContent = deutsch(Number(glaettung.value));
}

fftRegler.addEventListener("input", () => {
  zeigeFft();
  if (!analyser) return; // vor dem Start nur anzeigen, baueAudioAuf liest den Wert später
  analyser.fftSize = fftGroesse();
  richteFaecherEin(); // neue Fächerzahl: Listen und Tabellen neu
});

glaettung.addEventListener("input", () => {
  zeigeGlaettung();
  if (analyser) analyser.smoothingTimeConstant = Number(glaettung.value);
});

// Ein Reglerpaar, bei dem "unten" immer mindestens "abstand" unter "oben" bleibt
// (dB-Bereich, Grenzen der Bänder). Gezogen wird einer, der ANDERE wird mitgeschoben.
// Stößt der andere an sein Ende (min/max im HTML), wird stattdessen der gezogene gebremst.
// Gibt die beiden Zahlen zurück.
function haltePaar(unten, oben, abstand, gezogen) {
  let u = Number(unten.value);
  let o = Number(oben.value);
  if (o - u < abstand) {
    if (gezogen === unten) {
      oben.value = u + abstand; // mitschieben (der Regler kappt selbst an seinem max)
      o = Number(oben.value);
      u = Math.min(u, o - abstand); // ging es nicht weit genug: gezogenen bremsen
      unten.value = u;
    } else {
      unten.value = o - abstand;
      u = Number(unten.value);
      o = Math.max(o, u + abstand);
      oben.value = o;
    }
  }
  // value direkt setzen löst kein input-Event aus, also die Knöpfe selbst nachziehen.
  // ?.() ruft nur auf, wenn es die Funktion gibt (Regler ohne Knopf: nichts passiert)
  unten.aktualisiereKnopf?.();
  oben.aktualisiereKnopf?.();
  return [Number(unten.value), Number(oben.value)];
}

// Dezibel-Bereich: nur minDb bis maxDb wird auf 0–255 verteilt
// minDb = Schwarzpunkt (leiser wird schwarz), maxDb = Weißpunkt (lauter wird hellgelb)
const DB_ABSTAND = 10; // min muss mindestens so viel unter max bleiben

function setzeDb(gezogen) {
  const [min, max] = haltePaar(minDb, maxDb, DB_ABSTAND, gezogen);
  minDbAnzeige.textContent = min;
  maxDbAnzeige.textContent = max;
  if (analyser) setzeAnalyserDb(min, max);
}

// Reihenfolge so wählen, dass min auch zwischendurch nie >= max ist,
// sonst wirft der Browser einen Fehler (IndexSizeError)
function setzeAnalyserDb(min, max) {
  if (min < analyser.maxDecibels) {
    analyser.minDecibels = min; // neues min passt unter das alte max
    analyser.maxDecibels = max;
  } else {
    analyser.maxDecibels = max; // erst max hoch, sonst wäre min kurz über max
    analyser.minDecibels = min;
  }
}

minDb.addEventListener("input", () => setzeDb(minDb)); // übergeben wird das gezogene ELEMENT
maxDb.addEventListener("input", () => setzeDb(maxDb));

// Lautstärke der Ausgabe in dB; ändert nur, was man hört, nicht das Bild
// (der Verstärker sitzt hinter dem Analyser)
function setzeLautstaerke() {
  const db = Number(lautstaerke.value);
  lautstaerkeAnzeige.textContent = `${db > 0 ? "+" : ""}${db} dB`;
  // dB -> Faktor: +6 dB ≈ doppelte Amplitude, +20 dB = zehnfach, 0 dB = unverändert
  if (verstaerker) verstaerker.gain.value = 10 ** (db / 20);
}

lautstaerke.addEventListener("input", setzeLautstaerke);

// Grenzen der Bänder: Tiefen | Mitten | Höhen
// Die Regler gehen von 0 bis 1 (Anteil auf der Log-Achse), daraus wird die Frequenz.
// So liegen 20–200 Hz, 200–2000 Hz und 2–20 kHz je auf einem Drittel des Wegs.
const GRENZ_ABSTAND = 0.05; // ≈ eine halbe Oktave Mindestabstand zwischen den Grenzen

let grenzeTief = 250; // Hz, Tiefen | Mitten
let grenzeHoch = 4000; // Hz, Mitten | Höhen

// 250 -> "250 Hz", 4000 -> "4 kHz", 1234 -> "1,2 kHz"
function zeigeFrequenz(f) {
  return f < 1000
    ? `${Math.round(f)} Hz`
    : `${deutsch(Math.round(f / 100) / 10)} kHz`;
}

function setzeGrenzen(gezogen) {
  const [unten, oben] = haltePaar(tiefen, hoehen, GRENZ_ABSTAND, gezogen);
  grenzeTief = anteilZuFrequenz(unten);
  grenzeHoch = anteilZuFrequenz(oben);
  tiefenAnzeige.textContent = zeigeFrequenz(grenzeTief);
  hoehenAnzeige.textContent = zeigeFrequenz(grenzeHoch);
  zeichneSkala(); // Bänder neu markieren
  setzeFilter(); // wenn ein Band gehört wird: Filter mitziehen
}

tiefen.addEventListener("input", () => setzeGrenzen(tiefen));
hoehen.addEventListener("input", () => setzeGrenzen(hoehen));

// Welches Band man hört (und sieht): Hochpass + Tiefpass, vier Einstellungen
const GANZ_UNTEN = 10; // Hz, Hochpass so tief, dass er nichts Hörbares wegnimmt

// Q bei Hoch-/Tiefpass ist in Web Audio in dB angegeben.
// -3 dB entspricht dem "Butterworth"-Filter: ohne Buckel an der Grenze.
// Zwei davon hintereinander ergeben zusammen genau -6 dB an der Grenze, so passen
// die Bänder sauber aneinander (heißt "Linkwitz-Riley", so trennen auch Lautsprecherweichen).
const BUTTERWORTH_Q = -3.01;

function baueFilter(typ) {
  const filter = audio.createBiquadFilter();
  filter.type = typ;
  filter.Q.value = BUTTERWORTH_Q;
  return filter;
}

function setzeFilter() {
  if (!hochpaesse.length) return; // vor dem Start gibt es noch keine Filter
  const ganzOben = audio.sampleRate / 2; // höchste mögliche Frequenz (Nyquist)

  // Nachschlagen statt if-Kette: zu jedem Modus [Hochpass bei, Tiefpass bei]
  const EINSTELLUNG = {
    alles: [GANZ_UNTEN, ganzOben],
    tiefen: [GANZ_UNTEN, grenzeTief],
    mitten: [grenzeTief, grenzeHoch],
    hoehen: [grenzeHoch, ganzOben],
  };
  const [unten, oben] = EINSTELLUNG[hoeren.value];

  // sanft hingleiten (~10 ms) statt hart umsetzen, sonst knackt es beim Ziehen
  for (const filter of hochpaesse)
    filter.frequency.setTargetAtTime(unten, audio.currentTime, 0.01);
  for (const filter of tiefpaesse)
    filter.frequency.setTargetAtTime(oben, audio.currentTime, 0.01);
}

hoeren.addEventListener("change", setzeFilter);

function richteFaecherEin() {
  werte = new Uint8Array(analyser.frequencyBinCount);
  // Fach (Bin): Ein Ergebnis der FFT, also ein Frequenzband mit seiner Lautstärke.
  // frequencyBinCount: Wie viele Fächer herauskommen, nämlich fftSize / 2
  anteile = new Float32Array(analyser.frequencyBinCount + 1);
  berechneAnteil();
  berechneTabellen();
}

// Farbskala als Zahlen: für jeden Wert 0–255 drei Zahlen r, g, b hintereinander
// (Zahlen statt Text, weil das Spektrogramm die Pixel direkt schreibt)
const farbenZahlen = new Uint8Array(256 * 3);

const ANKER = [
  [0, 0, 4], // 0.00  fast schwarz
  [87, 16, 110], // 0.25  dunkelviolett
  [188, 55, 84], // 0.50  rot-pink
  [249, 142, 9], // 0.75  orange
  [252, 255, 164], // 1.00  hellgelb
];

// wie mix() in GLSL: t = 0 gibt a, t = 1 gibt b, dazwischen anteilig
function mische(a, b, t) {
  return a + (b - a) * t;
}

function farbenGenerieren() {
  for (let v = 0; v < 256; v++) {
    // v (0–255) auf die Anker-Strecke umrechnen: 0 bis 4 bei 5 Ankern
    const position = (v / 255) * (ANKER.length - 1);

    // ab welchem Anker gemischt wird; höchstens der vorletzte,
    // sonst gäbe es bei v = 255 kein ANKER[i + 1]
    const i = Math.min(Math.floor(position), ANKER.length - 2);

    // wie weit wir schon vom Anker i zum Anker i + 1 sind (0 bis 1)
    const t = position - i;

    const von = ANKER[i];
    const bis = ANKER[i + 1];
    farbenZahlen[v * 3] = Math.round(mische(von[0], bis[0], t)); // rot
    farbenZahlen[v * 3 + 1] = Math.round(mische(von[1], bis[1], t)); // grün
    farbenZahlen[v * 3 + 2] = Math.round(mische(von[2], bis[2], t)); // blau
  }
}

function frequenz(i) {
  return (i * audio.sampleRate) / analyser.fftSize;
  // Fächer sind gleich breit (linear): Fach i liegt bei i mal Fachbreite
  // sample rate ist wieviele samples pro sekunde gemessen werden (z. B. 48.000)
  // fftSize - Wie viele Samples die FFT auf einmal anschaut
  // beim Standard 16384 Samples, also 16384 / 48.000 = 0,34 s Ton (richtet sich nach dem Regler)
  // Die höchste Frequenz, die man überhaupt messen kann: sampleRate / 2 = 24.000 Hz (braucht berg und tal)
  // Fachbreite: Die 24.000 Hz bis zur Nyquist-Frequenz, verteilt auf fftSize / 2 Fächer
  // also (sampleRate / 2) / (fftSize / 2) = sampleRate / fftSize
}

function frequenzZuAnteil(f) {
  return Math.log(f / MIN_FREQUENZ) / Math.log(MAX_FREQUENZ / MIN_FREQUENZ);
  // 0 bei MIN_FREQUENZ, 1 bei MAX_FREQUENZ
}

// Umkehrung von frequenzZuAnteil (Potenz statt Logarithmus): 0 → MIN, 1 → MAX
function anteilZuFrequenz(anteil) {
  return MIN_FREQUENZ * (MAX_FREQUENZ / MIN_FREQUENZ) ** anteil;
}

function beschriftung(f) {
  return f < 1000 ? `${f}` : `${f / 1000}k`;
}

function zeichneSkala() {
  ctx2.clearRect(0, 0, canvas2.width, canvas2.height); // durchsichtig, nicht übermalen
  ctx2.font = `${12 * dpr}px monospace`;
  ctx2.textBaseline = "bottom"; // Text steht auf der Linie, nicht durchgestrichen

  const aTief = frequenzZuAnteil(grenzeTief);
  const aHoch = frequenzZuAnteil(grenzeHoch);

  // [von, bis, farbe]: Anteile auf der Log-Achse, 0 = 20 Hz, 1 = 20 kHz
  const BAENDER = [
    [0, aTief, "rgba(70, 110, 255, 0.13)"], // Tiefen: blau
    [aTief, aHoch, "rgba(70, 220, 120, 0.10)"], // Mitten: grün
    [aHoch, 1, "rgba(221, 221, 221, 0.07)"], // Höhen: hell
  ];

  for (const [von, bis, farbe] of BAENDER) {
    ctx2.fillStyle = farbe;
    if (ansicht.value === "spektrogramm") {
      // tiefe Töne unten: das obere Ende des Bands ist das kleinere y
      const yOben = canvas2.height * (1 - bis);
      const yUnten = canvas2.height * (1 - von);
      ctx2.fillRect(0, yOben, canvas2.width, yUnten - yOben);
    } else {
      ctx2.fillRect(
        canvas2.width * von,
        0,
        canvas2.width * (bis - von),
        canvas2.height,
      );
    }
  }

  for (const f of SKALA) {
    const anteil = frequenzZuAnteil(f);
    const text = beschriftung(f);

    if (ansicht.value === "spektrogramm") {
      const y = Math.round(canvas2.height * (1 - anteil));
      ctx2.fillStyle = "rgba(221, 221, 221, 0.3)";
      ctx2.fillRect(0, y, canvas2.width, 1); // waagerechte Linie
      ctx2.fillStyle = "rgba(221, 221, 221, 0.9)";
      ctx2.fillText(text, 4 * dpr, y - 2 * dpr); // Zahl links über der Linie
    } else {
      const x = Math.round(canvas2.width * anteil);
      ctx2.fillStyle = "rgba(221, 221, 221, 0.3)";
      ctx2.fillRect(x, 0, 1, canvas2.height); // senkrechte Linie
      ctx2.fillStyle = "rgba(221, 221, 221, 0.9)";
      ctx2.fillText(text, x + 3 * dpr, canvas2.height - 4 * dpr); // Zahl unten rechts neben der Linie
    }
  }
}

// läuft, wenn sich Größe oder fftSize ändern, nicht in jedem Bild
function berechneTabellen() {
  const fachbreite = audio.sampleRate / analyser.fftSize;
  const letztes = werte.length - 1;
  const verhaeltnis = MAX_FREQUENZ / MIN_FREQUENZ;

  // Umkehrung des Logarithmus (Potenz): Position auf der Achse -> Frequenz.
  // Die Pixel sind auf der Log-Achse gleich verteilt, die Fächer linear.
  // Bei tiefen Tönen ist ein Fach größer als ein Pixel, bei hohen liegen viele Fächer auf einem Pixel.
  // Beim Zeichnen nehmen wir pro Pixel das lauteste Fach.

  // Spektrum: Spalten von links (MIN) nach rechts (MAX)
  const breite = canvas.width;
  vonFach = new Int32Array(breite);
  bisFach = new Int32Array(breite);
  for (let x = 0; x < breite; x++) {
    const fLinks = MIN_FREQUENZ * verhaeltnis ** (x / breite);
    const fRechts = MIN_FREQUENZ * verhaeltnis ** ((x + 1) / breite);
    vonFach[x] = Math.floor(fLinks / fachbreite);
    bisFach[x] = Math.min(Math.floor(fRechts / fachbreite), letztes);
  }

  // Spektrogramm: Zeilen von oben (MAX) nach unten (MIN), deshalb 1 - ...
  const hoehe = canvas.height;
  vonFachZeile = new Int32Array(hoehe);
  bisFachZeile = new Int32Array(hoehe);
  for (let y = 0; y < hoehe; y++) {
    const fOben = MIN_FREQUENZ * verhaeltnis ** (1 - y / hoehe); // Oberkante der Zeile = höhere Frequenz
    const fUnten = MIN_FREQUENZ * verhaeltnis ** (1 - (y + 1) / hoehe); // Unterkante = tiefere Frequenz
    vonFachZeile[y] = Math.floor(fUnten / fachbreite);
    bisFachZeile[y] = Math.min(Math.floor(fOben / fachbreite), letztes);
  }

  // leere Pixelspalte (Spektrogramm) und Pixelzeile (Wasserfall), jedes Bild neu befüllt
  spalte = ctx.createImageData(1, hoehe);
  zeile = ctx.createImageData(breite, 1);

  // Bereich fürs Spektrum über dem Wasserfall hängt von der Höhe ab, also hier neu
  oben =
    ansicht.value === "wasserfall" && spektrumOben.checked
      ? Math.round(hoehe * OBEN_ANTEIL)
      : 0;

  verlauf = baueVerlauf(hoehe);
  verlaufOben = baueVerlauf(oben);
}

// Farbverlauf der Farbskala von unten (y = hoehe, schwarz) nach oben (y = 0, hellgelb)
function baueVerlauf(hoehe) {
  const v = ctx.createLinearGradient(0, hoehe, 0, 0);
  for (let n = 0; n < ANKER.length; n++) {
    const [r, g, b] = ANKER[n]; // die drei Zahlen der Liste direkt in drei Variablen
    v.addColorStop(n / (ANKER.length - 1), `rgb(${r}, ${g}, ${b})`);
  }
  return v;
}

function berechneAnteil() {
  for (let i = 0; i < anteile.length; i++) {
    anteile[i] = frequenzZuAnteil(frequenz(i)); // unabhängig von der Canvas-Größe
    // dadurch wird es nur beim Start einmal berechnet und dann erst wieder wenn sich was ändert
    // sonst müsste jedes mal logorithmus berechnet werden
  }
}

// das lauteste Fach zwischen von und bis (beide eingeschlossen)
function lautestes(von, bis) {
  let lautester = 0;
  for (let i = von; i <= bis; i++) {
    if (werte[i] > lautester) lautester = werte[i];
  }
  return lautester;
}

function zeichneSpektrogramm() {
  ctx.drawImage(canvas, -1, 0);
  // canvas auf sich selber versetzt um einen Pixel nach links malen

  const pixel = spalte.data; // Uint8ClampedArray: pro Pixel 4 Zahlen (rot, grün, blau, deckkraft)
  for (let y = 0; y < spalte.height; y++) {
    const wert = lautestes(vonFachZeile[y], bisFachZeile[y]); // 0–255, lauter = heller
    const p = y * 4; // wo das Pixel dieser Zeile in der Liste anfängt
    const f = wert * 3; // wo die Farbe dieses Werts in farbenZahlen anfängt
    pixel[p] = farbenZahlen[f];
    pixel[p + 1] = farbenZahlen[f + 1];
    pixel[p + 2] = farbenZahlen[f + 2];
    pixel[p + 3] = 255; // voll deckend
  }
  ctx.putImageData(spalte, canvas.width - 1, 0); // EIN Aufruf für die ganze Spalte
}

// Wasserfall: Frequenz waagerecht wie beim Spektrum, Zeit läuft von oben nach unten.
// Mit Spektrum oben beginnt der Wasserfall erst bei y = oben (sonst bei 0).
function zeichneWasserfall() {
  // nur den Wasserfall-Streifen 1 Pixel nach unten schieben, das Spektrum oben bleibt stehen
  // drawImage(quelle, qx, qy, qBreite, qHoehe,  zx, zy, zBreite, zHoehe): Ausschnitt → Ziel
  const h = canvas.height - oben - 1; // Höhe, die kopiert wird (die unterste Zeile fällt raus)
  ctx.drawImage(canvas, 0, oben, canvas.width, h, 0, oben + 1, canvas.width, h);

  const pixel = zeile.data;
  for (let x = 0; x < zeile.width; x++) {
    const wert = lautestes(vonFach[x], bisFach[x]); // 0–255, lauter = heller
    const p = x * 4; // wo das Pixel dieser Spalte in der Liste anfängt
    const f = wert * 3; // wo die Farbe dieses Werts in farbenZahlen anfängt
    pixel[p] = farbenZahlen[f];
    pixel[p + 1] = farbenZahlen[f + 1];
    pixel[p + 2] = farbenZahlen[f + 2];
    pixel[p + 3] = 255; // voll deckend
  }
  ctx.putImageData(zeile, 0, oben); // erste Zeile des Wasserfalls (ohne Spektrum: ganz oben)

  if (oben > 0) zeichneSpektrum(oben, verlaufOben); // Spektrum in den Bereich darüber
}

// Spektrum in den Bereich von y = 0 bis hoeheCanvas, mit dem passenden Farbverlauf
function zeichneSpektrum(hoeheCanvas, farbverlauf) {
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, canvas.width, hoeheCanvas); // nur den eigenen Bereich leeren

  ctx.beginPath(); // EINMAL: neuer Pfad
  ctx.moveTo(0, hoeheCanvas); // unten links anfangen

  for (let x = 0; x < canvas.width; x++) {
    const hoehe = (lautestes(vonFach[x], bisFach[x]) / 255) * hoeheCanvas; // 0–255 -> Pixel
    ctx.lineTo(x, hoeheCanvas - hoehe); // pro Spalte nur einen Punkt anhängen
  }

  ctx.lineTo(canvas.width, hoeheCanvas); // unten rechts
  ctx.closePath(); // zurück nach unten links
  ctx.fillStyle = farbverlauf;
  ctx.fill(); // EINMAL füllen
}

function zeichne() {
  analyser.getByteFrequencyData(werte);
  // befüllt jetzt das Array mit Werten von 0 - 255
  // je nachdem wie laut
  // nur der Bereich minDecibels bis maxDecibels (Standard -100 bis -30 dB) wird auf 0–255 verteilt
  if (ansicht.value === "spektrogramm") zeichneSpektrogramm();
  else if (ansicht.value === "wasserfall")
    zeichneWasserfall(); // zeichnet das Spektrum oben selbst mit
  else if (ansicht.value === "spektrum")
    zeichneSpektrum(canvas.height, verlauf);
  laufId = requestAnimationFrame(zeichne); // die einzige Stelle mit rAF
}

// Beim Laden, einmal. Ganz unten, damit alles darüber schon fertig ist
// (const und let gibt es erst ab ihrer Zeile, function-Deklarationen schon vorher)
//------------------------------------------------------
farbenGenerieren(); // Farbtabelle einmal beim Start, nicht in zeichne()

tiefen.value = frequenzZuAnteil(250); // Startwerte: übliche Einteilung (Mischpult, EQ)
hoehen.value = frequenzZuAnteil(4000);

// Knöpfe erst NACH den Startwerten, sonst merkt sich der Doppelklick die Werte aus dem HTML
macheDrehknopf(tiefen, "Tiefen bis", ZIEH_WEG, FEIN);
macheDrehknopf(hoehen, "Höhen ab", ZIEH_WEG, FEIN);

wechsleAnsicht();
zeigeFft();
zeigeGlaettung();
setzeDb(minDb);
setzeLautstaerke();
setzeGrenzen(tiefen);

const beobachter = new ResizeObserver(passeGroesseAn);
beobachter.observe(canvas);

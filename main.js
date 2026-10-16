const spieler = hole("spieler");
const canvas = hole("bild");
const ctx = canvas.getContext("2d");

const canvas2 = hole("skala");
const ctx2 = canvas2.getContext("2d");

const ansicht = hole("ansicht");

const startBtn = hole("startBtn")

const MIN_FREQUENZ = 20;
const MAX_FREQUENZ = 20000; 
// Hörbereich des Menschen, ungefähr

let audio = null; // AudioContext, erst nach dem Klick
let analyser = null;
let werte = null; // Uint8Array für die Lautstärken
let grenzen = null;
let anteile = null;
let laufId = null;

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
  if (audio) {
    berechneGrenzen();
  }
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
    zeichne();                       // starten
    startBtn.textContent = "Stop";
  } else {
    cancelAnimationFrame(laufId);    // anhalten
    laufId = null;
    startBtn.textContent = "Start";
  }
});

function baueAudioAuf() {
  audio = new AudioContext();

  // die AudioQuelle (erstmal eine Datei über input)
  const meineAudio = audio.createMediaElementSource(spieler);
  analyser = audio.createAnalyser();
  analyser.fftSize = 4096 * 4; // fft - Fast Fourier Transform
  // (wie viele Samples die FFT auf einmal anschaut, die Hälfte davon gibt es als Fächer)

  meineAudio.connect(analyser);
  analyser.connect(audio.destination);
  // oder einfach meineAudio.connect(analyser).connect(audio.destination);
  // connect gibt sein Ziel zurück (meineAudio.connect(analyser); -> gibt analyser zurück)

  werte = new Uint8Array(analyser.frequencyBinCount);
  // Fach (Bin): Ein Ergebnis der FFT, also ein Frequenzband mit seiner Lautstärke.
  // frequencyBinCount: Wie viele Fächer herauskommen, nämlich fftSize / 2 = 8192.
  anteile = new Float32Array(analyser.frequencyBinCount + 1);
  grenzen = new Float32Array(analyser.frequencyBinCount + 1);
  berechneAnteil();
  berechneGrenzen();
}

ansicht.addEventListener("change", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height); // Reste der alten Ansicht weg
});

const farben = []; // 256 fertige Farbtexte, Index = Lautstärke 0–255

const ANKER = [
  [0, 0, 4],        // 0.00  fast schwarz
  [87, 16, 110],    // 0.25  dunkelviolett
  [188, 55, 84],    // 0.50  rot-pink
  [249, 142, 9],    // 0.75  orange
  [252, 255, 164],  // 1.00  hellgelb
];

// wie mix() in GLSL: t = 0 gibt a, t = 1 gibt b, dazwischen anteilig
function mische(a, b, t) {
  return a + (b - a) * t;
}

function farbenGenerieren() {
  for (let v = 0; v < 256; v++) {
    // v (0–255) auf die Anker-Strecke umrechnen: 0 bis 4 bei 5 Ankern
    const position = v / 255 * (ANKER.length - 1);

    // ab welchem Anker gemischt wird; höchstens der vorletzte,
    // sonst gäbe es bei v = 255 kein ANKER[i + 1]
    const i = Math.min(Math.floor(position), ANKER.length - 2);

    // wie weit wir schon vom Anker i zum Anker i + 1 sind (0 bis 1)
    const t = position - i;

    const von = ANKER[i];
    const bis = ANKER[i + 1];
    const r = Math.round(mische(von[0], bis[0], t));
    const g = Math.round(mische(von[1], bis[1], t));
    const b = Math.round(mische(von[2], bis[2], t));

    farben.push(`rgb(${r}, ${g}, ${b})`);
  }
}

farbenGenerieren(); // einmal beim Start, nicht in zeichne()

function frequenz(i) {
  return i * audio.sampleRate / analyser.fftSize;
  // Fächer sind gleich breit (linear): Fach i liegt bei i mal Fachbreite
  // sample rate ist wieviele samples pro sekunde gemessen werden (hier 48.000)
  // fftSize - Wie viele Samples die FFT auf einmal anschaut
  // hier: 16384 Samples, also 16384 / 48.000 = 0,34 s Ton
  // Die höchste Frequenz, die man überhaupt messen kann: sampleRate / 2 = 24.000 Hz (braucht berg und tal)
  // Fachbreite: Die 24.000 Hz bis zur Nyquist-Frequenz, verteilt auf 8192 Fächer
  // also (sampleRate / 2) / (fftSize / 2) = sampleRate / fftSize
}

function frequenzZuAnteil(f) {
 return Math.log(f / MIN_FREQUENZ) / Math.log(MAX_FREQUENZ / MIN_FREQUENZ);
  // 0 bei MIN_FREQUENZ, 1 bei MAX_FREQUENZ
}

const SKALA = [50, 100, 200, 500, 1000, 2000, 5000, 10000]; // feste Frequenzen in Hz

function beschriftung(f) {
  return `${f.toLocaleString("de-DE")} Hz`;
}

function zeichneSkala() {
  ctx2.clearRect(0, 0, canvas2.width, canvas2.height); // durchsichtig, nicht übermalen
  ctx2.font = `${12 * dpr}px monospace`;
  ctx2.textBaseline = "bottom"; // Text steht auf der Linie, nicht durchgestrichen

  for (const f of SKALA) {
    const y = Math.round(canvas2.height * (1 - frequenzZuAnteil(f)));

    ctx2.fillStyle = "rgba(221, 221, 221, 0.3)"; // Linie schwach
    ctx2.fillRect(0, y, canvas2.width, 1);

    ctx2.fillStyle = "rgba(221, 221, 221, 0.9)"; // Zahl deutlich
    ctx2.fillText(beschriftung(f), 4 * dpr, y - 2 * dpr);
  }
}

let erstesFach = 1;
let letztesFach = 0;

function berechneGrenzen() {
  for (let i = 0; i < grenzen.length; i++) {
    grenzen[i] = canvas.height * (1 - anteile[i]);
    // 1 - Anteil, weil y nach unten wächst: tiefe Töne unten
  }
  const fachbreite = audio.sampleRate / analyser.fftSize;

  // erstes Fach, dessen Oberkante über MIN liegt:
  // (i + 1) * fachbreite > MIN ->  i > MIN / fachbreite - 1
  erstesFach = Math.max(1, Math.floor(MIN_FREQUENZ / fachbreite));

  // letztes Fach, dessen Unterkante noch unter MAX liegt:
  // i * fachbreite <= MAX  ->  i <= MAX / fachbreite
  letztesFach = Math.min(werte.length - 1, Math.floor(MAX_FREQUENZ / fachbreite));
}

function berechneAnteil() {
  for (let i = 0; i < anteile.length; i++) {
    anteile[i] = frequenzZuAnteil(frequenz(i)); // unabhängig von der Canvas-Größe
    // dadurch wird es nur beim Start einmal berechnet und dann erst wieder wenn sich was ändert
    // sonst müsste jedes mal logorithmus berechnet werden
  }
}

function zeichneSpektrogramm() {
  ctx.drawImage(canvas, -1, 0);
  // canvas auf sich selber versetzt um einen Pixel nach links malen
  for (let i = erstesFach; i <= letztesFach; i++) {
    // i = 0 wäre 0 Hz und würde keine zeichenbare frequenz liefern
    // werte[i] sagt die Lautstärke der jeweiligen Frequenz
    // da i so oft wie werte es gibt und werte die Anzahl der Bins (verschiedenen Frequenzen linear)
    // kann man i mal frequenz (Fachbreite)
    ctx.fillStyle = farben[werte[i]]; 
    // lautere Fächer werden heller; welcher Ton es ist, sagt der Index i
    const yOben  = grenzen[i + 1];
    const yUnten = grenzen[i];
    ctx.fillRect(
      canvas.width - 1, 
      yOben, // Oberkante: obere Grenze des Fachs (höhere Frequenz = weiter oben = kleineres y). 
      1,
      yUnten - yOben
    );
  }
}

function zeichneSpektrum() {
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = erstesFach; i <= letztesFach; i++) {
    ctx.fillStyle = farben[werte[i]]; 
    ctx.fillRect(
      anteile[i] * canvas.width, 
      canvas.height - werte[i],
      (anteile[i + 1] - anteile[i]) * canvas.width,
      werte[i] / 255 * canvas.height
    );
  }
}

function zeichne() {
  analyser.getByteFrequencyData(werte);
  // befüllt jetzt die array mit werten von 0 - 255
  // je nachdem wie laut
  // nur der Bereich minDecibels bis maxDecibels (Standard -100 bis -30 dB) wird auf 0–255 verteilt
  if (ansicht.value === "spektrogramm") zeichneSpektrogramm();
  else if (ansicht.value === "spektrum") zeichneSpektrum();
  laufId = requestAnimationFrame(zeichne); // die einzige Stelle mit rAF
}

// console.log(farben.length);
const beobachter = new ResizeObserver(passeGroesseAn);
beobachter.observe(canvas);

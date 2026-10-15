const spieler = hole("spieler");
const canvas = hole("bild");
const ctx = canvas.getContext("2d");

const MIN_FREQUENZ = 20;
const MAX_FREQUENZ = 20000; 
// Hörbereich des Menschen, ungefähr

let audio = null; // AudioContext, erst nach dem Klick
let analyser = null;
let werte = null; // Uint8Array für die Lautstärken

// immer sinnvolle Hilfsfunktion
//------------------------------------------------------
function hole(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Im HTML fehlt ein Element mit id="${id}"`);
  return element;
}

function passeGroesseAn() {
  // mindestens doppelt so fein rechnen, auch bei normalen Monitoren mit dpr 1
  const dpr = Math.max(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
}
//------------------------------------------------------

hole("datei").addEventListener("change", (event) => {
  const datei = event.target.files[0];
  if (!datei) return;
  spieler.src = URL.createObjectURL(datei); // die Datei bleibt auf deinem Rechner
});

hole("startBtn").addEventListener("click", () => {
  if (audio) return; // nur einmal aufbauen
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
  zeichne();
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
}

function frequenzZuY(f) {
 const t = Math.log(f / MIN_FREQUENZ) / Math.log(MAX_FREQUENZ / MIN_FREQUENZ);
  // 0 bei MIN_FREQUENZ, 1 bei MAX_FREQUENZ
  return canvas.height * (1 - t);
  // 1 - t, weil y im Canvas nach unten wächst, tiefe Töne sollen unten sein
}

function zeichne() {
  ctx.drawImage(canvas, -1, 0);
  // canvas auf sich selber versetzt um einen Pixel nach links malen
  analyser.getByteFrequencyData(werte);
  // befüllt jetzt die array mit werten von 0 - 255
  // je nachdem wie laut
  // nur der Bereich minDecibels bis maxDecibels (Standard -100 bis -30 dB) wird auf 0–255 verteilt
  for (let i = 1; i < werte.length; i++) {
    // i = 0 wäre 0 Hz und würde keine zeichenbare frequenz liefern
    // werte[i] sagt die Lautstärke der jeweiligen Frequenz
    // da i so oft wie werte es gibt und werte die Anzahl der Bins (verschiedenen Frequenzen linear)
    // kann man i mal frequenz (samplerate / wie viele frequenzen)
    if (frequenz(i) > MAX_FREQUENZ) break;
    if (frequenz(i + 1) < MIN_FREQUENZ) continue;
    ctx.fillStyle = farben[werte[i]]; 
    // lautere Fächer werden heller; welcher Ton es ist, sagt der Index i
    ctx.fillRect(
      canvas.width - 1, 
      frequenzZuY(frequenz(i + 1)), // Oberkante: obere Grenze des Fachs (höhere Frequenz = weiter oben = kleineres y). 
      1,
      frequenzZuY(frequenz(i)) - frequenzZuY(frequenz(i + 1))
    );
  }
  requestAnimationFrame(zeichne);
}

// console.log(farben.length);
const beobachter = new ResizeObserver(passeGroesseAn);
beobachter.observe(canvas);

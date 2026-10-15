const spieler = hole("spieler");
const canvas = hole("bild");
const ctx = canvas.getContext("2d");

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
  analyser.fftSize = 4096; // fft - Fast Fourier Transform
  // (wie viele Samples die FFT auf einmal anschaut, die Hälfte davon gibt es als Fächer)

  meineAudio.connect(analyser);
  analyser.connect(audio.destination);
  // oder einfach quelle.connect(analyser).connect(audio.destination);
  // connect gibt sein Ziel zurück (quelle.connect(analyser); -> gibt analyser zurück)

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

function zeichne() {
  ctx.drawImage(canvas, -1, 0);
  // canvas auf sich selber versetzt um einen Pixel nach links malen
  analyser.getByteFrequencyData(werte);
  // befüllt jetzt die array mit werten von 0 - 255
  // je nachdem wie laut
  // die eigentlichen dB levels sind in die 256 gleichen db-steps geteilt
  const fachHoehe = canvas.height / werte.length;
  for (let i = 0; i < werte.length; i++) {
    ctx.fillStyle = farben[werte[i]]; 
    // höhere werte werden heller (höhere Töne)
    ctx.fillRect(
      canvas.width - 1, 
      canvas.height - (i + 1) * fachHoehe, // im ersten Fach ist der tiefste Ton, also muss der nach unten
      1,
      fachHoehe
    );
  }
  requestAnimationFrame(zeichne);
}

// console.log(farben.length);
const beobachter = new ResizeObserver(passeGroesseAn);
beobachter.observe(canvas);

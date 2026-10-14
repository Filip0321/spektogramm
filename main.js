const spieler = hole("spieler");
const canvas = hole("bild");
const ctx = canvas.getContext("2d");

let audio = null;    // AudioContext, erst nach dem Klick
let analyser = null;
let werte = null;    // Uint8Array für die Lautstärken

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

function zeichne() {
  analyser.getByteFrequencyData(werte);
  // befüllt jetzt die Array mit werten von 0-255
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#DDDDDD";
  const breite = canvas.width / werte.length;
  for (let i = 0; i < werte.length; i++) {
    const hoehe = werte[i] / 255 * canvas.height;
    ctx.fillRect(
      Math.floor(i * breite),
      canvas.height - hoehe,
      Math.ceil(breite),
      hoehe,
    )
    // ctx.fillRect(x, y, breite, hoehe)
  }
  requestAnimationFrame(zeichne);
}

const beobachter = new ResizeObserver(passeGroesseAn); 
beobachter.observe(canvas);
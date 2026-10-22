import { macheDrehknopf, macheFader } from "./knopfRegler.js";

const spieler = hole("spieler");
const canvas = hole("bild");
const ctx = canvas.getContext("2d");

const canvas2 = hole("skala");
const ctx2 = canvas2.getContext("2d");

const ansicht = hole("ansicht");
const laufrichtung = hole("laufrichtung"); // schieben / umlaufen
const laufrichtungLabel = hole("laufrichtungLabel"); // beim Spektrum versteckt

const startBtn = hole("startBtn");

// Quelle: Datei oder Mikrofon / Audio-Interface (z. B. Zoom H6 über USB)
const quelle = hole("quelle");
const dateiKnopf = hole("dateiKnopf");
const eingang = hole("eingang"); // Auswahl des Eingangsgeräts
const eingangLabel = hole("eingangLabel");
const mithoeren = hole("mithoeren"); // Häkchen: Mikrofon auch auf die Lautsprecher
const mithoerenLabel = hole("mithoerenLabel");
const meldung = hole("meldung"); // Text für Fehler (Mikrofon verweigert …)

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
const pegel = hole("pegel"); // senkrechter Balken neben dem Fader
const pegelAnzeige = hole("pegelAnzeige");

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

// Quellen: beide hängen (abwechselnd) am "mischer", dem festen Anfang der Kette
let mischer = null; // GainNode mit Faktor 1: nur ein Sammelpunkt, an dem die Quelle steckt
let ausgang = null; // GainNode vor den Lautsprechern: 1 = an, 0 = stumm (Mikrofon ohne Mithören)
let dateiQuelle = null; // MediaElementSource vom <audio>, darf es pro Element nur EINMAL geben
let mikroQuelle = null; // MediaStreamSource vom Mikrofon
let mikroStrom = null; // der MediaStream selbst, zum Ausschalten

// Pegel: eigener kleiner Analyser direkt an der Quelle, der die Schwingung liest (nicht die FFT)
let pegelMesser = null;
let pegelDaten = null; // Float32Array, Werte von -1 bis 1
let pegelStand = 0; // was der Balken gerade zeigt, 0–1
let spitzeDb = -Infinity; // lautester Wert seit der letzten Zahl-Anzeige
let clipBis = 0; // bis wann (ms) "übersteuert" leuchtet
let textZeit = 0; // wann die Zahl zuletzt neu geschrieben wurde

// Umlaufen: wo die nächste Spalte (Spektrogramm) bzw. Zeile (Wasserfall) hinkommt
let schreibPos = 0;

// Nachschlagewerke: welche Fächer in welche Pixelspalte / Pixelzeile fallen
let vonFach = null; // Int32Array: erstes Fach jeder Pixelspalte (Spektrum)
let bisFach = null; // Int32Array: letztes Fach jeder Pixelspalte (Spektrum)
let vonFachZeile = null; // Int32Array: erstes Fach jeder Pixelzeile (Spektrogramm)
let bisFachZeile = null; // Int32Array: letztes Fach jeder Pixelzeile (Spektrogramm)

let spalte = null; // ImageData: die neue Spalte im Spektrogramm, 1 Pixel breit
let zeile = null; // ImageData: die neue Zeile im Wasserfall, 1 Pixel hoch

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
  schreibPos = 0; // Canvas ist jetzt leer, Umlaufen fängt vorne an
  zeichneSkala(); // Größe setzen leert den Canvas, also gleich neu zeichnen
  if (audio) berechneTabellen(); // Spalten- und Zeilentabellen hängen von der Größe ab
}
//------------------------------------------------------

hole("datei").addEventListener("change", (event) => {
  const datei = event.target.files[0];
  if (!datei) return;
  spieler.src = URL.createObjectURL(datei); // die Datei bleibt auf deinem Rechner
});

// async: in der Funktion darf "await" stehen, sie wartet dort, ohne die Seite anzuhalten
// (hier auf die Erlaubnis fürs Mikrofon, die dauert, bis man im Browser klickt)
startBtn.addEventListener("click", async () => {
  if (!audio) {
    baueAudioAuf(); // nur beim ersten Klick
    await setzeQuelle(); // gewählte Quelle anstecken (fragt beim Mikrofon nach Erlaubnis)
  }
  // manche Browser starten den Context "angehalten" (suspended), resume weckt ihn
  await audio.resume();
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

  mischer = audio.createGain(); // Sammelpunkt: Datei ODER Mikrofon steckt hier
  ausgang = audio.createGain(); // an/aus vor den Lautsprechern
  verstaerker = audio.createGain(); // Lautstärke der Ausgabe, Wert setzt setzeLautstaerke()
  analyser = audio.createAnalyser();
  analyser.fftSize = fftGroesse(); // fft - Fast Fourier Transform
  // (wie viele Samples die FFT auf einmal anschaut, die Hälfte davon gibt es als Fächer)
  analyser.smoothingTimeConstant = Number(glaettung.value);
  setzeAnalyserDb(Number(minDb.value), Number(maxDb.value)); // Schwarz- und Weißpunkt
  // je zwei gleiche Filter hintereinander: doppelt so steil (24 statt 12 dB pro Oktave)
  hochpaesse = [baueFilter("highpass"), baueFilter("highpass")];
  tiefpaesse = [baueFilter("lowpass"), baueFilter("lowpass")];

  // Quelle -> Mischer -> 2 Hochpässe -> 2 Tiefpässe -> Analyser -> Verstärker -> Ausgang -> Lautsprecher
  // Filter VOR dem Analyser: man sieht nur, was man hört
  // connect gibt sein Ziel zurück, deshalb lässt sich die Kette aneinanderhängen
  mischer
    .connect(hochpaesse[0])
    .connect(hochpaesse[1])
    .connect(tiefpaesse[0])
    .connect(tiefpaesse[1])
    .connect(analyser)
    .connect(verstaerker)
    .connect(ausgang)
    .connect(audio.destination);
  // Die Kette bleibt auch beim Mikrofon bis zu den Lautsprechern verbunden, nur mit
  // ausgang = 0. So rechnet der Browser sicher alles durch (Knoten ohne Weg zum
  // Ausgang dürfen manche Browser schlafen legen).

  // Pegel direkt am Mischer: zeigt, wie laut die Quelle ankommt, egal welche Filter
  // und welche Lautstärke eingestellt sind (wichtig, um Übersteuern am Mikro zu sehen)
  pegelMesser = audio.createAnalyser();
  pegelMesser.fftSize = 2048; // ≈ 43 ms Schwingung bei 48 kHz, reicht für den Pegel
  pegelDaten = new Float32Array(pegelMesser.fftSize);
  mischer.connect(pegelMesser);

  // Das <audio>-Element hört ab jetzt nur noch über den Graphen auf die Lautsprecher
  dateiQuelle = audio.createMediaElementSource(spieler);

  setzeLautstaerke(); // Regler-Wert auf den Verstärker übernehmen
  setzeFilter(); // gewähltes Band auf die Filter übernehmen
  richteFaecherEin();
}
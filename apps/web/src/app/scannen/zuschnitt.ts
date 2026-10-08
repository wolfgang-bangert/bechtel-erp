/**
 * Automatisches Zuschneiden fürs Scannen: Blatt im Foto finden (vier Ecken) und perspektivisch
 * entzerren - reine Rechenlogik ohne DOM, damit sie unabhängig vom Browser testbar bleibt.
 *
 * Erkennung: Foto auf ~400 px verkleinern, Graustufen + Weichzeichnen, Schwellwert nach Otsu
 * (Papier ist heller als der Untergrund), größte zusammenhängende helle Fläche = Blatt.
 * Ecken = Extrempunkte dieser Fläche entlang der Diagonalen (x+y bzw. x−y). Das trägt bei
 * Blättern, die bis etwa 30° schräg liegen - für stärker verdrehte oder unklare Fälle gibt es den
 * Ecken-Editor bzw. "ganzes Bild".
 */

export type Punkt = { x: number; y: number };
/** Ecken in Bild-Anteilen (0…1): oben links, oben rechts, unten rechts, unten links */
export type Ecken = [Punkt, Punkt, Punkt, Punkt];

type Pixel = { data: Uint8ClampedArray; width: number; height: number };

export const GANZES_BILD: Ecken = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** Schwellwert nach Otsu: trennt das Histogramm in zwei Klassen mit maximaler Zwischenvarianz. */
function otsu(hist: Uint32Array, n: number): number {
  let summe = 0;
  for (let i = 0; i < 256; i++) summe += i * hist[i];
  let sB = 0;
  let wB = 0;
  let best = 0;
  let schwelle = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sB += t * hist[t];
    const mB = sB / wB;
    const mF = (summe - sB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) {
      best = v;
      schwelle = t;
    }
  }
  return schwelle;
}

/** Fläche eines Vierecks (Gaußsche Trapezformel), Punkte in Reihenfolge. */
function flaeche(p: Punkt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i].x * q.y - q.x * p[i].y;
  }
  return Math.abs(a) / 2;
}

/** Konvex und ohne Überschneidung? (alle Kreuzprodukte mit gleichem Vorzeichen) */
function konvex(p: Punkt[]): boolean {
  let vz = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i];
    const b = p[(i + 1) % 4];
    const c = p[(i + 2) % 4];
    const k = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(k) < 1e-9) return false;
    const s = Math.sign(k);
    if (vz && s !== vz) return false;
    vz = s;
  }
  return true;
}

/**
 * Blatt im (verkleinerten) Bild suchen. Liefert die Ecken in Anteilen oder null, wenn kein
 * eindeutiges Blatt zu sehen ist (dann bleibt das ganze Bild).
 */
export function eckenErkennen(bild: Pixel): Ecken | null {
  const { data, width: w, height: h } = bild;
  const n = w * h;
  if (n < 400) return null;

  // Graustufen
  const grau = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) grau[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;

  // 5×5-Kastenfilter (zweimal 1D) gegen Schrift/Rauschen
  const r = 2;
  const tmp = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += grau[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / (2 * r + 1);
      s += grau[y * w + Math.min(w - 1, x + r + 1)] - grau[y * w + Math.max(0, x - r)];
    }
  }
  const weich = new Uint8ClampedArray(n);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      weich[y * w + x] = s / (2 * r + 1);
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }

  const hist = new Uint32Array(256);
  for (let j = 0; j < n; j++) hist[weich[j]]++;
  const t = otsu(hist, n);

  // größte zusammenhängende helle Fläche (4er-Nachbarschaft)
  const marke = new Int32Array(n).fill(-1);
  const stapel = new Int32Array(n);
  let besteId = -1;
  let besteGroesse = 0;
  let id = 0;
  for (let start = 0; start < n; start++) {
    if (marke[start] !== -1 || weich[start] <= t) continue;
    let sp = 0;
    stapel[sp++] = start;
    marke[start] = id;
    let groesse = 0;
    while (sp) {
      const p = stapel[--sp];
      groesse++;
      const x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of nb) {
        if (q < 0 || q >= n || marke[q] !== -1 || weich[q] <= t) continue;
        marke[q] = id;
        stapel[sp++] = q;
      }
    }
    if (groesse > besteGroesse) {
      besteGroesse = groesse;
      besteId = id;
    }
    id++;
  }
  // Blatt füllt fast alles (schon formatfüllend fotografiert) oder ist zu klein/unklar
  if (besteId < 0 || besteGroesse > 0.97 * n || besteGroesse < 0.15 * n) return null;

  // Ecken über die Diagonal-Extrema der Fläche
  let tl = { x: 0, y: 0, v: Infinity };
  let br = { x: 0, y: 0, v: -Infinity };
  let randPixel = 0;
  let tr = { x: 0, y: 0, v: -Infinity };
  let bl = { x: 0, y: 0, v: Infinity };
  for (let p = 0; p < n; p++) {
    if (marke[p] !== besteId) continue;
    const x = p % w;
    const y = (p - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) randPixel++;
    const s = x + y;
    const d = x - y;
    if (s < tl.v) tl = { x, y, v: s };
    if (s > br.v) br = { x, y, v: s };
    if (d > tr.v) tr = { x, y, v: d };
    if (d < bl.v) bl = { x, y, v: d };
  }
  // Klebt die Fläche großflächig am Bildrand, ist es eher Wand/Tischplatte als ein Blatt
  // (ein Blatt, das nur etwas über den Rand ragt, bleibt darunter)
  if (randPixel > 0.3 * 2 * (w + h)) return null;

  const px: Punkt[] = [tl, tr, br, bl].map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
  if (!konvex(px)) return null;
  const fq = flaeche(px);
  if (fq < 0.15 * n) return null;
  // Fläche und Viereck müssen sich weitgehend decken (Schnitt/Vereinigung ≥ 0,9) - sonst ist es
  // kein Blatt, sondern z. B. eine L-förmige helle Fläche
  let innen = 0;
  for (let p = 0; p < n; p++) {
    if (marke[p] !== besteId) continue;
    const x = (p % w) + 0.5;
    const y = Math.floor(p / w) + 0.5;
    let drin = true;
    for (let i = 0; i < 4 && drin; i++) {
      const a = px[i];
      const b = px[(i + 1) % 4];
      if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < -1) drin = false;
    }
    if (drin) innen++;
  }
  if (innen / (fq + besteGroesse - innen) < 0.9) return null;

  // 0,5 % nach innen ziehen: der Papierrand wirft oft einen schmalen Schatten
  const mx = px.reduce((s, p) => s + p.x, 0) / 4;
  const my = px.reduce((s, p) => s + p.y, 0) / 4;
  return px.map((p) => ({
    x: Math.min(1, Math.max(0, (p.x + (mx - p.x) * 0.005) / w)),
    y: Math.min(1, Math.max(0, (p.y + (my - p.y) * 0.005) / h)),
  })) as Ecken;
}

export const istGanzesBild = (e: Ecken | null) =>
  !e || e.every((p, i) => Math.abs(p.x - GANZES_BILD[i].x) < 1e-3 && Math.abs(p.y - GANZES_BILD[i].y) < 1e-3);

const abstand = (a: Punkt, b: Punkt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Zielgröße der entzerrten Seite (Pixel), aus den Kantenlängen des Vierecks, höchstens maxKante. */
export function zielGroesse(ecken: Ecken, w: number, h: number, maxKante: number): { w: number; h: number } {
  const p = ecken.map((e) => ({ x: e.x * w, y: e.y * h }));
  let zw = Math.max(abstand(p[0], p[1]), abstand(p[3], p[2]));
  let zh = Math.max(abstand(p[0], p[3]), abstand(p[1], p[2]));
  const f = Math.min(1, maxKante / Math.max(zw, zh));
  zw = Math.max(1, Math.round(zw * f));
  zh = Math.max(1, Math.round(zh * f));
  return { w: zw, h: zh };
}

/**
 * Perspektivische Entzerrung: Einheitsquadrat → Viereck (Heckbert), dann für jedes Zielpixel
 * bilinear aus dem Quellbild lesen.
 */
export function entzerren(quelle: Pixel, ecken: Ecken, ziel: { w: number; h: number }): Uint8ClampedArray<ArrayBuffer> {
  const { data: src, width: sw, height: sh } = quelle;
  const [p0, p1, p2, p3] = ecken.map((e) => ({ x: e.x * (sw - 1), y: e.y * (sh - 1) }));
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0;
  let hh = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const nenner = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / nenner;
    hh = (dx1 * dy3 - dx3 * dy1) / nenner;
  }
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + hh * p3.x;
  const c = p0.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + hh * p3.y;
  const f = p0.y;

  const { w: zw, h: zh } = ziel;
  const out = new Uint8ClampedArray(new ArrayBuffer(zw * zh * 4));
  for (let y = 0; y < zh; y++) {
    const v = zh > 1 ? y / (zh - 1) : 0;
    for (let x = 0; x < zw; x++) {
      const u = zw > 1 ? x / (zw - 1) : 0;
      const z = g * u + hh * v + 1;
      let sx = (a * u + b * v + c) / z;
      let sy = (d * u + e * v + f) / z;
      sx = Math.min(sw - 1, Math.max(0, sx));
      sy = Math.min(sh - 1, Math.max(0, sy));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const o = (y * zw + x) * 4;
      for (let k = 0; k < 3; k++) {
        const oben = src[i00 + k] + (src[i10 + k] - src[i00 + k]) * fx;
        const unten = src[i01 + k] + (src[i11 + k] - src[i01 + k]) * fx;
        out[o + k] = oben + (unten - oben) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

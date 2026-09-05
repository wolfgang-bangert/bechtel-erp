"""
Preisliste Schwabenprint (Excel) -> JSON-Zeilen auf stdout.

Zwei Sheet-Familien:
  matrix    Wochen-/Wand-/Tisch-/Wochentischkalender
            Kopf: 3 Dim-Zeilen (Format / Blatt[/Farbigkeit] / Sorte) ueber der
            Zeile mit "Auflage" bzw. "Kombi" in Spalte A, die zugleich die
            kombinierten Spalten-Keys traegt. Danach je Zeile: Auflage | Preise.
  longform  Speisekarte
            Kopfzeile mit NUMMER | Format | GROESSE | FARBE | ... | 10 | 20 | ...
            je Datenzeile ein Artikel, Preise ueber die Auflage-Spalten.

Spiralbooklet: eigener Komponenten-Aufbau (parse_spiralbooklet).
"""
import json
import re
import sys

import openpyxl

MATRIX = {
    "Preisliste Wochenkalender": {"kategorie": "Wochenkalender", "gruppe": "WOK"},
    "Preisliste Wandkalender": {"kategorie": "Wandkalender", "gruppe": "DWK"},
    "Preisliste Tischkalender": {"kategorie": "Tischkalender", "gruppe": "DKL"},
    "Preisliste Wochentischkalender": {"kategorie": "Wochentischkalender", "gruppe": "DK0"},
    "Preisliste Blöcke 4-4 farbig": {"kategorie": "Blöcke", "gruppe": "PBS"},
    "Preisliste Blöcke 1-1 farbig": {"kategorie": "Blöcke", "gruppe": "PBS"},
}
LONGFORM = {
    "Preisliste Speisekarte": {"kategorie": "Speisekarte", "gruppe": "DSK"},
}

# Spiralbooklet: Komponenten-Aufbau + Auflage-Staffel (4 Anker je Spalte).
# Spaltenreihenfolge B..P wie im Sheet.
SPIRAL_COLS = [
    ("inhalt_135", "8s"),
    ("inhalt_135", "per2"),
    ("inhalt_300", "8s"),
    ("inhalt_300", "per2"),
    ("inhalt_offset", "8s"),
    ("inhalt_offset", "per2"),
    ("umschlag_170", "x"),
    ("umschlag_250", "x"),
    ("umschlag_300", "x"),
    ("cello", "8s"),
    ("cello", "per2"),
    ("deckblatt", "x"),
    ("schlussblatt_folie", "x"),
    ("karton_grau", "x"),
    ("karton_weiss", "x"),
]
SPIRAL_ANCHORS = {"10": "b10", "weitere 10": "w10", "500": "b500", "weitere 100": "w100"}


def _spiral_fmt(text):
    t = text.upper()
    if "DINLANG" in t or "105 X 210" in t or "105X210" in t:
        return "DL"
    for base in ("A4", "A5", "A6"):
        if base in t:
            return f"{base}-Quadrat" if "QUADRAT" in t else base
    return None


def parse_spiralbooklet(ws, kategorie="Spiralbooklet", gruppe="DSP"):
    rows = list(ws.iter_rows(values_only=True))
    out = []
    fmt = None
    for r in rows:
        c0 = s(r[0]) if r else ""
        joined = " ".join(s(x) for x in (r or []))
        f = _spiral_fmt(joined)
        if f:
            fmt = f
        anchor = SPIRAL_ANCHORS.get(c0.lower())
        if anchor and fmt:
            for idx, (colkey, sub) in enumerate(SPIRAL_COLS):
                v = num(r[idx + 1]) if idx + 1 < len(r) else None
                if v is None:
                    continue
                out.append(
                    {
                        "kategorie": kategorie,
                        "produktgruppe": gruppe,
                        "format": fmt,
                        "spalten_key": colkey,
                        "sub": sub,
                        "anchor": anchor,
                        "wert": v,
                    }
                )
    return out


def s(v):
    return "" if v is None else str(v).strip()


def as_int(v):
    try:
        return int(float(str(v).strip()))
    except (TypeError, ValueError):
        return None


def num(v):
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return None


def parse_matrix(ws, cfg):
    rows = list(ws.iter_rows(values_only=True))
    key_row = None
    for i, r in enumerate(rows):
        if not r or s(r[0]).lower() not in ("auflage", "kombi"):
            continue
        # die Zeile mit den kombinierten Spalten-Keys hat Buchstaben+Ziffern
        # (z.B. "A554170") – nicht nur "170". Wochentischkalender hat beide Zeilen.
        if any(re.search(r"[A-Za-z].*\d", s(x)) for x in r[1:6]):
            key_row = i
            break
        if key_row is None:
            key_row = i  # Fallback
    if key_row is None or key_row < 3:
        return []
    fmt_r, blatt_r, sorte_r = rows[key_row - 3], rows[key_row - 2], rows[key_row - 1]
    keys = rows[key_row]

    cols = []
    for c in range(1, len(keys)):
        key = s(keys[c])
        if not key:
            continue
        blatt_cell = s(blatt_r[c]) if c < len(blatt_r) else ""
        # "13"  |  "13 4/0"  |  "50 4/ 4"  |  "50 0/ 0"
        bm = re.match(r"\s*(\d+)", blatt_cell)
        blatt = as_int(bm.group(1)) if bm else None
        fm = re.search(r"(\d+)\s*/\s*(\d+)", blatt_cell)
        farb = f"{fm.group(1)}/{fm.group(2)}" if fm else ""
        cols.append(
            {
                "col": c,
                "spalten_key": key,
                "format": s(fmt_r[c]) if c < len(fmt_r) else "",
                "blatt": blatt,
                "farbigkeit": farb,
                "sorte": s(sorte_r[c]) if c < len(sorte_r) else "",
            }
        )

    out = []
    for r in rows[key_row + 1 :]:
        aufl = as_int(r[0]) if r else None
        if aufl is None:
            continue
        for co in cols:
            p = num(r[co["col"]]) if co["col"] < len(r) else None
            if p is None:
                continue
            out.append(
                {
                    "kategorie": cfg["kategorie"],
                    "produktgruppe": cfg["gruppe"],
                    "format": co["format"] or None,
                    "blatt": co["blatt"],
                    "sorte": co["sorte"] or None,
                    "farbigkeit": co["farbigkeit"] or None,
                    "spalten_key": co["spalten_key"],
                    "auflage": aufl,
                    "preis_netto": p,
                }
            )
    return out


def parse_longform(ws, cfg):
    rows = list(ws.iter_rows(values_only=True))
    hdr = None
    for i, r in enumerate(rows):
        if r and any(s(x).upper() == "NUMMER" for x in r):
            hdr = i
            break
    if hdr is None:
        return []
    head = rows[hdr]
    idx = {s(x).upper(): j for j, x in enumerate(head) if s(x)}
    col_nr = idx.get("NUMMER")
    col_fmt = idx.get("FORMAT")
    col_gr = idx.get("GROESSE") or idx.get("GRÖSSE")
    col_farbe = idx.get("FARBE")
    # Auflage-Spalten: numerische Header rechts der Stammspalten
    aufl_cols = [(j, as_int(x)) for j, x in enumerate(head) if as_int(x) is not None and j > (col_farbe or 0)]
    # "mit Cello" steht als verbundene Zelle nur in der ersten Spalte des Bereichs
    cello_row = rows[hdr - 1] if hdr > 0 else ()
    cello_by_col = {}
    cur = False
    for j in range(len(head)):
        cell = (s(cello_row[j]) if j < len(cello_row) else "").lower()
        if "cello" in cell:
            cur = "ohne" not in cell  # "mit Cello" → True, "ohne Cello" → False
        cello_by_col[j] = cur

    out = []
    for r in rows[hdr + 1 :]:
        if not r or col_nr is None or not s(r[col_nr]):
            continue
        nr = s(r[col_nr])
        fmt = s(r[col_fmt]) if col_fmt is not None and col_fmt < len(r) else ""
        gr = s(r[col_gr]) if col_gr is not None and col_gr < len(r) else ""
        farbe = s(r[col_farbe]) if col_farbe is not None and col_farbe < len(r) else ""
        for j, aufl in aufl_cols:
            p = num(r[j]) if j < len(r) else None
            if p is None:
                continue
            cello = cello_by_col.get(j, False)
            out.append(
                {
                    "kategorie": cfg["kategorie"],
                    "produktgruppe": cfg["gruppe"],
                    "format": fmt or None,
                    "blatt": as_int(farbe),  # Seitenzahl der Karte
                    "sorte": (gr or None),
                    "farbigkeit": "cello" if cello else "ohne",
                    "spalten_key": f"{nr}_{gr}_{farbe}_{'C' if cello else 'nc'}",
                    "auflage": aufl,
                    "preis_netto": p,
                }
            )
    return out


def parse_multiloft(path):
    """Multiloft.xlsx / Tabelle2: je Farbigkeit (4/4, 4/0) eine Auflage->Gesamt-Staffel."""
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["Tabelle2"] if "Tabelle2" in wb.sheetnames else wb[wb.sheetnames[0]]
    out = []
    farb = None
    for r in ws.iter_rows(values_only=True):
        c0 = s(r[0]) if r else ""
        low = c0.lower()
        if "multiloft" in low:
            farb = "4/0" if "4/0" in low else "4/4"
            continue
        a = as_int(r[0]) if r else None
        p = num(r[1]) if r and len(r) > 1 else None
        if a is None or p is None or farb is None:
            continue
        out.append(
            {
                "kategorie": "Multiloft",
                "produktgruppe": "PVF",
                "format": None,
                "blatt": None,
                "sorte": None,
                "farbigkeit": farb,
                "spalten_key": "gesamt",
                "auflage": a,
                "preis_netto": p,
            }
        )
    return out


def main():
    path = sys.argv[1]
    multiloft_path = sys.argv[2] if len(sys.argv) > 2 else None
    wb = openpyxl.load_workbook(path, data_only=True)
    rows = []
    seen = {}
    spiral = []
    for sheet in wb.sheetnames:
        if sheet in MATRIX:
            r = parse_matrix(wb[sheet], MATRIX[sheet])
        elif sheet in LONGFORM:
            r = parse_longform(wb[sheet], LONGFORM[sheet])
        elif sheet == "Preisliste Spiralbooklet":
            r = parse_spiralbooklet(wb[sheet])
            spiral = r
            seen[sheet] = len(r)
            continue
        else:
            continue
        seen[sheet] = len(r)
        rows.extend(r)
    if multiloft_path:
        try:
            ml = parse_multiloft(multiloft_path)
            seen["Multiloft.xlsx"] = len(ml)
            rows.extend(ml)
        except Exception as exc:  # noqa: BLE001
            seen["Multiloft.xlsx"] = f"Fehler: {exc}"
    json.dump({"rows": rows, "spiral": spiral, "sheets": seen}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()

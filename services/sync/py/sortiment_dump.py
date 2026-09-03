#!/usr/bin/env python3
"""Sortiment_Bechtel_Gesamt.xlsx → JSON auf stdout.
Eine Zeile je Excel-Zeile mit den Baum-Spalten (H4/H5/H6/NodeType/Name)."""
import json
import sys

import openpyxl


def col_idx(header):
    """Spaltenname → Index, toleriert fehlende H3-Spalte."""
    idx = {}
    for i, h in enumerate(header):
        if not h:
            continue
        h = str(h).strip().lower()
        if h.startswith("h4"):
            idx["h4"] = i
        elif h.startswith("h5"):
            idx["h5"] = i
        elif h.startswith("h6"):
            idx["h6"] = i
        elif h.startswith("nodetype"):
            idx["node"] = i
        elif h.startswith("_name"):
            idx["name"] = i
    return idx


def main():
    path = sys.argv[1]
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    out = []
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue
        idx = col_idx(rows[0])
        if "h5" not in idx or "name" not in idx:
            continue
        for r in rows[1:]:
            def g(k):
                i = idx.get(k)
                if i is None or i >= len(r) or r[i] is None:
                    return None
                v = str(r[i]).strip()
                return v or None

            h4, h5, h6, node, name = g("h4"), g("h5"), g("h6"), g("node"), g("name")
            if not any([h4, h5, h6, name]):
                continue
            out.append(
                {"sheet": ws.title, "h4": h4, "h5": h5, "h6": h6, "node": node, "name": name}
            )
    wb.close()
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Render the bikepark report from data + template.

Source of truth is reports/data/bikeparks.json (the researched content).
This script is pure presentation: it assembles the self-contained index.html
(overview table, collapsible park sections, and the Google Maps pin array)
from that JSON + the durable template. Re-run it after any UI/template change
WITHOUT re-running the research.

    python3 build_report.py            # build with today's date
    python3 build_report.py --date "10 June 2026"
"""
import argparse
import datetime
import html as htmllib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
DATA = ROOT / "data" / "bikeparks.json"
TEMPLATE = pathlib.Path("/Users/dirk.daumann/.claude/agents/reporttemplate.html")
KEY_FILE = pathlib.Path("/Users/dirk.daumann/.claude/agents/.google-maps-key")
OUT_INDEX = ROOT / "index.html"

# Overview columns after the Park column, in display order:
# (cell key in data, sort key in data["sort"] or None => sort by text content)
OV_COLS = [
    ("location", None),
    ("drive", "drive_km"),
    ("lift", None),
    ("gravity_card", "gravity_card"),
    ("difficulty", "difficulty"),
    ("vertical", "vertical_m"),
    ("skills", "skills"),
    ("rating", "rating"),
    ("best_for", None),
]


def overview_rows(parks):
    out = []
    for p in parks:
        ov = p["overview"]
        pid = p["id"]
        tds = [f'<td><a href="#p{pid}">{ov["name"]}</a></td>']
        for key, sortkey in OV_COLS:
            cell = ov["cells"][key]
            if sortkey is None:
                tds.append(f"<td>{cell}</td>")
            else:
                val = ov["sort"].get(sortkey)
                ds = "" if val is None else htmllib.escape(str(val), quote=True)
                tds.append(f'<td data-sort="{ds}">{cell}</td>')
        out.append("          <tr>\n            " + "\n            ".join(tds) + "\n          </tr>")
    return "\n".join(out)


def park_sections(parks):
    blocks = []
    for p in parks:
        pid = p["id"]
        s = [f'<details class="park" id="p{pid}">']
        s.append(f'  <summary><span class="pk-title">{p["name"]}</span>')
        s.append(f'    <span class="pk-region">{p["region_label"]}</span></summary>')
        for g in p["groups"]:
            s.append('  <details class="grp" open>')
            s.append(f'    <summary><h4>{g["title"]}</h4></summary>')
            s.append('    <dl class="kv">')
            for row in g["rows"]:
                s.append(f'      <dt>{row["label"]}</dt><dd>{row["html"]}</dd>')
            s.append("    </dl>")
            s.append("  </details>")
        s.append('  <details class="sources">')
        s.append("    <summary>Sources</summary>")
        s.append("    <ol>")
        for src in p["sources"]:
            s.append(
                f'      <li id="p{pid}-s{src["n"]}">'
                f'<a href="{src["url"]}" target="_blank" rel="noopener">{src["title"]}</a></li>'
            )
        s.append("    </ol>")
        s.append("  </details>")
        s.append("</details>")
        blocks.append("\n".join(s))
    return "\n\n".join(blocks)


def map_pins(parks):
    items = []
    for p in parks:
        c = p.get("coords")
        if not c:
            continue
        name = p.get("pin_name") or p["name"]
        region = htmllib.unescape(p["region_label"])
        items.append(
            "{name:%s, region:%s, lat:%s, lng:%s}"
            % (
                json.dumps(name, ensure_ascii=False),
                json.dumps(region, ensure_ascii=False),
                json.dumps(c["lat"]),
                json.dumps(c["lng"]),
            )
        )
    return ",\n    ".join(items)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None, help='Report date label, e.g. "10 June 2026" (default: today)')
    args = ap.parse_args()

    doc = json.loads(DATA.read_text())
    parks = sorted(doc["parks"], key=lambda p: p["id"])
    n = len(parks)

    today = datetime.date.today()
    date_str = args.date or f"{today.day} {today:%B} {today.year}"

    tpl = TEMPLATE.read_text()
    key = KEY_FILE.read_text().strip() if KEY_FILE.exists() else ""

    pins = map_pins(parks)
    out = tpl
    out = out.replace("{{PARK_COUNT}}", str(n))
    out = out.replace("{{GENERATED_DATE}}", date_str)
    out = out.replace("{{GOOGLE_MAPS_API_KEY}}", key)
    out = out.replace("<!-- OVERVIEW_ROWS -->", overview_rows(parks))
    out = out.replace("<!-- PARK_SECTIONS -->", park_sections(parks))
    out = out.replace("/* MAP_PINS */", pins)

    # ---- validations ----
    assert "{{" not in out, "leftover {{ }} placeholder"
    for marker in ("<!-- OVERVIEW_ROWS -->", "<!-- PARK_SECTIONS -->", "/* MAP_PINS */"):
        assert marker not in out, f"unfilled marker: {marker}"
    ids = sorted(int(x) for x in re.findall(r'class="park"\s+id="p(\d+)"', out))
    assert ids == list(range(1, n + 1)), f"park ids not contiguous: {ids}"
    nav = sorted({int(x) for x in re.findall(r'href="#p(\d+)"', out)})
    assert set(nav).issubset(set(ids)), f"dangling nav links: {set(nav) - set(ids)}"
    assert "}\n    {name:" not in pins and "}{name:" not in pins, "pin objects not comma-separated"
    pin_count = pins.count("{name:")
    key_hits = out.count("key=" + key) if key else 0

    OUT_INDEX.write_text(out)
    dated = ROOT / f"bikepark-report-{today.isoformat()}.html"
    dated.write_text(out)

    print(f"BUILD OK — {n} parks | pins: {pin_count} | nav links: {len(nav)} | key occurrences: {key_hits}")
    print(f"date label: {date_str}")
    print(f"wrote {OUT_INDEX} ({len(out)} bytes) and {dated.name}")


if __name__ == "__main__":
    main()

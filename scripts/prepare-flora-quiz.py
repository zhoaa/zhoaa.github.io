"""Build the plant quiz from a single saved FSUS full report.

Save the supplied species-noimages.php report as HTML with omitspnov=on,
omitsspvar=on, omithybrid=on and maximage=99999999999999999999999999999999.
Usage: python3 scripts/prepare-flora-quiz.py /path/to/saved-report.html
No individual species pages are requested.
"""
import argparse
from collections import Counter
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = (
    "https://fsus.ncbg.unc.edu/species-noimages.php?family=&minrank=1&region=-1"
    "&omitspnov=on&omitsspvar=on&omithybrid=on"
    "&maximage=99999999999999999999999999999999"
)


class Checklist(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_table = False
        self.cell = None
        self.cells = []
        self.lsid = ""
        self.rows = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "table" and attrs.get("id") == "maintable":
            self.in_table = True
        if not self.in_table:
            return
        if tag == "tr":
            self.cells = []
            self.lsid = ""
        elif tag == "td":
            self.cell = []
        elif tag == "a":
            self.lsid = parse_qs(urlparse(attrs.get("href", "")).query).get("lsid", [""])[0]

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if not self.in_table:
            return
        if tag == "td":
            self.cells.append("".join(self.cell).strip())
            self.cell = None
        elif tag == "tr" and self.cells:
            assert len(self.cells) == 4 and self.lsid, self.cells
            family, scientific, region, status = self.cells
            self.rows.append([self.lsid, scientific, family, region, status])
        elif tag == "table":
            self.in_table = False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    args = parser.parse_args()
    source = args.report.read_text(encoding="utf-8")
    expected = int(re.search(r"(\d+) taxa have no more", source)[1])
    for flag in ("omitspnov", "omitsspvar", "omithybrid"):
        assert f"elements['{flag}'].checked = '1'" in source, f"Report must have {flag} checked"
    assert "elements['maximage'].value = '99999999999999999999999999999999'" in source
    checklist = Checklist()
    checklist.feed(source)
    rows = checklist.rows
    assert len(rows) == expected and len({row[0] for row in rows}) == expected
    assert all(name and family for _, name, family, _, _ in rows)
    assert not any(re.search(r"\b(?:ssp\.|subsp\.|var\.|sp\. nov\.)|×", name) for _, name, _, _, _ in rows)
    output = ROOT / "games" / "southeastern-plants" / "fsus-2026.js"
    metadata = {
        "title": "Flora of the Southeastern United States",
        "edition": "2026",
        "source": SOURCE_URL,
        "count": expected,
        "columns": ["lsid", "scientific", "family", "region", "status"],
        "plants": rows,
    }
    output.write_text(
        "// FSUS 2026, A.S. Weakley & Southeastern Flora Team.\n"
        "// Prepared from one saved full report; see scripts/prepare-flora-quiz.py.\n"
        "const floraChecklist = " + json.dumps(metadata, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"{len(rows)} plants, {len(Counter(row[2] for row in rows))} families")
    print("Nonempty region fields:", sum(bool(row[3]) for row in rows))


if __name__ == "__main__":
    main()

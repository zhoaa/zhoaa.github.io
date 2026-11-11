"""Build the plant quiz from a saved FSUS report, rolling lower ranks into species.

Save the supplied species-noimages.php report as HTML with omitspnov=on,
omithybrid=on and maximage=99999999999999999999999999999999.
Usage: python3 scripts/prepare-flora-quiz.py /path/to/saved-report.html
Leave "Omit subspecies and varieties" UNCHECKED.
For an older species-only report, supply --infraspecific-report with a saved
report containing lower-rank taxa. No individual species pages are requested.
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
    "&omitspnov=on&omithybrid=on"
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


def read_report(path):
    source = path.read_text(encoding="utf-8")
    expected = int(re.search(r"(\d+) taxa have no more", source)[1])
    checklist = Checklist()
    checklist.feed(source)
    assert len(checklist.rows) == expected
    assert len({row[0] for row in checklist.rows}) == expected
    assert all(name and family for _, name, family, _, _ in checklist.rows)
    return source, checklist.rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("--infraspecific-report", type=Path)
    args = parser.parse_args()
    source, source_rows = read_report(args.report)
    for flag in ("omitspnov", "omithybrid"):
        assert f"elements['{flag}'].checked = '1'" in source, f"Report must have {flag} checked"
    assert "elements['maximage'].value = '99999999999999999999999999999999'" in source
    excludes_lower_ranks = "elements['omitsspvar'].checked = '1'" in source
    assert not excludes_lower_ranks or args.infraspecific_report, (
        "Include subspecies and varieties in the report so their parent species are retained."
    )
    source_reports = [{"file": args.report.name, "taxa": len(source_rows)}]
    if args.infraspecific_report:
        supplement_source, supplement = read_report(args.infraspecific_report)
        assert "elements['omitsspvar'].checked = '1'" not in supplement_source
        # Only restore parent species from this report. Ordinary species come from
        # the primary report, which has no photo-count cutoff.
        source_rows += [
            row for row in supplement
            if re.search(r"\b(?:ssp|subsp|var)\.", row[1])
        ]
        source_reports.append({"file": args.infraspecific_report.name, "taxa": len(supplement)})

    output = ROOT / "games" / "southeastern-plants" / "fsus-2026.js"
    existing = {}
    if output.exists():
        previous = json.loads(output.read_text().split("const floraChecklist = ", 1)[1].strip().removesuffix(";"))
        existing = {row[1]: row[0] for row in previous["plants"]}

    species = {}
    for identifier, name, family, region, status in source_rows:
        if re.search(r"\bsp\.\s*nov\.|\bspecies\s+\d|×|\s[xX]\s", name):
            continue
        words = name.split()
        assert len(words) >= 2, name
        scientific = " ".join(words[:2])
        assert re.fullmatch(r"[A-Z][a-z-]+ [a-z-]+", scientific), scientific
        is_lower_rank = len(words) > 2
        if is_lower_rank:
            assert words[2] in ("ssp.", "subsp.", "var."), name
            identifier = f"urn:fsus:quiz-species:{words[0]}:{words[1]}"
            region, status = "", ""
        identifier = existing.get(scientific, identifier)
        if scientific in species:
            assert species[scientific][2] == family, scientific
            continue
        species[scientific] = [identifier, scientific, family, region, status]

    rows = [species[name] for name in sorted(species)]
    assert len({row[0] for row in rows}) == len(rows)
    metadata = {
        "title": "Flora of the Southeastern United States",
        "edition": "2026",
        "source": SOURCE_URL,
        "source_reports": source_reports,
        "count": len(rows),
        "columns": ["lsid", "scientific", "family", "region", "status"],
        "plants": rows,
    }
    output.write_text(
        "// FSUS 2026, A.S. Weakley & Southeastern Flora Team.\n"
        "// Lower ranks rolled up to species; see scripts/prepare-flora-quiz.py.\n"
        "const floraChecklist = " + json.dumps(metadata, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"{len(rows)} plants, {len(Counter(row[2] for row in rows))} families")
    print("Nonempty region fields:", sum(bool(row[3]) for row in rows))


if __name__ == "__main__":
    main()

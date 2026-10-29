#!/usr/bin/env python3
"""Import 160 daytime garbage stops from six Yongkang route pages.

Run with: python scripts/import_daytime_160.py
This script writes data/daytime-160-stops.json only after all source routes pass.
Does NOT alter production or data-public.json.
"""
import json, re, urllib.request
from pathlib import Path
from html.parser import HTMLParser

COUNTS = [50, 4, 94, 4, 5, 3]
ROOT = "https://trash.joelin.cc/areas/tainan/yongkang/route-"
TARGET = Path("data/daytime-160-stops.json")

class StopsParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.li_depth = 0
        self.li_text = []
        self.rows = []
    def handle_starttag(self, tag, attrs):
        if tag == "li":
            if self.li_depth == 0:
                self.li_text = []
            self.li_depth += 1
    def handle_data(self, data):
        if self.li_depth:
            self.li_text.append(data)
    def handle_endtag(self, tag):
        if tag == "li" and self.li_depth:
            self.li_depth -= 1
            if self.li_depth == 0:
                self.rows.append(" ".join("".join(self.li_text).split()))

def parse(route_no, expected):
    url = ROOT + str(route_no) + "/"
    req = urllib.request.Request(url, headers={"User-Agent": "PMOS-route-import/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8")
    parser = StopsParser()
    parser.feed(html)
    stops = []
    for raw in parser.rows:
        match = re.search(r"(\d{2}:\d{2})\s+(.+?)\s+(.+?)\s*[・·]?第\s*(\d+)\s*站\s*收運日\s*(.*?)\s*資源回收日\s*(.*)", raw)
        if not match:
            continue
        when, location, village, seq, days, recycling = match.groups()
        stops.append({
            "route": route_no,
            "vehicle": "日間" + str(route_no - 46),
            "sequence": int(seq),
            "time": when,
            "location": location.strip(),
            "village": village.strip(),
            "collection_days": days.strip(),
            "recycling_days": recycling.strip(),
            "source_url": url,
            "address_verified": False,
        })
    if len(stops) != expected or sorted(x["sequence"] for x in stops) != list(range(1, expected + 1)):
        raise RuntimeError(f"Route {route_no}: expected {expected} ordered stops; parsed {len(stops)}. Refusing partial write.")
    return stops

def main():
    all_stops = []
    for route, count in zip(range(47, 53), COUNTS):
        route_stops = parse(route, count)
        all_stops.extend(route_stops)
        print(f"Route {route}: {len(route_stops)} stops")
    assert len(all_stops) == 160
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    result = {"description": "Six Yongkang daytime routes; source-derived records, map coordinates unverified", "total_stops": 160, "stops": all_stops}
    TARGET.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    reloaded = json.loads(TARGET.read_text(encoding="utf-8"))
    assert len(reloaded["stops"]) == 160
    print("Readback PASS: 160 records")

if __name__ == "__main__":
    main()

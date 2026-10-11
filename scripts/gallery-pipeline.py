#!/usr/bin/env python3
"""Reproducible Figure-1 curation pipeline for Archimedes Gallery.

The stages mirror Top-Conf Figure Gallery: build complete paper pools from
official proceedings, extract Figure 1 and structural metrics, apply the shared
design-quality rules plus dHash deduplication and venue/year quotas, then
assemble reviewed JPEGs into the application catalog. Work files live outside
the runtime bundle so every stage is resumable.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "scripts" / ".gallery-work"
POOL = WORK / "pool"
CATALOG = ROOT / "src" / "gallery-catalog.json"
PUBLIC_IMAGES = ROOT / "public" / "gallery" / "images"
CACHE = WORK / "sources"
HEADERS = {"User-Agent": "Mozilla/5.0 (Archimedes Gallery academic indexer)"}
YEARS = {
    "iccv": (2023, 2025),
    "eccv": (2024, 2026),
    "emnlp": (2023, 2024, 2025, 2026),
}
VISUAL_TITLE_RE = re.compile(
    r"diffusion|gaussian|video|robot|agent|vla|avatar|3d|multimodal|segmentation|generation|"
    r"framework|architecture|pipeline|system|model|network|benchmark|visual|vision|reasoning|"
    r"retrieval|graph|world|language|representation|learning|detection|transformer|alignment|"
    r"evaluation|understanding|taxonomy|survey|teaser|overview",
    re.I,
)


def fetch(url: str, *, timeout: int = 120) -> bytes:
    response = requests.get(url, headers=HEADERS, timeout=timeout)
    response.raise_for_status()
    return response.content


def cached(name: str, url: str, refresh: bool, minimum: int = 1000) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if refresh or not path.exists() or path.stat().st_size < minimum:
        path.write_bytes(fetch(url))
    return path.read_text(encoding="utf-8", errors="ignore")


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().strip('"')


def make_record(venue: str, year: int, paper: str, title: str, authors: list[str],
                pdf: str = "", **extra: object) -> dict:
    key = extra.get("source_id") or paper or f"{venue}:{year}:{title}"
    slug = hashlib.sha1(str(key).encode("utf-8")).hexdigest()[:14]
    return {
        "id": f"{venue}-{year}-{slug}", "venue": venue, "year": year,
        "title": normalize(title),
        "authors": [normalize(author) for author in authors if normalize(author)],
        "paper": paper, "page": paper, "pdf": pdf,
        "tier": 1 if VISUAL_TITLE_RE.search(title) else 2,
        **extra,
    }


def siblings_after(node):
    current = node
    while True:
        current = current.find_next_sibling()
        if current is None or current.name == "dt":
            return
        yield current


def pool_iccv(year: int, refresh: bool) -> list[dict]:
    base = "https://openaccess.thecvf.com/"
    soup = BeautifulSoup(cached(f"iccv-{year}.html", urljoin(base, f"ICCV{year}?day=all"), refresh, 10000), "html.parser")
    rows = []
    for title_node in soup.select("dt.ptitle"):
        page_link = title_node.find("a", href=re.compile(fr"/content/ICCV{year}/html/"))
        following = list(siblings_after(title_node))
        if not page_link or len(following) < 2:
            continue
        pdf_link = following[1].find("a", href=re.compile(fr"/content/ICCV{year}/papers/.*\.pdf$"))
        if not pdf_link:
            continue
        authors = [field.get("value", "") for field in following[0].select("input[name=query_author]")]
        page = urljoin(base, page_link["href"])
        rows.append(make_record("iccv", year, page, page_link.get_text(" ", strip=True), authors,
                                urljoin(base, pdf_link["href"]), source="cvf-open-access"))
    return rows


def pool_eccv_2024(refresh: bool) -> list[dict]:
    base = "https://www.ecva.net/"
    soup = BeautifulSoup(cached("eccv-2024.html", urljoin(base, "papers.php"), refresh, 10000), "html.parser")
    rows = []
    for title_node in soup.select("dt.ptitle"):
        page_link = title_node.find("a", href=re.compile(r"papers/eccv_2024/.*/html/"))
        following = list(siblings_after(title_node))
        if not page_link or len(following) < 2:
            continue
        pdf_link = following[1].find("a", href=re.compile(r"papers/eccv_2024/.*/papers/\d+\.pdf$"))
        if not pdf_link:
            continue
        authors = [part.rstrip("*").strip() for part in following[0].get_text(" ", strip=True).split(",")]
        page = urljoin(base, page_link["href"])
        rows.append(make_record("eccv", 2024, page, title_node.get_text(" ", strip=True), authors,
                                urljoin(base, pdf_link["href"]), source="ecva-proceedings"))
    return rows


def pool_eccv_2026(refresh: bool) -> list[dict]:
    base = "https://eccv.ecva.net"
    source = f"{base}/Conferences/2026/AcceptedPapers"
    soup = BeautifulSoup(cached("eccv-2026.html", source, refresh, 100000), "html.parser")
    rows, seen = [], set()
    for table_row in soup.select("table.elc-table tr"):
        link = table_row.find("a", href=re.compile(r"^/virtual/2026/poster/\d+$"))
        if not link or link["href"] in seen:
            continue
        seen.add(link["href"])
        author_node = table_row.select_one("td div.indented i")
        authors = re.split(r"\s*[⋅·]\s*", author_node.get_text(" ", strip=True)) if author_node else []
        detail = urljoin(base, link["href"])
        keyword_node = table_row.select_one("td.elc-keywords")
        rows.append(make_record(
            "eccv", 2026, detail, link.get_text(" ", strip=True), authors,
            pdf_page=detail, keywords=normalize(keyword_node.get_text(" ", strip=True)) if keyword_node else "",
            source="eccv-official-program",
        ))
    return rows


def pool_emnlp_published(year: int, refresh: bool) -> list[dict]:
    page_url = f"https://aclanthology.org/events/emnlp-{year}/"
    soup = BeautifulSoup(cached(f"emnlp-{year}.html", page_url, refresh, 10000), "html.parser")
    section = soup.find(id=f"{year}emnlp-main")
    if not section:
        raise RuntimeError(f"EMNLP {year} main proceedings were not found at ACL Anthology")
    rows = []
    for entry in section.select("div.d-sm-flex.align-items-stretch.mb-3"):
        pdf_link = entry.find("a", attrs={"aria-label": "Open PDF"})
        title_link = entry.select_one("strong a[href]")
        if not pdf_link or not title_link or title_link["href"].endswith(".0/"):
            continue
        authors = [link.get_text(" ", strip=True) for link in entry.select("a[href^='/people/']")]
        page = urljoin(page_url, title_link["href"])
        rows.append(make_record("emnlp", year, page, title_link.get_text(" ", strip=True), authors,
                                urljoin(page_url, pdf_link["href"]), source="acl-anthology"))
    return rows


def pool_emnlp_2026(refresh: bool) -> list[dict]:
    sheet = "https://docs.google.com/spreadsheets/d/1aXGTy_7Xeh-OXIs3iJSbDpUsZ6YhbfA76b17kBZH0Yk/export?format=csv&gid=943432490"
    text = cached("emnlp-2026-program.csv", sheet, refresh, 10000)
    rows = []
    for item in csv.DictReader(io.StringIO(text)):
        paper_id = (item.get("Paper ID #-track)") or "").strip()
        if not paper_id.endswith("-MAIN"):
            continue
        presentation = (item.get("Assigned \nPres Type") or "").strip().lower()
        rows.append(make_record(
            "emnlp", 2026, "https://2026.emnlp.org/program/main_papers/",
            item.get("Title", ""), [], source_id=paper_id,
            status="awaiting-acl-anthology", source="emnlp-official-program",
            presentation="oral" if presentation == "oral" else None,
        ))
    return rows


def write_pool(venue: str, year: int, rows: list[dict]) -> None:
    POOL.mkdir(parents=True, exist_ok=True)
    path = POOL / f"{venue}_{year}.jsonl"
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
    pending = sum(not row.get("pdf") and not row.get("pdf_page") for row in rows)
    print(f"{venue.upper()} {year}: {len(rows):,} accepted papers ({pending:,} awaiting official PDFs)")


def build_pool(refresh: bool, venues: set[str]) -> None:
    if "iccv" in venues:
        for year in YEARS["iccv"]:
            write_pool("iccv", year, pool_iccv(year, refresh))
    if "eccv" in venues:
        write_pool("eccv", 2024, pool_eccv_2024(refresh))
        write_pool("eccv", 2026, pool_eccv_2026(refresh))
    if "emnlp" in venues:
        for year in (2023, 2024, 2025):
            write_pool("emnlp", year, pool_emnlp_published(year, refresh))
        write_pool("emnlp", 2026, pool_emnlp_2026(refresh))


def run_stage(script: str, *arguments: str) -> None:
    subprocess.run([sys.executable, str(ROOT / "scripts" / "gallery" / script), *arguments], check=True)


def assemble() -> None:
    selected_path = WORK / "selected.json"
    if not selected_path.exists():
        raise RuntimeError("Run the select stage before assemble")
    current = json.loads(CATALOG.read_text(encoding="utf-8")) if CATALOG.exists() else {"figures": []}
    figures = {row["id"]: row for row in current.get("figures", [])}
    selected = json.loads(selected_path.read_text(encoding="utf-8"))["selected"]
    selected_ids = {row["id"] for row in selected}
    rebuilt_venues = {row["venue"] for row in selected}
    for stale_id, stale in list(figures.items()):
        if stale.get("venue") not in rebuilt_venues or stale_id in selected_ids:
            continue
        figures.pop(stale_id)
        if stale.get("image", "").startswith("gallery/images/"):
            try:
                (ROOT / "public" / stale["image"]).unlink()
            except FileNotFoundError:
                pass
    state_path = WORK / "extract_state.jsonl"
    managed_ids = set()
    if state_path.exists():
        for line in state_path.read_text(encoding="utf-8").splitlines():
            try:
                managed_ids.add(json.loads(line)["id"])
            except (KeyError, json.JSONDecodeError):
                pass
    for stale_id in managed_ids - selected_ids:
        stale = figures.pop(stale_id, None)
        if stale and stale.get("image", "").startswith("gallery/images/"):
            try:
                (ROOT / "public" / stale["image"]).unlink()
            except FileNotFoundError:
                pass
    for row in selected:
        source = WORK / "images" / row["venue"] / "all" / f"{row['id']}.png"
        if not source.exists():
            continue
        relative = Path("gallery") / "images" / row["venue"] / "final" / f"{row['id']}.jpg"
        output = ROOT / "public" / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source).convert("RGB") as image:
            image.thumbnail((1400, 1000), Image.Resampling.LANCZOS)
            image.save(output, "JPEG", quality=84, optimize=True, progressive=True)
            width, height = image.size
        figures[row["id"]] = {
            "id": row["id"], "venue": row["venue"], "year": row["year"],
            "title": row["title"], "authors": row.get("authors", []),
            "paper": row.get("paper", ""), "pattern": row["pattern"],
            "image": relative.as_posix(), "source": "official-proceedings",
            "w": width, "h": height, "page": row.get("page", 1),
            **({"tier": row["presentation"]} if row.get("presentation") in ("oral", "spotlight") else {}),
        }
    ordered = sorted(figures.values(), key=lambda row: (row["venue"], -row["year"], row["title"]))
    digest = hashlib.sha1(json.dumps(ordered, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
    coverage = []
    for pool_path in sorted(POOL.glob("*.jsonl")):
        rows = [json.loads(line) for line in pool_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        if not rows:
            continue
        coverage.append({
            "venue": rows[0]["venue"],
            "year": rows[0]["year"],
            "accepted": len(rows),
            "officialPdfs": sum(bool(row.get("pdf") or row.get("pdf_page")) for row in rows),
            "status": "published" if any(row.get("pdf") or row.get("pdf_page") for row in rows) else "awaiting-proceedings",
        })
    CATALOG.write_text(json.dumps({"version": digest, "coverage": coverage, "figures": ordered}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts = {}
    for row in ordered:
        counts[(row["venue"], row["year"])] = counts.get((row["venue"], row["year"]), 0) + 1
    print(f"assembled {len(ordered):,} local figures")
    for key, count in sorted(counts.items()):
        print(f"  {key[0].upper()} {key[1]}: {count:,}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("pool", "extract", "select", "assemble", "sheets", "build"))
    parser.add_argument("--venues", default="iccv,eccv,emnlp")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--quota", type=int, default=980)
    parser.add_argument("--limit-per-year", type=int, default=0)
    parser.add_argument("--retry-failed", action="store_true")
    parser.add_argument("--refresh-sources", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    venues = {value.strip().lower() for value in args.venues.split(",") if value.strip()}
    unknown = venues - YEARS.keys()
    if unknown:
        raise SystemExit(f"Unknown venues: {', '.join(sorted(unknown))}")
    WORK.mkdir(parents=True, exist_ok=True)
    if args.command in ("pool", "build"):
        build_pool(args.refresh_sources, venues)
    if args.command in ("extract", "build"):
        extract_args = ["--venues", ",".join(sorted(venues)), "--workers", str(args.workers)]
        if args.limit_per_year:
            extract_args += ["--limit-per-year", str(args.limit_per_year)]
        if args.retry_failed:
            extract_args.append("--retry-failed")
        run_stage("extract.py", *extract_args)
    if args.command in ("select", "build"):
        run_stage("score_select.py", str(args.quota))
    if args.command in ("assemble", "build"):
        assemble()
    if args.command == "sheets":
        for venue in sorted(venues):
            run_stage("sheets.py", venue, "40")


if __name__ == "__main__":
    main()

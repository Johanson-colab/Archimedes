#!/usr/bin/env python3
"""Build a local Figure-1 gallery from official conference proceedings.

The script is intentionally resumable. Existing JPEGs and catalog records are
kept, PDFs are held in memory only, and source HTML is cached outside the app's
runtime bundle. By default it collects 120 verified crops for each supplemental
venue (ICCV 2025, ECCV 2024, and EMNLP 2025).
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin

import pymupdf as fitz
import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageStat


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = ROOT / "public" / "gallery-supplements"
CATALOG_PATH = ROOT / "src" / "gallery-supplements.json"
CACHE_ROOT = ROOT / "scripts" / ".gallery-cache"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Archimedes research gallery; academic indexing)",
    "Accept": "application/pdf,text/html,*/*",
}
CAPTION_RE = re.compile(r"^\s*(?:Figure|Fig\.?)\s*1(?:\s|[.:])", re.I)
PATTERN_RULES = [
    ("taxonomy", r"benchmark|evaluation|taxonomy|suite|survey|leaderboard"),
    ("framework", r"agent|framework|system|platform|ecosystem|environment"),
    ("pipeline", r"pipeline|workflow|end-to-end|generation|retrieval|distill|flow|two-stage"),
    ("architecture", r"architecture|network|transformer|attention|mamba|state space|encoder|decoder|diffusion|mixture|gaussian"),
    ("conceptual", r"understanding|perspective|theory|principle|mechanism|interpret|geometric|causal|optimization"),
    ("comparison", r"comparison|versus|empirical study|analysis|revisiting|effect of|role of"),
    ("results", r"results|in the wild|showcase|gallery"),
]
VISUAL_TITLE_RE = re.compile(
    r"framework|architecture|pipeline|system|model|network|agent|benchmark|visual|vision|multimodal|"
    r"generation|reasoning|retrieval|graph|world|robot|language|representation|learning|detection|"
    r"segmentation|diffusion|transformer|alignment|evaluation|understanding",
    re.I,
)
thread_local = threading.local()


def session() -> requests.Session:
    if not hasattr(thread_local, "session"):
        value = requests.Session()
        # The desktop development environment may provide an HTTPS proxy. The
        # official proceedings hosts are substantially more reliable through
        # it than through a direct connection.
        value.trust_env = True
        value.headers.update(HEADERS)
        thread_local.session = value
    return thread_local.session


def fetch(url: str, attempts: int = 4) -> bytes:
    delay = 1.0
    for attempt in range(attempts):
        try:
            response = session().get(url, timeout=(15, 120))
            if response.ok:
                return response.content
            if response.status_code in (403, 404, 410):
                raise RuntimeError(f"HTTP {response.status_code}")
        except Exception:
            if attempt == attempts - 1:
                raise
        time.sleep(delay)
        delay *= 2
    raise RuntimeError("download failed")


def cached_html(name: str, url: str, refresh: bool) -> str:
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    path = CACHE_ROOT / f"{name}.html"
    if refresh or not path.exists() or path.stat().st_size < 10_000:
        path.write_bytes(fetch(url))
    return path.read_text(encoding="utf-8", errors="ignore")


def siblings_after(node):
    current = node
    while True:
        current = current.find_next_sibling()
        if current is None or current.name == "dt":
            return
        yield current


def parse_iccv(refresh: bool) -> list[dict]:
    base = "https://openaccess.thecvf.com/"
    soup = BeautifulSoup(cached_html("iccv-2025", urljoin(base, "ICCV2025?day=all"), refresh), "html.parser")
    rows = []
    for title_node in soup.select("dt.ptitle"):
        page_link = title_node.find("a", href=re.compile(r"/content/ICCV2025/html/"))
        if not page_link:
            continue
        following = list(siblings_after(title_node))
        if len(following) < 2:
            continue
        pdf_link = following[1].find("a", href=re.compile(r"/content/ICCV2025/papers/.*\.pdf$"))
        if not pdf_link:
            continue
        authors = [field.get("value", "").strip() for field in following[0].select("input[name=query_author]")]
        page = urljoin(base, page_link["href"])
        rows.append(record("iccv", 2025, page, page_link.get_text(" ", strip=True), authors, urljoin(base, pdf_link["href"])))
    return rows


def parse_eccv(refresh: bool) -> list[dict]:
    base = "https://www.ecva.net/"
    soup = BeautifulSoup(cached_html("eccv-2024", urljoin(base, "papers.php"), refresh), "html.parser")
    rows = []
    for title_node in soup.select("dt.ptitle"):
        page_link = title_node.find("a", href=re.compile(r"papers/eccv_2024/.*/html/"))
        if not page_link:
            continue
        following = list(siblings_after(title_node))
        if len(following) < 2:
            continue
        pdf_link = following[1].find("a", href=re.compile(r"papers/eccv_2024/.*/papers/\d+\.pdf$"))
        if not pdf_link:
            continue
        authors = [part.strip().rstrip("*") for part in following[0].get_text(" ", strip=True).split(",") if part.strip()]
        page = urljoin(base, page_link["href"])
        rows.append(record("eccv", 2024, page, page_link.get_text(" ", strip=True), authors, urljoin(base, pdf_link["href"])))
    return rows


def parse_emnlp(refresh: bool) -> list[dict]:
    page_url = "https://aclanthology.org/events/emnlp-2025/"
    soup = BeautifulSoup(cached_html("emnlp-2025", page_url, refresh), "html.parser")
    # The section id starts with a digit, which is valid HTML but requires CSS
    # escaping. Direct id lookup is clearer and works across BeautifulSoup's
    # selector-engine versions.
    section = soup.find(id="2025emnlp-main")
    if not section:
        raise RuntimeError("Could not find the EMNLP 2025 main-proceedings section.")
    rows = []
    for entry in section.select("div.d-sm-flex.align-items-stretch.mb-3"):
        pdf_link = entry.find("a", attrs={"aria-label": "Open PDF"})
        title_link = entry.select_one("strong a[href]")
        if not pdf_link or not title_link or title_link["href"].endswith(".0/"):
            continue
        authors = [link.get_text(" ", strip=True) for link in title_link.find_parent("span").find_all("a", recursive=False)]
        page = urljoin(page_url, title_link["href"])
        rows.append(record("emnlp", 2025, page, title_link.get_text(" ", strip=True), authors, urljoin(page_url, pdf_link["href"])))
    return rows


def record(venue: str, year: int, page: str, title: str, authors: list[str], pdf: str) -> dict:
    slug = hashlib.sha1(page.encode("utf-8")).hexdigest()[:14]
    return {
        "id": f"{venue}-{year}-{slug}", "venue": venue, "year": year,
        "title": re.sub(r"\s+", " ", title).strip(), "authors": authors,
        "paper": page, "pdf": pdf,
    }


def classify(title: str) -> str:
    lowered = title.lower()
    for pattern, expression in PATTERN_RULES:
        if re.search(expression, lowered):
            return pattern
    return "teaser"


def find_captions(page) -> list[fitz.Rect]:
    candidates = []
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            text = "".join(span.get("text", "") for span in line.get("spans", []))
            if CAPTION_RE.match(text) and not re.match(r"^\s*(?:Figure|Fig\.?)\s*1\d", text, re.I):
                x0, y0, x1, y1 = line["bbox"]
                candidates.append(fitz.Rect(x0 - 2, y0 - 2, x1 + 2, y1 + 2))
    return candidates


def content_above(page, caption: fitz.Rect):
    page_width = page.rect.width
    full_width = caption.width > 0.62 * page_width
    left = 0.05 * page_width if full_width else caption.x0 - 7
    right = 0.95 * page_width if full_width else caption.x1 + 7
    boxes = []
    for drawing in page.get_drawings():
        rect = drawing.get("rect")
        if rect is None or rect.width <= 3 or rect.height <= 3:
            continue
        if rect.height < 2.5 and rect.width > 0.55 * page_width:
            continue
        if rect.y1 <= caption.y0 + 4 and rect.x1 >= left and rect.x0 <= right:
            boxes.append(fitz.Rect(max(rect.x0, left), rect.y0, min(rect.x1, right), rect.y1))
    for info in page.get_image_info(xrefs=True):
        rect = fitz.Rect(info["bbox"])
        if rect.width > 10 and rect.height > 10 and rect.y1 <= caption.y0 + 4 and rect.x1 >= left and rect.x0 <= right:
            boxes.append(fitz.Rect(max(rect.x0, left), rect.y0, min(rect.x1, right), rect.y1))
    if not boxes:
        return None
    boxes.sort(key=lambda rect: -rect.y1)
    kept, top = [], caption.y0 + 4
    for rect in boxes:
        if rect.y1 > top + 6 or top - rect.y1 <= 58:
            kept.append(rect)
            top = min(top, rect.y0)
    if not kept:
        return None
    union = fitz.Rect(kept[0])
    for rect in kept[1:]:
        union |= rect
    return fitz.Rect(max(0, union.x0 - 4), max(0, union.y0 - 4), min(page_width, union.x1 + 4), min(page.rect.height, union.y1 + 3))


def extract_figure(pdf: bytes):
    document = fitz.open(stream=pdf, filetype="pdf")
    try:
        best = None
        for page_number in range(min(4, len(document))):
            page = document[page_number]
            for caption in find_captions(page):
                clip = content_above(page, caption)
                if clip is None or clip.width < 90 or clip.height < 60 or caption.y0 - clip.y1 > 50:
                    continue
                score = clip.width * clip.height
                if best is None or score > best[0]:
                    best = (score, page_number, clip)
        if best is None:
            return None
        _, page_number, clip = best
        pixmap = document[page_number].get_pixmap(matrix=fitz.Matrix(2.35, 2.35), clip=clip, alpha=False)
        image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        image.thumbnail((1400, 1000), Image.Resampling.LANCZOS)
        if image.width < 500 or image.height < 240 or not 0.42 <= image.width / image.height <= 4.4:
            return None
        statistics = ImageStat.Stat(image.convert("L"))
        if statistics.var[0] < 80:
            return None
        return image, page_number + 1
    finally:
        document.close()


def build_one(item: dict) -> tuple[dict | None, str | None]:
    relative = Path("gallery-supplements") / item["venue"] / f"{item['id']}.jpg"
    output = ROOT / "public" / relative
    try:
        result = extract_figure(fetch(item["pdf"]))
        if result is None:
            return None, "no usable Figure 1"
        image, page = result
        output.parent.mkdir(parents=True, exist_ok=True)
        image.save(output, "JPEG", quality=82, optimize=True, progressive=True)
        built = {key: item[key] for key in ("id", "venue", "year", "title", "authors", "paper")}
        built.update({
            "pattern": classify(item["title"]), "image": relative.as_posix(),
            "source": "official-proceedings", "w": image.width, "h": image.height,
            "page": page,
        })
        return built, None
    except Exception as error:
        return None, f"{type(error).__name__}: {error}"


def load_catalog() -> dict:
    if not CATALOG_PATH.exists():
        return {"version": "", "figures": []}
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def save_catalog(figures: list[dict]) -> None:
    figures.sort(key=lambda row: (row["venue"], -row["year"], row["title"]))
    digest = hashlib.sha1(json.dumps(figures, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:12]
    CATALOG_PATH.write_text(json.dumps({"version": digest, "figures": figures}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def ranked(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda row: (0 if VISUAL_TITLE_RE.search(row["title"]) else 1, hashlib.sha1(row["id"].encode()).hexdigest()))


def build_venue(venue: str, candidates: list[dict], all_figures: list[dict], target: int, workers: int) -> None:
    existing_ids = {row["id"] for row in all_figures}
    completed = sum(row["venue"] == venue for row in all_figures)
    pending = [row for row in ranked(candidates) if row["id"] not in existing_ids]
    attempted = 0
    print(f"{venue.upper()}: {len(candidates)} official papers, {completed}/{target} figures ready", flush=True)
    while completed < target and pending:
        needed = target - completed
        batch_size = min(len(pending), max(24, min(64, needed * 2)))
        batch, pending = pending[:batch_size], pending[batch_size:]
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {executor.submit(build_one, item): item for item in batch}
            for future in as_completed(futures):
                attempted += 1
                figure, error = future.result()
                if figure:
                    all_figures.append(figure)
                    completed += 1
                    if completed % 10 == 0 or completed == target:
                        save_catalog(all_figures)
                        print(f"  {completed}/{target} ready ({attempted} PDFs tried)", flush=True)
                elif attempted % 25 == 0:
                    print(f"  skipped {futures[future]['id']}: {error}", flush=True)
        save_catalog(all_figures)
    if completed < target:
        raise RuntimeError(f"{venue.upper()} only produced {completed}/{target} figures")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=120, help="figure target per venue")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--refresh-sources", action="store_true")
    parser.add_argument("--venues", default="iccv,eccv,emnlp")
    args = parser.parse_args()
    selected = {part.strip().lower() for part in args.venues.split(",") if part.strip()}
    parsers = {"iccv": parse_iccv, "eccv": parse_eccv, "emnlp": parse_emnlp}
    unknown = selected - parsers.keys()
    if unknown:
        raise SystemExit(f"Unknown venues: {', '.join(sorted(unknown))}")
    catalog = load_catalog()
    figures = list(catalog.get("figures", []))
    for venue in ("iccv", "eccv", "emnlp"):
        if venue in selected:
            build_venue(venue, parsers[venue](args.refresh_sources), figures, args.target, args.workers)
    save_catalog(figures)
    counts = {venue: sum(row["venue"] == venue for row in figures) for venue in parsers}
    print(f"DONE: {len(figures)} supplemental figures {counts}", flush=True)


if __name__ == "__main__":
    main()

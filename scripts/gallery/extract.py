# -*- coding: utf-8 -*-
"""Parallel Figure-1 extraction over data/pool/*.jsonl.

- downloads each PDF, reuses the caption/gap-clustering logic of extract_figures,
  renders the crop at ~180 DPI into images/<venue>/all/<id>.png, deletes the PDF;
- records design-relevant stats (vector paths, labels, bitmap coverage, edge cuts)
  into data/extract_state.jsonl (resumable);
- tier-1 (visual-topic) candidates are processed first.
"""
import argparse, json, re, subprocess, time, threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests, pymupdf as fitz
from extract_figures import find_captions, content_above

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "scripts" / ".gallery-work"
POOL = DATA / "pool"
IMGDIR, TMP = DATA / "images", DATA / "pdfs" / "tmp"
STATE = DATA / "extract_state.jsonl"
TMP.mkdir(parents=True, exist_ok=True)
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
HEADERS = {"User-Agent": BROWSER_UA, "Accept": "application/pdf,text/html,*/*"}
COOKIE_LIST = []
_cf = DATA / "or_cookies.json"
if _cf.exists():
    COOKIE_LIST = json.loads(_cf.read_text(encoding="utf-8"))

lock = threading.Lock()
# OpenReview rate limiter: serialize requests, >= OR_MIN_INTERVAL seconds apart
_or_lock = threading.Lock()
_or_last = [0.0]
OR_MIN_INTERVAL = 1.1
local = threading.local()
def sess():
    if not hasattr(local, "s"):
        local.s = requests.Session()
        local.s.trust_env = True
        local.s.headers.update(HEADERS)
        for c in COOKIE_LIST:
            local.s.cookies.set(c["name"], c["value"],
                                domain=c.get("domain", ".openreview.net").lstrip("."),
                                path=c.get("path", "/"))
    return local.s

def load_done(retry_failed=False):
    done = {}
    if STATE.exists():
        for line in STATE.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(line)
                if retry_failed and not r.get("ok") and str(r.get("reason", "")).startswith("download"):
                    continue
                done[r["id"]] = r
            except Exception:
                pass
    return done

def _get(url, timeout=120):
    """GET with OpenReview-wide polite spacing."""
    if "openreview.net" in url:
        with _or_lock:
            wait = OR_MIN_INTERVAL - (time.time() - _or_last[0])
            if wait > 0:
                time.sleep(wait)
            _or_last[0] = time.time()
            return sess().get(url, timeout=timeout)
    return sess().get(url, timeout=timeout)

def download(url, dest):
    result = subprocess.run([
        "curl", "-L", "--fail", "--silent", "--show-error",
        "--connect-timeout", "10", "--max-time", "55", "--retry", "2",
        "--retry-delay", "1", "-A", BROWSER_UA, "-o", str(dest), url,
    ], capture_output=True, text=True)
    if result.returncode == 0 and dest.exists():
        head = dest.read_bytes()[:4]
        if head == b"%PDF" and dest.stat().st_size > 50_000:
            return True, dest.stat().st_size
    try:
        dest.unlink()
    except FileNotFoundError:
        pass
    return False, result.stderr.strip()[-160:] or f"curl {result.returncode}"

def resolve_pdf(item):
    if item.get("pdf"):
        return item["pdf"]
    detail = item.get("pdf_page")
    if not detail:
        return ""
    try:
        response = subprocess.run([
            "curl", "-L", "--fail", "--silent", "--show-error",
            "--connect-timeout", "10", "--max-time", "40", "--retry", "1",
            "-A", BROWSER_UA, detail,
        ], capture_output=True, text=True)
        match = re.search(r'href=["\'](https://media\.eventhosts\.cc/Conferences/ECCV2026/pdfs/[^"\']+\.pdf)["\']', response.stdout)
        return match.group(1) if match else ""
    except Exception:
        return ""

def overlap(a, b):
    x0, y0 = max(a.x0, b.x0), max(a.y0, b.y0)
    x1, y1 = min(a.x1, b.x1), min(a.y1, b.y1)
    return max(0, x1 - x0) * max(0, y1 - y0)

def region_stats(page, clip):
    area = clip.width * clip.height
    n_paths, n_rects, n_curves = 0, 0, 0
    for dr in page.get_drawings():
        r = dr.get("rect")
        if r is None or r.width <= 3 or r.height <= 3:
            continue
        ov = overlap(r, clip) / max(1e-6, r.width * r.height)
        if ov < 0.6 or r.y0 > clip.y1 or r.y1 < clip.y0:
            continue
        n_paths += max(1, len(dr.get("items", [])))
        for it in dr.get("items", []):
            if it[0] == "re":
                n_rects += 1
            elif it[0] in ("c", "qu"):
                n_curves += 1
    n_spans, n_chars, edge_cut = 0, 0, 0
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for line in b.get("lines", []):
            for sp in line.get("spans", []):
                r = fitz.Rect(sp["bbox"])
                cx, cy = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2
                if clip.x0 < cx < clip.x1 and clip.y0 < cy < clip.y1:
                    n_spans += 1
                    n_chars += len(sp["text"].strip())
                elif r.y0 < clip.y1 and r.y1 > clip.y0:
                    # text center outside clip but intersects -> cropped label
                    if cx > clip.x1 - 2 or cx < clip.x0 + 2:
                        edge_cut += 1
    bitmap = 0.0
    n_img = 0
    for info in page.get_image_info(xrefs=True):
        r = fitz.Rect(info["bbox"])
        ov = overlap(r, clip)
        if ov > 200:
            n_img += 1
            bitmap += ov
    bitmap_frac = min(1.0, bitmap / max(1e-6, area))
    return {"paths": n_paths, "rects": n_rects, "curves": n_curves,
            "spans": n_spans, "chars": n_chars, "edge_cut": edge_cut,
            "images": n_img, "bitmap_frac": round(bitmap_frac, 3)}

def find_best(doc):
    best = None
    for pno in range(min(4, len(doc))):
        page = doc[pno]
        for cap in find_captions(page):
            cb = content_above(page, cap)
            if cb is None or cb.height < 40 or cb.width < 60:
                continue
            if cap.y0 - cb.y1 > 50:
                continue
            sc = cb.width * cb.height
            if best is None or sc > best[0]:
                best = (sc, pno, fitz.Rect(cb.x0 - 4, max(0, cb.y0 - 4), cb.x1 + 4, cb.y1 + 3))
    return best

def work(item):
    fid = item["id"]
    venue = item["venue"]
    out = IMGDIR / venue / "all" / f"{fid}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = TMP / f"{fid}.pdf"
    pdf = resolve_pdf(item)
    if not pdf:
        return {"id": fid, "ok": False, "reason": "official PDF pending"}
    ok, info = download(pdf, tmp)
    if not ok and item.get("arxiv_pdf"):
        ok, info = download(item["arxiv_pdf"], tmp)  # OpenReview blocked -> arXiv fallback
    if not ok:
        return {"id": fid, "ok": False, "reason": f"download {info}"}
    try:
        doc = fitz.open(tmp)
        best = find_best(doc)
        if best is None:
            doc.close()
            return {"id": fid, "ok": False, "reason": "no figure"}
        _, pno, clip = best
        st = region_stats(doc[pno], clip)
        pix = doc[pno].get_pixmap(matrix=fitz.Matrix(2.5, 2.5), clip=clip, alpha=False)
        pix.save(out)
        doc.close()
        return {"id": fid, "ok": True, "page": pno + 1, "w": pix.width, "h": pix.height,
                "bytes": out.stat().st_size, **st}
    except Exception as e:
        return {"id": fid, "ok": False, "reason": f"exc {type(e).__name__}: {e}"}
    finally:
        try: tmp.unlink()
        except Exception: pass

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--venues", default="iccv,eccv,emnlp")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--limit-per-year", type=int, default=0,
                        help="Optional extraction budget for an incremental run; 0 processes the full pool.")
    parser.add_argument("--retry-failed", action="store_true",
                        help="Retry transient PDF download failures while retaining successful and no-figure results.")
    args = parser.parse_args()
    only = {part.strip() for part in args.venues.split(",") if part.strip()}
    items = []
    for p in sorted(POOL.glob("*.jsonl")):
        for line in p.read_text(encoding="utf-8").splitlines():
            it = json.loads(line)
            if only and it["venue"] not in only:
                continue
            items.append(it)
    # ICLR (OpenReview, strict rate limit) goes last; tier-1 first within venue
    items.sort(key=lambda r: (r["venue"] == "iclr", r["tier"], r["venue"], r["year"], r["id"]))
    done = load_done(args.retry_failed)
    todo = [it for it in items if it["id"] not in done and (it.get("pdf") or it.get("pdf_page"))]
    if args.limit_per_year:
        grouped, limited = {}, []
        for item in items:
            if item["id"] in done:
                key = (item["venue"], item["year"])
                grouped[key] = grouped.get(key, 0) + 1
        for item in todo:
            key = (item["venue"], item["year"])
            used = grouped.get(key, 0)
            if used < args.limit_per_year:
                grouped[key] = used + 1
                limited.append(item)
        todo = limited
    print(f"pool={len(items)} done={len(done)} todo={len(todo)}", flush=True)
    sf = STATE.open("a", encoding="utf-8")
    n_ok = sum(1 for r in done.values() if r.get("ok"))
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(work, it): it for it in todo}
        for k, fut in enumerate(as_completed(futs), 1):
            it = futs[fut]
            try:
                r = fut.result()
            except Exception as e:
                r = {"id": it["id"], "ok": False, "reason": f"worker {e}"}
            with lock:
                sf.write(json.dumps(r, ensure_ascii=False) + "\n")
                sf.flush()
                if r.get("ok"):
                    n_ok += 1
            if k % 25 == 0:
                rate = k / max(1e-6, time.time() - t0)
                eta = (len(todo) - k) / max(1e-6, rate)
                print(f"{k}/{len(todo)} ok={n_ok} {rate:.2f}/s eta={eta/60:.0f}min last={r['id']} {'OK' if r.get('ok') else r.get('reason')}", flush=True)
    sf.close()
    print(f"DONE ok={n_ok}/{len(items)}", flush=True)

if __name__ == "__main__":
    main()

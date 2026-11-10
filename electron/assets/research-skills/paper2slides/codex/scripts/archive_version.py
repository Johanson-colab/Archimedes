"""Archive a deck's current artifacts and image inputs before editing them."""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
from pathlib import Path


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('workdir', type=Path)
    args = p.parse_args()
    work = args.workdir.resolve()
    spec = work / 'slide_spec.json'
    if not spec.is_file():
        p.error('slide_spec.json is required')
    doc = json.loads(spec.read_text(encoding='utf-8'))
    base = work / 'versions'
    base.mkdir(parents=True, exist_ok=True)
    for n in range(1, 10000):
        target = base / f'v{n:03}'
        try:
            target.mkdir()
            break
        except FileExistsError:
            continue
    else:
        p.error('No version slot available')
    manifest = {'files': {}, 'images': {}}
    for name in ('config.json', 'slide_outline.json', 'slide_spec.json', 'output.pptx', 'qa_log.json', '.pipeline-state.json', 'qa/output.pdf'):
        src = work / name
        if src.is_file():
            dst = target / name
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            manifest['files'][name] = hashlib.sha256(dst.read_bytes()).hexdigest()
    for name in sorted({str(e['path']) for slide in doc.get('slides', []) for e in slide.get('elements', []) if e.get('kind') == 'image' and e.get('path')}):
        src = (work / name).resolve()
        if not src.is_file():
            manifest['images'][name] = {'error': 'missing'}
            continue
        sha = hashlib.sha256(src.read_bytes()).hexdigest()
        dst = target / 'image-inputs' / (sha + src.suffix)
        dst.parent.mkdir(exist_ok=True)
        if not dst.exists():
            shutil.copy2(src, dst)
        manifest['images'][name] = {'sha256': sha, 'archive': str(dst.relative_to(target))}
    (target / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'version': str(target), 'images': len(manifest['images'])}, ensure_ascii=False))

if __name__ == '__main__':
    main()

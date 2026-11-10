"""Record and verify fingerprints of pipeline stages without changing legacy artifacts."""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
from pathlib import Path

STAGES = ('extract', 'outline', 'spec', 'render', 'qa')
FILES = {
    'extract': ('@paper', 'paper_meta.json', 'figures_index.json'),
    'outline': ('@paper', 'config.json', 'paper_meta.json', 'figures_index.json', 'slide_outline.json'),
    'spec': ('@paper', 'config.json', 'paper_meta.json', 'figures_index.json', 'slide_outline.json', 'slide_spec.json'),
    'render': ('slide_spec.json', 'output.pptx'),
    'qa': ('config.json', 'slide_spec.json', 'output.pptx', 'qa_log.json'),
}


def digest(path: Path) -> str | None:
    if not path.is_file():
        return None
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def snapshot(workdir: Path, paper: Path, stage: str) -> dict:
    result = {name: digest(paper if name == '@paper' else workdir / name) for name in FILES[stage]}
    if stage in ('spec', 'render', 'qa'):
        spec = workdir / 'slide_spec.json'
        if spec.is_file():
            doc = json.loads(spec.read_text(encoding='utf-8'))
            images = sorted({str(e['path']) for s in doc.get('slides', []) for e in s.get('elements', []) if e.get('kind') == 'image' and e.get('path')})
            result['@images'] = {name: digest(workdir / name) for name in images}
    return result


def own_status(workdir: Path, paper: Path, stage: str) -> dict:
    path = workdir / '.pipeline-state.json'
    if not path.exists():
        return {'stage': stage, 'status': 'unverified', 'reason': 'No fingerprints; legacy outputs need review.'}
    record = json.loads(path.read_text(encoding='utf-8')).get('stages', {}).get(stage)
    if record is None:
        return {'stage': stage, 'status': 'unverified', 'reason': 'Stage not recorded.'}
    now = snapshot(workdir, paper, stage)
    changed = [k for k in set(now) | set(record) if now.get(k) != record.get(k)]
    missing = [k for k, v in now.items() if v is None]
    missing += [f'@images:{k}' for k, v in now.get('@images', {}).items() if v is None]
    return {'stage': stage, 'status': 'stale' if changed or missing else 'valid', 'changed': sorted(changed), 'missing': missing}


def status(workdir: Path, paper: Path, stage: str) -> dict:
    own = own_status(workdir, paper, stage)
    if own['status'] != 'valid':
        return own
    blocked = [r for prior in STAGES[:STAGES.index(stage)]
               if (r := own_status(workdir, paper, prior))['status'] != 'valid']
    if blocked:
        return {'stage': stage, 'status': 'stale', 'reason': 'Upstream stages need verification', 'blocked_by': blocked}
    return own


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=('record', 'check'))
    p.add_argument('workdir', type=Path)
    p.add_argument('paper', type=Path)
    p.add_argument('stage', choices=STAGES)
    args = p.parse_args()
    workdir, paper = args.workdir.resolve(), args.paper.resolve()
    try:
        if args.action == 'record':
            snap = snapshot(workdir, paper, args.stage)
            missing = [k for k, v in snap.items() if v is None]
            missing += [f'@images:{k}' for k, v in snap.get('@images', {}).items() if v is None]
            if missing:
                raise ValueError('Cannot record missing files: ' + ', '.join(missing))
            path = workdir / '.pipeline-state.json'
            doc = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'version': 1, 'stages': {}}
            doc['stages'][args.stage] = snap
            temp = path.with_suffix('.tmp')
            temp.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding='utf-8')
            temp.replace(path)
        result = status(workdir, paper, args.stage)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0 if result['status'] == 'valid' else 1)
    except (OSError, ValueError, KeyError, TypeError) as e:
        print(json.dumps({'status': 'error', 'error': str(e)}, ensure_ascii=False, indent=2))
        sys.exit(2)

if __name__ == '__main__':
    main()

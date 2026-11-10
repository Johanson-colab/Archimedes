"""Check slide evidence against the planned outline. Does not judge scientific accuracy."""
from __future__ import annotations
import argparse
import json
import sys
from zipfile import ZipFile, BadZipFile
from xml.etree import ElementTree
from pathlib import Path


def audit(workdir: Path, rendered: bool = False) -> dict:
    outline = json.loads((workdir / 'slide_outline.json').read_text(encoding='utf-8'))
    spec = json.loads((workdir / 'slide_spec.json').read_text(encoding='utf-8'))
    figures = json.loads((workdir / 'figures_index.json').read_text(encoding='utf-8'))
    ids = {c['id'] for c in figures.get('captions', []) if 'id' in c}
    spec_list = spec.get('slides', [])
    slides = {s.get('id'): s for s in spec_list}
    errors, warnings = [], []
    if len(slides) != len(spec_list) or None in slides:
        errors.append('Specification has duplicate or missing slide ids')
    planned = set()
    for plan in outline.get('slides', []):
        sid = plan.get('id')
        if sid in planned or not sid:
            errors.append(f'Duplicate or missing outline slide id: {sid!r}')
        planned.add(sid)
        slide = slides.get(sid)
        if not slide:
            errors.append(f'{sid}: missing from slide_spec')
            continue
        elements = slide.get('elements', [])
        evidence = slide.get('evidence', [])
        for el in elements:
            kind = el.get('kind')
            if kind not in ('text', 'shape', 'line', 'image', 'icon'):
                errors.append(f'{sid}: unsupported element kind {kind!r}')
            if kind == 'shape' and el.get('shape') not in ('rect', 'rounded_rect', 'oval', 'line'):
                errors.append(f'{sid}: unsupported shape {el.get("shape")!r}')
            if kind == 'image':
                path = el.get('path')
                if not path or not (workdir / path).is_file():
                    errors.append(f'{sid}: image missing: {path!r}')
        expected = plan.get('figure_ref')
        if plan.get('needs_figure') and not expected:
            warnings.append(f'{sid}: needs_figure has no figure_ref; inspect outline')
        if expected and expected not in ids:
            errors.append(f'{sid}: planned source {expected!r} absent from figures index')
        matches = [e for e in evidence if e.get('source_id') == expected] if expected else []
        if expected and not matches:
            errors.append(f'{sid}: planned {expected} has no evidence record')
        for e in evidence:
            source, mode = e.get('source_id'), e.get('mode')
            if source not in ids:
                errors.append(f'{sid}: unknown evidence source {source!r}')
            if mode not in ('original', 'crop', 'redraw', 'omitted'):
                errors.append(f'{sid}: invalid evidence mode {mode!r}')
                continue
            if mode in ('redraw', 'omitted') and not str(e.get('reason', '')).strip():
                errors.append(f'{sid}: {mode} requires a reason')
            indices = e.get('element_indices', [])
            if not isinstance(indices, list) or any(not isinstance(i, int) or isinstance(i, bool) or i < 0 or i >= len(elements) for i in indices):
                errors.append(f'{sid}: invalid evidence element_indices')
                continue
            if mode in ('original', 'crop') and not any(elements[i].get('kind') == 'image' for i in indices):
                errors.append(f'{sid}: {mode} evidence requires an image element')
            if mode == 'redraw' and not indices:
                errors.append(f'{sid}: redraw requires associated elements')
            if mode == 'omitted':
                warnings.append(f'{sid}: {source} omitted: {e.get("reason", "")}')
            if mode == 'redraw':
                warnings.append(f'{sid}: verify redraw against {source}: {e.get("reason", "")}')
    if rendered:
        try:
            with ZipFile(workdir / 'output.pptx') as deck:
                ns = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'}
                for n, slide in enumerate(spec_list, 1):
                    expected_images = sum(e.get('kind') == 'image' for e in slide.get('elements', []))
                    xml = ElementTree.fromstring(deck.read(f'ppt/slides/slide{n}.xml'))
                    pictures = len(xml.findall('.//p:pic', ns))
                    if pictures < expected_images:
                        errors.append(f"{slide.get('id')}: PPTX contains {pictures} pictures; spec expects {expected_images}")
        except (OSError, BadZipFile, KeyError, ElementTree.ParseError) as e:
            errors.append(f'Unable to inspect rendered PPTX: {e}')
    for sid in slides.keys() - planned:
        warnings.append(f'{sid}: no matching outline slide')
    return {'ok': not errors, 'errors': errors, 'warnings': warnings,
            'note': 'Structural audit only; manually verify source fidelity, readability and numerical claims.'}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('workdir', type=Path)
    p.add_argument('--rendered', action='store_true', help='also inspect pictures in output.pptx')
    args = p.parse_args()
    try:
        result = audit(args.workdir.resolve(), args.rendered)
    except (OSError, ValueError, KeyError, TypeError) as e:
        print(json.dumps({'ok': False, 'errors': [str(e)]}, ensure_ascii=False, indent=2))
        sys.exit(2)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result['ok'] else 1)

if __name__ == '__main__':
    main()

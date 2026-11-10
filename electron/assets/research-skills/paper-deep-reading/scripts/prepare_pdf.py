#!/usr/bin/env python3
"""Extract page text/caption candidates and render reviewed PDF crops."""
import argparse, hashlib, json, re
from pathlib import Path

def main():
    p=argparse.ArgumentParser(description=__doc__); sub=p.add_subparsers(dest='command',required=True)
    i=sub.add_parser('inspect'); i.add_argument('pdf',type=Path);i.add_argument('--out',type=Path,required=True);i.add_argument('--render-pages',default='')
    c=sub.add_parser('crop');c.add_argument('pdf',type=Path);c.add_argument('--page',type=int,required=True);c.add_argument('--box',required=True);c.add_argument('--out',type=Path,required=True);c.add_argument('--dpi',type=int,default=180)
    a=p.parse_args()
    try: import pymupdf as fitz
    except ImportError: p.error('PyMuPDF is required: python3 -m pip install pymupdf')
    with fitz.open(a.pdf) as doc:
        if doc.needs_pass: p.error('Password-protected PDF requires an unlocked source.')
        if a.command=='crop':
            if not 1<=a.page<=len(doc):p.error('Page is outside the PDF.')
            try: box=fitz.Rect([float(v) for v in a.box.split(',')])
            except (ValueError,TypeError):p.error('Box must contain x0,y0,x1,y1.')
            page=doc[a.page-1]
            if box.is_empty or box.is_infinite or not page.rect.contains(box):p.error('Crop must be a nonempty rectangle inside the page.')
            if not 72<=a.dpi<=400:p.error('DPI must be between 72 and 400.')
            a.out.parent.mkdir(parents=True,exist_ok=True);page.get_pixmap(clip=box,dpi=a.dpi,alpha=False).save(a.out)
            print(json.dumps({'page':a.page,'box':list(box),'file':str(a.out),'dpi':a.dpi}));return
        a.out.mkdir(parents=True,exist_ok=True)
        selected={int(v) for v in a.render_pages.split(',') if v.strip()}
        if any(v<1 or v>len(doc) for v in selected):p.error('Requested render page is outside the PDF.')
        pages=[]
        for n,page in enumerate(doc,1):
            text=page.get_text(sort=True); textfile=f'page-{n:03d}.txt';(a.out/textfile).write_text(text,encoding='utf-8')
            candidates=[]
            for b in page.get_text('blocks'):
                if re.match(r'^\s*(?:Figure|Fig\.?|Table|图|表)\s*\d',b[4],re.I):candidates.append({'text':b[4].strip(),'caption_box':list(b[:4]),'decision':'unreviewed'})
            image=None
            if n in selected:
                image=f'page-{n:03d}.png';page.get_pixmap(dpi=110,alpha=False).save(a.out/image)
            pages.append({'page':n,'size':[page.rect.width,page.rect.height],'text':textfile,'render':image,'caption_candidates':candidates,'needs_ocr_review':not bool(text.strip())})
        result={'pdf':str(a.pdf.resolve()),'sha256':hashlib.sha256(a.pdf.read_bytes()).hexdigest(),'page_count':len(doc),'metadata':doc.metadata,'pages':pages,'note':'Caption candidates are not validated figure boundaries. Review page renders before cropping.'}
        (a.out/'inventory.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(f'Inspected {len(doc)} pages; {sum(len(x["caption_candidates"]) for x in pages)} caption candidates. Review inventory.json.')
if __name__=='__main__':main()

#!/usr/bin/env python3
"""Build bilingual Markdown and a self-contained reading page from report.json."""
import argparse, base64, hashlib, html, json, math, re, shutil, subprocess
from functools import lru_cache
import xml.etree.ElementTree as ET
from pathlib import Path

KATEX=None
@lru_cache(maxsize=256)
def render_math(latex,display=False):
    if not KATEX:raise ValueError('Mathematics requires --katex pointing to a local KaTeX module.')
    script='process.stdout.write(require(process.argv[1]).renderToString(process.argv[2],{displayMode:process.argv[3]==="1",throwOnError:true,output:"mathml"}))'
    return subprocess.check_output(['node','-e',script,KATEX,latex,'1' if display else '0'],text=True)

CORE=['overview','related-work','method','experiments','limitations','discussion','references']
def esc(s):return html.escape(str(s),quote=True)
def bilingual(v):
    if not isinstance(v,dict) or any(not isinstance(v.get(l),str) or not v[l].strip() for l in ['zh','en']):raise ValueError('Expected nonempty bilingual {zh, en} text.')
    return v

def inline(s):
    parts=[];end=0
    for m in re.finditer(r'\*\*([^*]+)\*\*|\[([^]]+)\]\((https?://[^\s)]+)\)|\$([^$]+)\$',str(s)):
        parts.append(esc(s[end:m.start()]));parts.append('<strong>'+esc(m[1])+'</strong>' if m[1] else '<a href="'+esc(m[3])+'" rel="noreferrer">'+esc(m[2])+'</a>' if m[2] else render_math(m[4]));end=m.end()
    return ''.join(parts)+esc(s[end:])

def text(v,tag='span',attrs=''):
    v=bilingual(v)
    return f'<{tag} data-zh="{esc(v["zh"])}" data-en="{esc(v["en"])}" {attrs}><span lang="zh-CN">{inline(v["zh"])}</span><span lang="en" hidden>{inline(v["en"])}</span></{tag}>'

def clean_svg(value):
    tree=ET.fromstring(value)
    if tree.tag.split('}')[-1]!='svg':raise ValueError('Mechanism frame must contain an SVG.')
    allowed={'svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','defs','marker','title','desc','linearGradient','radialGradient','stop','clipPath','use'}
    for node in tree.iter():
        if node.tag.split('}')[-1] not in allowed:raise ValueError('Unsupported or unsafe SVG element.')
        for k,v in node.attrib.items():
            key=k.split('}')[-1].lower()
            if key.startswith('on') or key=='style' or (key=='href' and not v.startswith('#')) or ('url(' in v and not re.fullmatch(r'url\(#[A-Za-z0-9_-]+\)',v)):raise ValueError('External resources, events and inline styles are not allowed in frame SVG.')
    return value

class Builder:
    def __init__(self,doc,base,out,katex):self.doc=doc;self.base=base;self.out=out;self.katex=katex;self.ids=set();self.md={'zh':[],'en':[]};self.asset_count=0
    def add_md(self,values):
        for lang in ['zh','en']:self.md[lang].append(values[lang])
    def ident(self,value):
        if not isinstance(value,str) or not re.fullmatch(r'[a-z][a-z0-9-]*',value) or value in self.ids:raise ValueError(f'Invalid or duplicate anchor: {value}')
        self.ids.add(value);return value
    def source(self,b):return text(b['source'],'p','class="source"')
    def block(self,b):
        t=b['type']; prefix=''
        if t in ['paragraph','note']:
            self.add_md(bilingual(b['text']));return text(b['text'],'p',f'class="{t}" data-kind="{t}"')
        if t=='heading':
            ident=self.ident(b['id']);self.add_md({l:'### '+bilingual(b['text'])[l] for l in ['zh','en']});return text(b['text'],'h3',f'id="{ident}" data-toc="2"')
        if t=='figure':
            path=(self.base/b['src']).resolve()
            if not path.is_relative_to(self.base.resolve()):raise ValueError('Figure must be inside the report source directory.')
            mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'}.get(path.suffix.lower())
            if not mime:raise ValueError('Use a PNG, JPEG, WebP or GIF figure.')
            data=path.read_bytes();name=hashlib.sha256(data).hexdigest()[:16]+path.suffix.lower();dest=self.out/'assets'/name;dest.parent.mkdir(parents=True,exist_ok=True)
            if path!=dest.resolve():shutil.copyfile(path,dest)
            alt=bilingual(b['alt']);caption=bilingual(b['caption']);source=bilingual(b['source']);self.asset_count+=1
            self.add_md({l:f'![{alt[l]}](assets/{name})\n\n{caption[l]}\n\n{source[l]}' for l in ['zh','en']})
            return f'<figure data-kind="figure"><button type="button" class="figure-open" data-figure-open><img loading="lazy" src="data:{mime};base64,{base64.b64encode(data).decode()}" alt="{esc(alt["zh"])}" data-alt-zh="{esc(alt["zh"])}" data-alt-en="{esc(alt["en"])}"></button>{text(caption,"figcaption")}{self.source(b)}</figure>'
        if t=='formula':
            if not self.katex:raise ValueError('Formula requires --katex pointing to a local KaTeX module.')
            latex=b['latex'];script='process.stdout.write(require(process.argv[1]).renderToString(process.argv[2],{displayMode:true,throwOnError:true,output:"mathml"}))'
            rendered=render_math(latex,True)
            explanation=bilingual(b['explanation']);self.add_md({l:'$$\n'+latex+'\n$$\n\n'+explanation[l] for l in ['zh','en']})
            return '<div class="formula" data-kind="formula">'+rendered+'</div>'+text(explanation,'p')
        if t=='details':
            title=bilingual(b['title']);body=bilingual(b['text']);self.add_md({l:'### '+title[l]+'\n\n'+body[l] for l in ['zh','en']});return '<details>'+text(title,'summary')+text(body,'p')+'</details>'
        if t=='table':
            headers=b['headers'];rows=b['rows'];caption=bilingual(b['caption']);source=bilingual(b['source'])
            def cell(v,tag):return text(v,tag) if isinstance(v,dict) else '<'+tag+'>'+esc(v)+'</'+tag+'>'
            if not headers or any(len(row)!=len(headers) for row in rows):raise ValueError('Table row widths must match headers.')
            for l in ['zh','en']:
                val=lambda v: bilingual(v)[l] if isinstance(v,dict) else str(v)
                line=lambda row:'| '+' | '.join(val(v).replace('|','\\|') for v in row)+' |'
                self.md[l].append(caption[l]+'\n\n'+line(headers)+'\n'+line(['---']*len(headers))+'\n'+'\n'.join(line(row) for row in rows)+'\n\n'+source[l])
            return '<figure data-kind="table">'+text(caption,'figcaption')+'<div class="table-scroll"><table><thead><tr>'+''.join(cell(v,'th') for v in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join(cell(v,'td') for v in row)+'</tr>' for row in rows)+'</tbody></table></div>'+self.source(b)+'</figure>'
        if t=='comparison':
            rows=b['rows'];unit=b['unit'];title=bilingual(b['title']);source=bilingual(b['source'])
            if not rows or any(not isinstance(r['value'],(float,int)) or isinstance(r['value'],bool) or not math.isfinite(r['value']) or r['value']<0 for r in rows):raise ValueError('Comparison values must be finite nonnegative numbers of the same metric.')
            maximum=max([r['value'] for r in rows]+[1]);bars=[]
            for row in rows:bars.append('<div class="bar-row">'+text(row['label'])+f'<div class="bar-track"><i style="width:{row["value"]/maximum*100:.4f}%"></i></div><b>{esc(row["value"])} {esc(unit)}</b></div>')
            self.add_md({l:'### '+title[l]+'\n\n'+'\n'.join('- '+bilingual(r['label'])[l]+': '+str(r['value'])+' '+unit for r in rows)+'\n\n'+source[l] for l in ['zh','en']})
            return '<div class="comparison" data-kind="comparison">'+text(title,'h4')+''.join(bars)+self.source(b)+'</div>'
        if t=='mechanism':
            frames=b['frames'];title=bilingual(b['title']);source=bilingual(b['source'])
            if len(frames)<2:raise ValueError('A mechanism requires at least two meaningful states.')
            rendered=[]
            for n,f in enumerate(frames):
                rendered.append(f'<div class="mechanism-frame" data-frame="{n}">'+text(f['title'],'h4')+clean_svg(f['svg'])+text(f['text'],'p')+'</div>')
            self.add_md({l:'### '+title[l]+'\n\n'+(('教学示意。' if l=='zh' else 'Illustrative example. ') if b.get('illustrative') else '')+'\n\n'.join(str(n+1)+'. '+bilingual(f['title'])[l]+': '+bilingual(f['text'])[l] for n,f in enumerate(frames))+'\n\n'+source[l] for l in ['zh','en']})
            controls=''.join(text({'zh':z,'en':e},'button',f'type="button" data-action="{a}"') for a,z,e in [('prev','上一步','Previous'),('play','播放','Play'),('next','下一步','Next'),('reset','重播','Replay'),('static','静态全览','Static view')])
            return '<div class="mechanism" data-kind="mechanism">'+text(title,'h4')+(text({'zh':'教学示意，非论文实测轨迹。','en':'Illustrative example, not an experimental trajectory.'},'p','class="source"') if b.get('illustrative') else '')+'<div class="mechanism-frames">'+''.join(rendered)+'</div><div class="mechanism-controls">'+controls+f'<input type="range" min="0" max="{len(frames)-1}" step="1" value="0" aria-label="回放进度" data-aria-zh="回放进度" data-aria-en="Replay progress"></div>'+self.source(b)+'</div>'
        raise ValueError(f'Unknown block type: {t}')
    def build(self):
        title=bilingual(self.doc['title']);subtitle=bilingual(self.doc['subtitle']);parts=[];nav=[]
        self.add_md({l:'# '+title[l]+'\n\n'+subtitle[l] for l in ['zh','en']})
        for section in self.doc['sections']:
            ident=self.ident(section['id']);name=bilingual(section['title']);self.add_md({l:'## '+name[l] for l in ['zh','en']})
            if not section['blocks']:raise ValueError(f'Empty section {ident}')
            blocks=''.join(self.block(b) for b in section['blocks'])
            parts.append(f'<section id="{ident}" data-section>'+text(name,'h2','data-toc="1"')+blocks+'</section>')
            nav.append(text(name,'a',f'href="#{ident}"'))
        template=(Path(__file__).resolve().parent.parent/'templates'/'reading_document.html').read_text(encoding='utf-8')
        result=template.replace('@@TITLE@@',esc(title['zh'])).replace('@@NAV@@',''.join(nav)).replace('@@HERO@@',text(title,'h1')+text(subtitle,'p','class="subtitle"')).replace('@@BODY@@',''.join(parts))
        self.out.mkdir(parents=True,exist_ok=True);(self.out/'paper_report.html').write_text(result,encoding='utf-8')
        for lang in ['zh','en']:(self.out/f'paper_report.{lang}.md').write_text('\n\n'.join(self.md[lang])+'\n',encoding='utf-8')
        report={'sections':len(parts),'original_figures':self.asset_count,'warnings':([] if self.asset_count else ['No original figures included: explain applicability and source availability.'])}
        (self.out/'build-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');return report

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('report',type=Path);p.add_argument('--out',type=Path,required=True);p.add_argument('--katex');p.add_argument('--allow-custom-sections',action='store_true');a=p.parse_args()
    try:
        global KATEX
        KATEX=a.katex
        doc=json.loads(a.report.read_text(encoding='utf-8'))
        if not a.allow_custom_sections and [s['id'] for s in doc['sections']]!=CORE:raise ValueError('Default sections must follow: '+', '.join(CORE))
        print(json.dumps(Builder(doc,a.report.parent,a.out,a.katex).build(),ensure_ascii=False,indent=2))
    except (ValueError,KeyError,OSError,subprocess.CalledProcessError,ET.ParseError) as e:p.exit(1,f'Build failed: {e}\n')
if __name__=='__main__':main()

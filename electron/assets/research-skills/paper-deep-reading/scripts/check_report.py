#!/usr/bin/env python3
"""Audit offline assets and navigation; content depth still requires source review."""
import argparse,json,re,subprocess,tempfile
from html.parser import HTMLParser
from pathlib import Path
class Audit(HTMLParser):
    def __init__(self):super().__init__();self.ids=[];self.links=[];self.errors=[];self.figures=0;self.resources=[];self.in_script=False;self.scripts=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.append(a['id'])
        if tag=='a' and a.get('href','').startswith('#'):self.links.append(a['href'][1:])
        if tag=='img' and a.get('data-alt-zh'):self.figures+=1
        if (tag in ['script','img','iframe','audio','video','source'] and a.get('src')):self.resources.append(a['src'])
        if tag=='link' and a.get('href'):self.resources.append(a['href'])
        if tag=='script':self.in_script=True;self.scripts.append('')
        for prefix in ['data-','data-alt-','data-aria-']:
            if (prefix+'zh' in a)!=(prefix+'en' in a):self.errors.append('Incomplete bilingual attributes: '+tag)
    def handle_endtag(self,tag):
        if tag=='script':self.in_script=False
    def handle_data(self,data):
        if self.in_script:self.scripts[-1]+=data

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('html',type=Path);a=p.parse_args();source=a.html.read_text(encoding='utf-8');audit=Audit();audit.feed(source)
    errors=audit.errors;warnings=[]
    if len(set(audit.ids))!=len(audit.ids):errors.append('Duplicate IDs.')
    errors.extend('Broken anchor: '+link for link in audit.links if link not in audit.ids)
    errors.extend('Nonembedded runtime resource: '+r for r in audit.resources if not r.startswith('data:'))
    if re.search(r'@import\b|url\(\s*[\x22\x27]?(?:https?:|//)',source,re.I):errors.append('External CSS runtime resource.')
    if '@@' in source:errors.append('Unfilled template markers.')
    if not audit.figures:warnings.append('No original figures: verify applicability and explain extraction limits.')
    if not all(v in audit.ids for v in ['related-work','method','experiments','limitations']):warnings.append('Custom/missing core sections: confirm explicit user preference.')
    if '<math' not in source and ('\\frac' in source or '$$' in source):warnings.append('Possible unrendered mathematics.')
    for script in audit.scripts:
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'script.js';path.write_text(script,encoding='utf-8')
            try:r=subprocess.run(['node','--check',str(path)],text=True,capture_output=True)
            except FileNotFoundError:errors.append('Node required for script syntax checks.');break
            if r.returncode:errors.append(r.stderr.strip())
    print(json.dumps({'passed':not errors,'errors':errors,'warnings':warnings,'figures':audit.figures,'note':'Does not verify scientific accuracy or visual rendering.'},ensure_ascii=False,indent=2))
    raise SystemExit(1 if errors else 0)
if __name__=='__main__':main()

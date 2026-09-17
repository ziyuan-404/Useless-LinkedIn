"""Dependency-light full HTML extraction and real YAML parsing for Node tools."""
import sys, json, re
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
from html.parser import HTMLParser
from pathlib import Path
class Extract(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.skip=0; self.script=None; self.text=[]; self.links=[]; self.schemas=[]; self.link=None; self.title=False; self.titles=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in ('script','style','noscript'):
            self.skip+=1
            if tag=='script' and a.get('type')=='application/ld+json': self.script=[]
        if tag=='title': self.title=True
        if tag=='a': self.link={'url':a.get('href',''),'title':''}
        # Indeed cards include role=button anchors with opaque advertising hrefs.
        if tag in ('a','button') and re.fullmatch(r'sj_[0-9a-f]{16}',a.get('id','')):
            self.link={'url':'/viewjob?jk='+a['id'][3:],'title':''}
        if tag in ('p','div','li','h1','h2','h3','br'): self.text.append('\n')
    def handle_data(self,data):
        if self.script is not None: self.script.append(data)
        if self.title: self.titles.append(data)
        if not self.skip: self.text.append(data)
        if self.link is not None: self.link['title']+=data
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript'):
            if tag=='script' and self.script is not None:
                try: self.schemas.append(json.loads(''.join(self.script)))
                except ValueError: pass
                self.script=None
            self.skip=max(0,self.skip-1)
        if tag=='title': self.title=False
        if tag in ('a','button') and self.link is not None: self.links.append(self.link); self.link=None
def walk(x):
    if isinstance(x,list):
        for v in x: yield from walk(v)
    elif isinstance(x,dict):
        if x.get('@type')=='JobPosting' or 'JobPosting' in (x.get('@type') or []) : yield x
        for k,v in x.items():
            if isinstance(v,(list,dict)): yield from walk(v)
if sys.argv[1]=='yaml':
    sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'vendor'))
    import yaml
    print(json.dumps(yaml.safe_load(sys.stdin.read()),ensure_ascii=False))
else:
    e=Extract(); e.feed(sys.stdin.read())
    text=re.sub(r'[ \t]+',' ',''.join(e.text)); text=re.sub(r'\n\s*\n','\n',text).strip()
    print(json.dumps({'text':text,'title':''.join(e.titles),'links':e.links,'jobs':list(walk(e.schemas))},ensure_ascii=False))

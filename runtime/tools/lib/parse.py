"""Dependency-light full HTML extraction and real YAML parsing for Node tools."""
import sys, json, re
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
from html.parser import HTMLParser
class Extract(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.skip=0; self.script=None; self.text=[]; self.links=[]; self.embeds=[]; self.schemas=[]; self.link=None; self.title=False; self.titles=[]; self.h1=False; self.headings=[]; self.feeds=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in ('iframe','script') and a.get('src'): self.embeds.append({'url':a['src'],'tag':tag})
        if tag in ('script','style','noscript'):
            self.skip+=1
            if tag=='script' and (a.get('type') in ('application/ld+json','application/json') or a.get('id')=='__NEXT_DATA__'): self.script=[]
        if tag=='title': self.title=True
        if tag=='h1': self.h1=True
        if tag=='link' and a.get('type') in ('application/rss+xml','application/atom+xml'): self.feeds.append(a.get('href',''))
        if tag=='a': self.link={'url':a.get('href',''),'title':'','rel':a.get('rel',''),'label':a.get('aria-label','')}
        if tag=='link' and 'next' in a.get('rel','').split(): self.links.append({'url':a.get('href',''),'title':'','rel':'next'})
        # Indeed cards include role=button anchors with opaque advertising hrefs.
        if tag in ('a','button') and re.fullmatch(r'sj_[0-9a-f]{16}',a.get('id','')):
            self.link={'url':'/viewjob?jk='+a['id'][3:],'title':''}
        if tag in ('p','div','li','h1','h2','h3','br'): self.text.append('\n')
    def handle_data(self,data):
        if self.script is not None: self.script.append(data)
        if self.title: self.titles.append(data)
        if self.h1: self.headings.append(data)
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
        if tag=='h1': self.h1=False
        if tag in ('a','button') and self.link is not None: self.links.append(self.link); self.link=None
def walk(x):
    if isinstance(x,list):
        for v in x: yield from walk(v)
    elif isinstance(x,dict):
        kind=x.get('@type')
        if kind=='JobPosting' or isinstance(kind,list) and 'JobPosting' in kind: yield x
        for k,v in x.items():
            if isinstance(v,(list,dict)): yield from walk(v)
if sys.argv[1]=='xml':
    import xml.etree.ElementTree as ET
    raw=sys.stdin.read()
    if re.search(r'<!DOCTYPE|<!ENTITY',raw,re.I): raise ValueError('DTD and entities are not supported')
    tree=ET.fromstring(raw)
    local=lambda tag: tag.split('}')[-1]
    value=lambda el,tag: next((''.join(x.itertext()).strip() for x in el if local(x.tag)==tag),'')
    entries=[]
    for el in tree.iter():
        kind=local(el.tag)
        if kind in ('url','sitemap'): entries.append({'url':value(el,'loc'),'lastmod':value(el,'lastmod'),'kind':'sitemap' if kind=='sitemap' else 'detail'})
        if kind in ('item','entry'):
            url=value(el,'link') if kind=='item' else next((x.get('href') for x in el if local(x.tag)=='link' and x.get('rel','alternate')=='alternate'),'')
            entries.append({'url':url,'title':value(el,'title'),'kind':'detail'})
    print(json.dumps({'kind':local(tree.tag),'entries':entries},ensure_ascii=False))
elif sys.argv[1]=='yaml':
    import yaml
    print(json.dumps(yaml.safe_load(sys.stdin.read()),ensure_ascii=False))
else:
    e=Extract(); e.feed(sys.stdin.read())
    text=re.sub(r'[ \t]+',' ',''.join(e.text)); text=re.sub(r'\n\s*\n','\n',text).strip()
    print(json.dumps({'text':text,'title':''.join(e.titles),'heading':''.join(e.headings),'links':e.links,'embeds':e.embeds,'feeds':e.feeds,'jobs':list(walk(e.schemas))},ensure_ascii=False))

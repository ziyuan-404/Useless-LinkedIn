import sys, json, hashlib
import re
from collections import Counter
from PIL import Image, ImageDraw
from pathlib import Path
from pypdf import PdfReader, PdfWriter
import pypdfium2 as pdfium
base=Path(sys.argv[1]); results=[]; texts=[]; previews=[]
mapping=base/'work'/'expected-files.json'
expected_files=json.loads(mapping.read_text(encoding='utf-8')) if mapping.exists() else {}
for p in base.glob('*.pdf'):
    original=PdfReader(p); text='\n'.join(page.extract_text() or '' for page in original.pages)
    if len(original.pages)!=1: raise ValueError(f'{p.name}: expected one page')
    box=original.pages[0].mediabox
    if abs(float(box.width)-595.28)>2 or abs(float(box.height)-841.89)>2: raise ValueError(f'{p.name}: expected A4 page dimensions')
    if any(s in text for s in ['VERSION DE TEST','{{']): raise ValueError('Stale content')
    kind=expected_files.get(p.name,'cv' if '-CV-' in p.name else 'letter')
    expected=base/'work'/f'{kind}-expected.txt'
    if expected.exists():
        # Positioned dates and columns can change PDF extraction order; preserve every word/number and its count.
        normalize=lambda x: Counter(re.findall(r'\w+',x))
        if normalize(expected.read_text(encoding='utf-8'))!=normalize(text): raise ValueError(f'{p.name}: HTML/PDF text mismatch')
    (base/'work'/f'{p.stem}-text.txt').write_text(text,encoding='utf-8')
    texts.append({'file':p.name,'text':text})
    writer=PdfWriter(); writer.clone_document_from_reader(original)
    for page in writer.pages:
        for image in list(page.images):
            photo=image.image.convert('RGB'); photo.thumbnail((800,1000)); image.replace(photo,quality=88,optimize=True)
        page.compress_content_streams()
    temp=p.with_suffix('.tmp.pdf')
    with temp.open('wb') as stream: writer.write(stream)
    final=PdfReader(temp)
    if '\n'.join(page.extract_text() or '' for page in final.pages)!=text: raise ValueError('Compression changed text')
    if temp.stat().st_size>=3_000_000: raise ValueError('PDF exceeds 3MB')
    temp.replace(p)
    doc=pdfium.PdfDocument(str(p)); page=doc[0]; bitmap=page.render(scale=1.5); bitmap.to_pil().save(base/'work'/f'{p.stem}-pdf.png'); bitmap.close(); page.close(); doc.close()
    previews.append(base/'work'/f'{p.stem}-pdf.png')
    results.append({'file':p.name,'pages':1,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
if len(results)!=2: raise ValueError('Expected CV and letter')
(base/'work'/'qa.json').write_text(json.dumps({'state':'pending-visual-review','files':results},indent=2),encoding='utf-8')
(base/'work'/'review.json').write_text(json.dumps({'state':'pending-visual-review','files':results,'texts':texts,'instructions':'Verify every claim against its sources and inspect review.png; full-resolution PDF screenshots remain available. Machine QA does not approve the material.'},ensure_ascii=False,indent=2),encoding='utf-8')
images=[]
for file in previews:
    with Image.open(file) as original:
        image=original.convert('RGB'); image.thumbnail((1000,1500)); images.append(image)
sheet=Image.new('RGB',(sum(i.width for i in images),max(i.height for i in images)+28),'white'); draw=ImageDraw.Draw(sheet); x=0
for i,image in enumerate(images):
    draw.text((x+8,8),results[i]['file'].encode('ascii','replace').decode('ascii'),fill='black');sheet.paste(image,(x,28));x+=image.width
sheet.save(base/'work'/'review.png')
print(json.dumps(results))

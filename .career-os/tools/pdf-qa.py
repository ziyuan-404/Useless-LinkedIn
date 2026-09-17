import sys, json, hashlib
from pathlib import Path
from pypdf import PdfReader, PdfWriter
import pypdfium2 as pdfium
base=Path(sys.argv[1]); results=[]
for p in base.glob('*.pdf'):
    original=PdfReader(p); text='\n'.join(page.extract_text() or '' for page in original.pages)
    if len(original.pages)!=1: raise ValueError(f'{p.name}: expected one page')
    if any(s in text for s in ['VERSION DE TEST','{{']): raise ValueError('Stale content')
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
    results.append({'file':p.name,'pages':1,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
if len(results)!=2: raise ValueError('Expected CV and letter')
(base/'work'/'qa.json').write_text(json.dumps({'state':'pending-visual-review','files':results},indent=2),encoding='utf-8')
print(json.dumps(results))

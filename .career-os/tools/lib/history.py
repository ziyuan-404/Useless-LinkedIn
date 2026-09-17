"""Read-only Excel posting URLs. No workbook serialization or layout changes."""
import sys,json,re,zipfile,html
sys.stdout.reconfigure(encoding='utf-8')
with zipfile.ZipFile(sys.argv[1]) as z:
    urls=set()
    for name in z.namelist():
        if name.endswith(('.xml','.rels')):
            text=z.read(name).decode('utf-8')
            for u in re.findall(r'https?://[^<\s"\']+',text): urls.add(html.unescape(u))
print(json.dumps(sorted(urls),ensure_ascii=False))

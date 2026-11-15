"""Empacota uma pasta descompactada num .docx (Content_Types primeiro)."""
import sys, zipfile
from pathlib import Path
src, dst = Path(sys.argv[1]), sys.argv[2]
arqs = sorted(p for p in src.rglob("*") if p.is_file())
arqs.sort(key=lambda p: (p.name != "[Content_Types].xml", str(p)))
with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
    for p in arqs:
        z.write(p, p.relative_to(src).as_posix())
print(dst, len(arqs), "arquivos")

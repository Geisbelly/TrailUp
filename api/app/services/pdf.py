from __future__ import annotations

import html
import re

_BG = "#111936"
_SURFACE = "#292C44"
_SURFACE_ELEVATED = "#211D5F"
_PRIMARY = "#C99F58"
_PRIMARY_GLOW = "rgba(201, 159, 88, 0.22)"
_BORDER = "#1A1A33"
_TEXT = "#F2F7FA"
_MUTED = "#B9C2D3"
_FONT_TITLE = "Poppins-ExtraBold, 'Poppins', sans-serif"
_FONT_BODY = "Inter-Medium, 'Inter', sans-serif"


def _resolve_pdf_palette(tema_visual: dict | None) -> dict[str, str]:
    cores = tema_visual.get("cores") if isinstance(tema_visual, dict) and isinstance(tema_visual.get("cores"), dict) else {}
    primary = str(cores.get("primaria") or _PRIMARY)
    secondary = str(cores.get("secundaria") or _SURFACE)
    accent = str(cores.get("destaque") or _PRIMARY)
    return {
        "bg": _BG,
        "surface": secondary,
        "surface_elevated": _SURFACE_ELEVATED,
        "primary": primary,
        "accent": accent,
        "border": _BORDER,
        "text": _TEXT,
        "muted": _MUTED,
    }


def render_pdf_html(
    *,
    titulo: str,
    resumo: str,
    secoes: list[str],
    tema_visual: dict | None = None,
) -> str:
    palette = _resolve_pdf_palette(tema_visual)
    secoes_html = "".join(
        f"""
        <div class="section">
          <div class="section-marker"></div>
          <p class="section-text">{html.escape(str(secao))}</p>
        </div>"""
        for secao in secoes
    )

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(titulo)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@800&family=Inter:wght@500&display=swap');

    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

    body {{
      background-color: {palette["bg"]};
      color: {palette["text"]};
      font-family: {_FONT_BODY};
      font-size: 15px;
      line-height: 1.6;
      padding: 24px 20px 48px;
      min-height: 100vh;
    }}

    .header {{
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 28px;
    }}

    .logo-hex {{
      width: 40px;
      height: 40px;
      background: {palette["accent"]};
      clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 0 12px {_PRIMARY_GLOW};
    }}

    .logo-hex span {{ font-size: 18px; }}
    .brand {{ font-family: {_FONT_TITLE}; font-size: 13px; color: {palette["primary"]}; letter-spacing: 2px; text-transform: uppercase; }}

    .title-card {{
      background: {palette["surface_elevated"]};
      border: 1.5px solid {palette["primary"]};
      border-radius: 12px;
      padding: 20px 20px 18px;
      margin-bottom: 20px;
      box-shadow: 0 0 18px {_PRIMARY_GLOW};
    }}

    h1 {{
      font-family: {_FONT_TITLE};
      font-size: 22px;
      color: {palette["text"]};
      line-height: 1.3;
      margin-bottom: 12px;
    }}

    .resumo {{
      color: {palette["muted"]};
      font-size: 14px;
      line-height: 1.6;
      border-left: 3px solid {palette["primary"]};
      padding-left: 12px;
    }}

    .sections-label {{
      font-family: {_FONT_TITLE};
      font-size: 11px;
      color: {palette["primary"]};
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 12px;
      margin-top: 4px;
    }}

    .section {{
      background: {palette["surface"]};
      border: 1px solid {palette["border"]};
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 10px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }}

    .section-marker {{
      width: 8px;
      height: 8px;
      background: {palette["accent"]};
      clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
      flex-shrink: 0;
      margin-top: 5px;
      box-shadow: 0 0 6px {_PRIMARY_GLOW};
    }}

    .section-text {{
      color: {palette["text"]};
      font-size: 14px;
      line-height: 1.55;
    }}

    .footer {{
      margin-top: 36px;
      text-align: center;
      font-size: 11px;
      color: {palette["muted"]};
      letter-spacing: 1px;
      text-transform: uppercase;
    }}

    .footer strong {{ color: {palette["primary"]}; }}
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-hex"><span>★</span></div>
    <span class="brand">TrailUp</span>
  </div>

  <div class="title-card">
    <h1>{html.escape(titulo)}</h1>
    <p class="resumo">{html.escape(resumo)}</p>
  </div>

  <p class="sections-label">Conteúdo do módulo</p>
  {secoes_html}

  <div class="footer"><strong>TrailUp</strong> · Material personalizado</div>
</body>
</html>""".strip()


async def gerar_pdf(html_content: str) -> bytes:
    source = str(html_content or "")
    body_match = re.search(r"<body[^>]*>(.*?)</body>", source, flags=re.I | re.S)
    if body_match:
        source = body_match.group(1)

    source = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", source)
    source = re.sub(r"(?i)<br\s*/?>", "\n", source)
    source = re.sub(r"(?i)</(p|div|h1|h2|h3|h4|li|section|article|tr|td|th)>", "\n", source)
    source = re.sub(r"<[^>]+>", " ", source)
    source = html.unescape(source)

    raw_lines = [re.sub(r"\s+", " ", line).strip() for line in source.splitlines()]
    raw_lines = [line for line in raw_lines if line]
    if not raw_lines:
        raw_lines = ["Material TrailUp"]

    lines: list[str] = []
    for base_line in raw_lines:
        current = ""
        for word in base_line.split(" "):
            candidate = f"{current} {word}".strip()
            if len(candidate) > 88 and current:
                lines.append(current)
                current = word
            else:
                current = candidate
        if current:
            lines.append(current)

    escaped_lines = [line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in lines[:48]]
    content_lines = ["BT", "/F1 12 Tf", "14 TL", "50 800 Td"]
    for index, line in enumerate(escaped_lines):
        if index > 0:
            content_lines.append("T*")
        content_lines.append(f"({line}) Tj")
    content_lines.append("ET")
    content_stream = "\n".join(content_lines).encode("latin-1", errors="ignore")

    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
        f"4 0 obj << /Length {len(content_stream)} >> stream\n".encode("latin-1") + content_stream + b"\nendstream endobj",
        b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf))
        pdf.extend(obj + b"\n")

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))
    pdf.extend(
        (
            f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF"
        ).encode("latin-1")
    )
    return bytes(pdf)

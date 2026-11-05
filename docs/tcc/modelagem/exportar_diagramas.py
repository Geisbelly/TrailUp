"""Exporta e valida os diagramas Mermaid de docs/tcc/modelagem/ para img/*.svg.

Uso, a partir da raiz do repositório:
    python3 docs/tcc/modelagem/exportar_diagramas.py

Precisa de Node (usa `npx @mermaid-js/mermaid-cli`). Se o Chrome do sistema
existir, usa ele, em vez de baixar o Chromium do puppeteer.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

PASTA = Path(__file__).resolve().parent
SAIDA = PASTA / "img"
CHROME_MAC = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
_BLOCO = re.compile(r"```mermaid\n(.*?)```", re.S)


def main() -> int:
    SAIDA.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        config = tmp_path / "puppeteer.json"
        opcoes: dict[str, object] = {"args": ["--no-sandbox"]}
        if os.path.exists(CHROME_MAC):
            opcoes["executablePath"] = CHROME_MAC
        config.write_text(json.dumps(opcoes), encoding="utf-8")
        env = {**os.environ, "PUPPETEER_SKIP_DOWNLOAD": "1"} if os.path.exists(CHROME_MAC) else None

        total = 0
        for capitulo in sorted(PASTA.glob("0*.md")):
            prefixo = capitulo.name[:2]
            for ordem, bloco in enumerate(_BLOCO.findall(capitulo.read_text(encoding="utf-8")), start=1):
                nome = f"{prefixo}-{ordem:02d}"
                entrada = tmp_path / f"{nome}.mmd"
                entrada.write_text(bloco, encoding="utf-8")
                resultado = subprocess.run(
                    [
                        "npx", "-y", "@mermaid-js/mermaid-cli@11", "-q",
                        "-p", str(config), "-b", "white",
                        "-i", str(entrada), "-o", str(SAIDA / f"{nome}.svg"),
                    ],
                    capture_output=True, text=True, env=env,
                )
                if resultado.returncode != 0:
                    print(f"ERRO em {capitulo.name}, diagrama {ordem}:\n{resultado.stderr}", file=sys.stderr)
                    return 1
                total += 1
        print(f"{total} diagramas exportados para {SAIDA.relative_to(Path.cwd()) if SAIDA.is_relative_to(Path.cwd()) else SAIDA}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

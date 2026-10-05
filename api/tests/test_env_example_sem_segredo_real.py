"""Guard: nenhum `.env.example` do monorepo carrega credencial real.

Motivacao concreta: `api/.env.example` ficou com a `SUPABASE_ANON_KEY` de
producao completa, valida ate 2036, enquanto o mesmo arquivo mantinha
`SUPABASE_SERVICE_KEY=` em branco e `SUPABASE_JWT_SECRET=replace-me`. A
convencao estava certa; so aquela linha escapou dela.

A chave `anon` e publica por design — ela vai no bundle do mobile e do web, e
quem autoriza e a RLS, nao o segredo dela. O problema nao e o poder da chave, e
o arquivo: `.env.example` e documentacao, e copiar valor real para dentro dele
faz o segredo viajar junto com o repositorio (fork, espelho, repo que deixa de
ser privado) sem ninguem decidir isso.

O teste distingue valor real de placeholder DECODIFICANDO: um JWT de verdade tem
tres segmentos e o primeiro e um JSON base64url valido. Placeholders como
`eyJhbGciOi...` (usado em `brainhexpdf/.env.example`) nao passam por isso, e
continuam permitidos de proposito — eles comunicam o formato esperado.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

IGNORADOS = {"node_modules", ".git", "dist", "build", ".venv", "venv", "__pycache__"}


def _arquivos_de_exemplo() -> list[Path]:
    achados = [
        caminho
        for caminho in ROOT.rglob("*.env.example")
        if not IGNORADOS & set(caminho.relative_to(ROOT).parts)
    ]
    achados += [
        caminho
        for caminho in ROOT.rglob(".env.example")
        if not IGNORADOS & set(caminho.relative_to(ROOT).parts)
    ]
    return sorted(set(achados))


def _e_jwt_de_verdade(valor: str) -> bool:
    partes = valor.split(".")
    if len(partes) != 3 or not all(partes):
        return False
    cru = partes[0]
    cru += "=" * (-len(cru) % 4)
    try:
        cabecalho = json.loads(base64.urlsafe_b64decode(cru))
    except Exception:
        return False
    return isinstance(cabecalho, dict) and "alg" in cabecalho


def test_env_example_existe_para_ser_verificado() -> None:
    """Sem isto o teste passaria por nao encontrar arquivo nenhum."""
    arquivos = _arquivos_de_exemplo()
    assert arquivos, "nenhum .env.example encontrado — o glob quebrou"
    relativos = {str(caminho.relative_to(ROOT)) for caminho in arquivos}
    assert "api/.env.example" in relativos


def test_nenhum_env_example_tem_token_real() -> None:
    vazamentos: list[str] = []

    for caminho in _arquivos_de_exemplo():
        texto = caminho.read_text(encoding="utf-8", errors="replace")
        for numero, linha in enumerate(texto.splitlines(), start=1):
            crua = linha.strip()
            if crua.startswith("#") or "=" not in crua:
                continue
            chave, valor = crua.split("=", 1)
            valor = valor.strip().strip("\"'")
            if _e_jwt_de_verdade(valor):
                # Nunca imprime o token: so onde ele esta e de quem e.
                vazamentos.append(
                    f"{caminho.relative_to(ROOT)}:{numero} — {chave.strip()}"
                )

    assert not vazamentos, (
        "credencial real (JWT decodificavel) versionada em arquivo de exemplo; "
        "troque por placeholder ou deixe em branco:\n  " + "\n  ".join(vazamentos)
    )

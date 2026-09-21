#!/usr/bin/env python3
"""Sobe a arte de combate (boss, cenario, moldura) para o Cloudflare R2.

Uso:
    python scripts/subir-arte-de-combate.py --dry-run
    python scripts/subir-arte-de-combate.py

Ambiente (nenhum valor fica no repositorio):
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

Depois de subir, aponte a API para a base publica do bucket:
    ARTE_BASE_URL=https://pub-<hash>.r2.dev

**A lista de arquivos sai do catalogo**, nunca de um `listdir`. E' isso que
impede a arte e o codigo de divergirem: se `arte_combate._ARTE_POR_PRESET`
ganhar um preset novo e ninguem exportar a peca, o script recusa a rodar e diz
qual arquivo falta — em vez de subir um conjunto incompleto que so' aparece
como imagem quebrada no aparelho do aluno.

Por que R2 e nao Supabase Storage: o projeto esta em overage de egress e o
Storage e 99,9% dele (ver docs/superpowers/specs/2026-08-29-r2-gateway-design.md).
Arte e' o tipo de arquivo que o aluno baixa toda sessao — poe-lo no Storage
seria acelerar o 402.

Idempotente: relanca a vontade. O PUT sobrescreve o objeto com o mesmo nome.
"""

from __future__ import annotations

import argparse
import asyncio
import mimetypes
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "api"))

from app.services import arte_combate  # noqa: E402
from app.services.r2_storage import ConfigR2, enviar_para_r2, ler_config_r2  # noqa: E402

DIR_ARTE = RAIZ / "api" / "app" / "assets" / "combate"


class _SettingsDoAmbiente:
    """So' o que `ler_config_r2` exige, lido do ambiente."""

    def __init__(self) -> None:
        import os

        self.r2_account_id = os.getenv("R2_ACCOUNT_ID")
        self.r2_access_key_id = os.getenv("R2_ACCESS_KEY_ID")
        self.r2_secret_access_key = os.getenv("R2_SECRET_ACCESS_KEY")
        self.r2_bucket = os.getenv("R2_BUCKET")


def chaves_do_catalogo() -> list[str]:
    """Toda chave relativa que o catalogo referencia, sem repetir."""
    chaves: set[str] = set()
    for preset in arte_combate.PRESETS_CONHECIDOS:
        arte = arte_combate.arte_do_preset(preset)
        for chave in (arte.avatar, arte.fundo, arte.moldura, arte.efeito):
            if chave:
                chaves.add(chave)
    return sorted(chaves)


def conferir_arquivos(chaves: list[str]) -> list[tuple[str, Path]]:
    """Casa chave -> arquivo local. Aborta se faltar qualquer um."""
    pares: list[tuple[str, Path]] = []
    faltando: list[str] = []
    for chave in chaves:
        # A chave ja comeca com "combate/", e DIR_ARTE termina nela.
        relativo = chave[len("combate/") :] if chave.startswith("combate/") else chave
        caminho = DIR_ARTE / relativo
        if caminho.is_file():
            pares.append((chave, caminho))
        else:
            faltando.append(f"{chave}  ->  {caminho}")
    if faltando:
        print("[erro] o catalogo referencia peca que nao existe no repositorio:")
        for linha in faltando:
            print(f"  - {linha}")
        raise SystemExit(2)
    return pares


async def subir(cfg: ConfigR2, pares: list[tuple[str, Path]]) -> None:
    for chave, caminho in pares:
        corpo = caminho.read_bytes()
        tipo = mimetypes.guess_type(caminho.name)[0] or "application/octet-stream"
        await enviar_para_r2(cfg, chave, corpo, tipo)
        print(f"  ok  {chave}  ({len(corpo) / 1024:.0f} KB, {tipo})")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="so lista o que subiria")
    args = parser.parse_args()

    chaves = chaves_do_catalogo()
    pares = conferir_arquivos(chaves)
    total_kb = sum(caminho.stat().st_size for _, caminho in pares) / 1024
    print(f"{len(pares)} pecas, {total_kb:.0f} KB no total")

    if args.dry_run:
        for chave, caminho in pares:
            print(f"  -   {chave}  ({caminho.stat().st_size / 1024:.0f} KB)")
        print("\n[dry-run] nada foi enviado")
        return 0

    cfg = ler_config_r2(_SettingsDoAmbiente())
    if cfg is None:
        print(
            "[erro] R2 incompleto. Exporte as quatro: "
            "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET"
        )
        return 2

    print(f"destino: bucket {cfg.bucket}")
    asyncio.run(subir(cfg, pares))
    print(
        "\nPronto. Agora aponte a API para a base publica do bucket:\n"
        "  ARTE_BASE_URL=https://pub-<hash>.r2.dev"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

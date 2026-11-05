"""Revisão informada pelo deploy, sem inferir pelo checkout ou versão do pipeline."""

import os
import re
from pathlib import Path

# Gravado no Dockerfile, fora de /app porque em dev o compose sobrepõe essa pasta com um volume.
CARIMBO_DA_IMAGEM = Path("/opt/trailup-imagem")


def get_build_commit() -> str | None:
    value = os.environ.get("TRAILUP_BUILD_COMMIT", "").strip()
    return value.lower() if re.fullmatch(r"[0-9a-fA-F]{40}", value) else None


def get_image_stamp() -> str | None:
    """Muda a cada imagem nova e sobrevive a restart: é o que separa deploy de crash no monitor."""
    try:
        value = CARIMBO_DA_IMAGEM.read_text(encoding="utf-8").strip().lower()
    except OSError:
        return None
    return value if re.fullmatch(r"[0-9a-f]{16,40}", value) else None

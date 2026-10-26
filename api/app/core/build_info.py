"""Revisão informada pelo deploy, sem inferir pelo checkout ou versão do pipeline."""

import os
import re


def get_build_commit() -> str | None:
    value = os.environ.get("TRAILUP_BUILD_COMMIT", "").strip()
    return value.lower() if re.fullmatch(r"[0-9a-fA-F]{40}", value) else None

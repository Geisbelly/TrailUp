"""A assinatura editorial do perfil vive em dois lugares e tem de ser a mesma.

O Python (`_BRAINHEX_EDITORIAL_SIGNATURES`) é usado pelo fallback de geração, pelas falas do boss e
pelas notificações; o microservice lê a cópia em `microservice/src/constants/editorialSignatures.json`
para montar o prompt do texto e do áudio. Mudou de um lado só, este teste quebra.
"""

import json
from pathlib import Path

from app.services.personalizacao import _BRAINHEX_EDITORIAL_SIGNATURES

API_ROOT = Path(__file__).resolve().parents[1]
JSON_DO_MICROSERVICE = API_ROOT.parent / "microservice/src/constants/editorialSignatures.json"


def test_assinatura_do_microservice_e_a_mesma_do_python() -> None:
    copia = json.loads(JSON_DO_MICROSERVICE.read_text(encoding="utf-8"))
    assert copia == _BRAINHEX_EDITORIAL_SIGNATURES

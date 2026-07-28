"""Contrato de versão entre a API orquestradora e o gerador de mídias.

Alterações em prompts, enriquecimento ou renderização precisam mudar
``MEDIA_PIPELINE_VERSION`` para invalidar o ``source_hash``. A versão do engine
de apresentação também é validada antes de disparar qualquer geração, evitando
que um deploy antigo produza e persista novamente o layout legado.
"""

MEDIA_PIPELINE_VERSION = "2026-07-28.3"
PRESENTATION_ENGINE_VERSION = "puppeteer-html-v2"

"""Contrato de versão entre a API orquestradora e o gerador de mídias.

Alterações em prompts, enriquecimento ou renderização precisam mudar
``MEDIA_PIPELINE_VERSION`` para invalidar o ``source_hash``. As versões do engine
e do design de apresentação também são validadas antes de disparar qualquer
geração, evitando que um deploy antigo produza ou preserve o layout legado.
"""

MEDIA_PIPELINE_VERSION = "2026-07-28.9"
PRESENTATION_ENGINE_VERSION = "puppeteer-html-v3"
PRESENTATION_DESIGN_VERSION = "slidesgo-editorial-v3"
CONTENT_ENRICHMENT_PROVIDER = "openai"

"""Contrato de versão entre a API orquestradora e o gerador de mídias.

Alterações em prompts, enriquecimento ou renderização precisam mudar
``MEDIA_PIPELINE_VERSION`` para invalidar o ``source_hash``. As versões do engine
e do design de apresentação também são validadas antes de disparar qualquer
geração, evitando que um deploy antigo produza ou preserve o layout legado.
"""

MEDIA_PIPELINE_VERSION = "2026-09-27.1"
PRESENTATION_ENGINE_VERSION = "brainhexpdf-v1"
# v4 = deck HTML da #863. Espelho de microservice/src/constants/pipelineVersions.ts:
# o health do microservice tem de devolver o mesmo valor, senao a API recusa gerar.
PRESENTATION_DESIGN_VERSION = "trailup-deck-v4"

# O que entra no `source_hash` NAO acompanha as duas versoes do deck: elas ja sao
# conferidas no `metadata` da apresentacao (`_motivo_da_midia_incompleta`,
# `reusablePresentationPartes`), e so a apresentacao e' refeita quando mudam.
# No hash, mudar a versao do deck trocava a `generation_key` de tudo e regerava
# texto e audio dos 7 perfis junto com os slides. Congeladas no ultimo valor que
# entrou no hash, para que os hashes ja gravados continuem batendo.
SOURCE_HASH_PRESENTATION_ENGINE_VERSION = "brainhexpdf-v1"
SOURCE_HASH_PRESENTATION_DESIGN_VERSION = "slidesgo-editorial-v3"
CONTENT_ENRICHMENT_PROVIDER = "openai"

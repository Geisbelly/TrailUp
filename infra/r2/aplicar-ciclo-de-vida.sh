#!/usr/bin/env bash
# Aplica infra/r2/ciclo-de-vida.json no bucket R2 do TrailUp (#195).
#
# LEIA docs/lgpd/storage-buckets-e-r2.md ANTES. Resumo:
#   * So' aplique depois que `app_config.retencao_modo = 'aplicar'` estiver
#     valendo em producao. Em 'simular' o banco ainda aponta para telemetria
#     antiga e a regra de 200 dias apagaria objeto referenciado.
#   * `lifecycle set` SUBSTITUI todas as regras do bucket (inclusive a padrao
#     de abortar multipart em 7 dias, que o JSON recria). Rode `listar` antes
#     e confira se nao ha regra feita a mao que precise entrar no JSON.
#
# Uso:
#   infra/r2/aplicar-ciclo-de-vida.sh listar   <bucket>
#   infra/r2/aplicar-ciclo-de-vida.sh aplicar  <bucket> --confirmo-modo-aplicar
#   infra/r2/aplicar-ciclo-de-vida.sh api      <bucket> --confirmo-modo-aplicar
#
# `listar`/`aplicar` usam o wrangler (`npx wrangler login` antes, com uma conta
# que tenha "Workers R2 Storage Write"). `api` usa a API REST da Cloudflare com
# CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN ja' exportados no SEU terminal;
# o script nao grava nem imprime esses valores.
set -euo pipefail

ACAO="${1:-}"
BUCKET="${2:-}"
CONFIRMA="${3:-}"
ARQUIVO="$(cd "$(dirname "$0")" && pwd)/ciclo-de-vida.json"

uso() { sed -n '2,22p' "$0"; exit 2; }
[[ -n "$ACAO" && -n "$BUCKET" ]] || uso

exigir_confirmacao() {
  if [[ "$CONFIRMA" != "--confirmo-modo-aplicar" ]]; then
    echo "Recusado: confirme que retencao_modo='aplicar' ja' vale em producao" >&2
    echo "passando --confirmo-modo-aplicar (ver docs/lgpd/storage-buckets-e-r2.md)." >&2
    exit 3
  fi
}

case "$ACAO" in
  listar)
    npx wrangler r2 bucket lifecycle list "$BUCKET"
    ;;
  aplicar)
    exigir_confirmacao
    npx wrangler r2 bucket lifecycle set "$BUCKET" --file "$ARQUIVO"
    npx wrangler r2 bucket lifecycle list "$BUCKET"
    ;;
  api)
    exigir_confirmacao
    : "${CLOUDFLARE_ACCOUNT_ID:?exporte CLOUDFLARE_ACCOUNT_ID no seu terminal}"
    : "${CLOUDFLARE_API_TOKEN:?exporte CLOUDFLARE_API_TOKEN no seu terminal}"
    url="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${BUCKET}/lifecycle"
    curl -fsS -X PUT "$url" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data @"$ARQUIVO"
    echo
    curl -fsS "$url" -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
    echo
    ;;
  *)
    uso
    ;;
esac

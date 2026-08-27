#!/usr/bin/env bash
# Sobe todos os servicos do monorepo TrailUp de uma vez (Linux / macOS).
# Roda os servicos em paralelo no mesmo terminal; Ctrl+C encerra todos juntos.
#
# Uso:
#   ./scripts/dev.sh                 # todos
#   ./scripts/dev.sh api frontend    # apenas os indicados
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICES=("${@:-api microservice frontend mobile}")
# normaliza (caso venha como string unica)
read -ra SERVICES <<< "${SERVICES[*]}"

pids=()
cleanup() {
  echo ""
  echo "Encerrando servicos..."
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

start() {
  local name="$1" dir="$2" check="$3" port="$4"; shift 4
  local path="$ROOT/$dir"
  if [[ ! -d "$path" ]]; then
    echo "[$name] pasta '$dir' nao encontrada - pulando."; return
  fi
  if [[ -n "$check" && ! -e "$path/$check" ]]; then
    echo "[$name] dependencias ausentes ('$check'). Rode a instalacao antes (veja README)."; return
  fi
  echo "[$name] http://localhost:$port"
  ( cd "$path" && exec "$@" ) 2>&1 | sed "s/^/[$name] /" &
  pids+=($!)
}

for name in "${SERVICES[@]}"; do
  case "$name" in
    api)          start api          api          .venv        8000 .venv/bin/uvicorn app.main:app --reload --port 8000 ;;
    microservice) start microservice microservice node_modules 3000 npm run dev ;;
    frontend)     start frontend     frontend     node_modules 8080 npm run dev ;;
    mobile)       start mobile       mobile       node_modules 8081 npm run start ;;
    *)            echo "Servico desconhecido: $name (use api|microservice|frontend|mobile)" ;;
  esac
done

echo "Servicos iniciados. Pressione Ctrl+C para encerrar todos."
wait

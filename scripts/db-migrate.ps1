<#
.SYNOPSIS
  Valida a conexao com o banco (Supabase) e aplica as migrations Alembic da API.

.DESCRIPTION
  Testa a autenticacao ANTES de migrar. Se a senha estiver incorreta/rotacionada,
  aborta com orientacao clara em vez de deixar um erro cru do driver. Util para
  aplicar as tabelas novas (ex.: classe_perfil_summary, aluno_mental_state_history).

.PARAMETER DryRun
  Apenas valida a conexao e mostra a revisao atual (current) vs a alvo (heads),
  sem aplicar nenhuma migration.

.EXAMPLE
  .\scripts\db-migrate.ps1            # valida e aplica (alembic upgrade head)
  .\scripts\db-migrate.ps1 -DryRun    # so valida a conexao e mostra o plano
#>
[CmdletBinding()]
param([switch]$DryRun)

# 'Continue' (nao 'Stop'): no PS 5.1, stderr de exe nativo com 'Stop' vira erro
# terminante. Tratamos falhas manualmente via $LASTEXITCODE e analise de texto.
$ErrorActionPreference = 'Continue'
$Root   = Split-Path -Parent $PSScriptRoot
$ApiDir = Join-Path $Root 'api'
$Python = Join-Path $ApiDir '.venv\Scripts\python.exe'

if (-not (Test-Path $Python)) {
  Write-Host "[erro] venv da API nao encontrada em: $Python" -ForegroundColor Red
  Write-Host "       Crie com:  cd api; python -m venv .venv; .venv\Scripts\python -m pip install -r requirements.txt" -ForegroundColor Yellow
  exit 1
}

Push-Location $ApiDir
try {
  Write-Host "TrailUp :: validando conexao com o banco..." -ForegroundColor Cyan
  $currentText = (& $Python -m alembic current 2>&1 | Out-String)

  if ($currentText -match 'password authentication failed') {
    Write-Host "[falha] autenticacao recusada pelo banco (senha incorreta ou rotacionada)." -ForegroundColor Red
    Write-Host "        Pegue a senha atual em Supabase > Project Settings > Database e" -ForegroundColor Yellow
    Write-Host "        atualize as 3 variaveis no api/.env (mesma senha nas tres):" -ForegroundColor Yellow
    Write-Host "          DATABASE_URL  |  ALEMBIC_DATABASE_URL  |  LANGGRAPH_DB_URL" -ForegroundColor Yellow
    exit 2
  }
  if ($currentText -match 'connection .*failed|could not translate host name|Connection refused|timeout expired') {
    Write-Host "[falha] nao foi possivel conectar ao banco:" -ForegroundColor Red
    Write-Host $currentText.Trim() -ForegroundColor DarkGray
    exit 3
  }

  Write-Host "Conexao OK." -ForegroundColor Green
  Write-Host "--- Revisao aplicada no banco (current) ---" -ForegroundColor Cyan
  Write-Host $currentText.Trim()
  Write-Host "--- Revisao alvo (heads) ---" -ForegroundColor Cyan
  & $Python -m alembic heads

  if ($DryRun) {
    Write-Host "DryRun: nenhuma migration aplicada." -ForegroundColor Yellow
    exit 0
  }

  Write-Host "Aplicando:  alembic upgrade head ..." -ForegroundColor Cyan
  & $Python -m alembic upgrade head
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[falha] 'alembic upgrade head' retornou codigo $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
  }

  Write-Host "--- Revisao apos upgrade ---" -ForegroundColor Cyan
  & $Python -m alembic current
  Write-Host "Migrations aplicadas com sucesso." -ForegroundColor Green
}
finally {
  Pop-Location
}

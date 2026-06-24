<#
.SYNOPSIS
  Sobe todos os servicos do monorepo TrailUp de uma vez (Windows / PowerShell).

.DESCRIPTION
  Abre cada servico em sua propria janela do PowerShell, facilitando a leitura
  dos logs e o encerramento individual. Use -Service para subir apenas alguns.

.PARAMETER Service
  Lista de servicos a iniciar. Padrao: todos.
  Valores: api, microservice, frontend, mobile

.EXAMPLE
  .\scripts\dev.ps1
  .\scripts\dev.ps1 -Service api,microservice
#>
[CmdletBinding()]
param(
  [ValidateSet('api', 'microservice', 'frontend', 'mobile')]
  [string[]]$Service = @('api', 'microservice', 'frontend', 'mobile')
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

# nome -> @{ Dir; Cmd; Port; Check }
$services = [ordered]@{
  api          = @{ Dir = 'api';          Port = 8000; Check = '.venv';        Cmd = '.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000' }
  microservice = @{ Dir = 'microservice'; Port = 3000; Check = 'node_modules'; Cmd = 'npm run dev' }
  frontend     = @{ Dir = 'frontend';     Port = 8080; Check = 'node_modules'; Cmd = 'npm run dev' }
  mobile       = @{ Dir = 'mobile';       Port = 8081; Check = 'node_modules'; Cmd = 'npm run start' }
}

Write-Host "TrailUp - iniciando servicos: $($Service -join ', ')" -ForegroundColor Cyan

foreach ($name in $Service) {
  $svc  = $services[$name]
  $path = Join-Path $Root $svc.Dir

  if (-not (Test-Path $path)) {
    Write-Host "[$name] pasta '$($svc.Dir)' nao encontrada - pulando." -ForegroundColor Yellow
    continue
  }
  if ($svc.Check -and -not (Test-Path (Join-Path $path $svc.Check))) {
    Write-Host "[$name] dependencias ausentes ('$($svc.Check)'). Rode a instalacao antes (veja README)." -ForegroundColor Yellow
    continue
  }

  Write-Host "[$name] http://localhost:$($svc.Port)  ->  $($svc.Cmd)" -ForegroundColor Green

  # Abre cada servico em uma nova janela PowerShell, ja na pasta do projeto.
  $inner = "Set-Location '$path'; Write-Host 'TrailUp :: $name (porta $($svc.Port))' -ForegroundColor Cyan; $($svc.Cmd)"
  Start-Process -FilePath 'powershell.exe' `
    -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $inner
}

Write-Host "Pronto. Cada servico abriu em sua propria janela; feche a janela para parar o servico." -ForegroundColor Cyan

<#
.SYNOPSIS
  Sobe todos os servicos do monorepo TrailUp de uma vez (Windows / PowerShell).

.DESCRIPTION
  Abre cada servico em sua propria janela do PowerShell, facilitando a leitura
  dos logs e o encerramento individual. Use -Service para subir apenas alguns.

.PARAMETER Service
  Lista de servicos a iniciar. Padrao: todos.
  Valores: api, microservice, brainhexpdf, frontend, mobile

  brainhexpdf roda a partir de ..\BrainHexPDF (repo irmao, fora do
  monorepo) - pulado automaticamente se essa pasta nao existir no seu
  checkout.

.PARAMETER ParaGeracao
  Sobe os servicos em modo ESTAVEL, sem file watcher.

  Use quando a intencao for gerar personalizacao. O `npm run dev` do
  microservice e `tsx --watch`, e o watcher reinicia o servidor no meio de uma
  geracao -- que leva minutos. Medido: `personalizar start profile=mastermind`
  seguido de `Restarting 'server.ts'` 1,7s depois, e a requisicao morre com
  `httpx.ReadError`. O lado da API registra isso como
  "Microservico BrainHex nao concluiu a geracao", sem dizer que foi o watcher.

  `API_ONLY=true` tambem entra: sem a SPA de demo, o Vite para de reotimizar
  dependencias e de mexer em arquivo que o watcher observa.

.EXAMPLE
  .\scripts\dev.ps1
  .\scripts\dev.ps1 -Service api,microservice
  .\scripts\dev.ps1 -Service microservice,brainhexpdf -ParaGeracao
#>
[CmdletBinding()]
param(
  [ValidateSet('api', 'microservice', 'brainhexpdf', 'frontend', 'mobile')]
  [string[]]$Service = @('api', 'microservice', 'brainhexpdf', 'frontend', 'mobile'),

  [switch]$ParaGeracao
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

# nome -> @{ Dir; Cmd; Port; Check }
# brainhexpdf fica FORA do monorepo (repo irmao ../BrainHexPDF) - so roda se
# a pasta existir no mesmo nivel de trailup/. Motor de apresentacao chamado
# pelo microservice via BRAINHEXPDF_API_URL (ver microservice/.env.example).
$services = [ordered]@{
  api          = @{ Dir = 'api';             Port = 8000; Check = '.venv';        Cmd = '.\.venv\Scripts\python.exe -m app --reload --host 0.0.0.0 --port 8000' }
  microservice = @{ Dir = 'microservice';    Port = 3000; Check = 'node_modules'; Cmd = 'npm run dev'; CmdEstavel = '$env:API_ONLY="true"; npm start' }
  brainhexpdf  = @{ Dir = '..\BrainHexPDF';  Port = 3002; Check = 'node_modules'; Cmd = 'npm run dev' }
  frontend     = @{ Dir = 'frontend';        Port = 8080; Check = 'node_modules'; Cmd = 'npm run dev' }
  mobile       = @{ Dir = 'mobile';          Port = 8081; Check = 'node_modules'; Cmd = 'npm run start' }
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

  # Em modo geracao, quem tiver alternativa sem watcher usa ela.
  $cmd = if ($ParaGeracao -and $svc.CmdEstavel) { $svc.CmdEstavel } else { $svc.Cmd }
  $rotulo = if ($ParaGeracao -and $svc.CmdEstavel) { ' [sem watcher]' } else { '' }

  Write-Host "[$name] http://localhost:$($svc.Port)  ->  $cmd$rotulo" -ForegroundColor Green

  # Abre cada servico em uma nova janela PowerShell, ja na pasta do projeto.
  $inner = "Set-Location '$path'; Write-Host 'TrailUp :: $name (porta $($svc.Port))' -ForegroundColor Cyan; $cmd"
  Start-Process -FilePath 'powershell.exe' `
    -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $inner
}

Write-Host "Pronto. Cada servico abriu em sua propria janela; feche a janela para parar o servico." -ForegroundColor Cyan

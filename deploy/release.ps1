# Empacota o repositório e publica na VPS: sobe o código, instala
# dependências, builda api-server + academia e reinicia o serviço.
#
# Primeiro deploy:
#   .\deploy\release.ps1 -VpsHost 203.0.113.10 -VpsUser root
#   (depois SSH na VPS e rode deploy/setup-vps.sh uma vez — ver deploy/DEPLOY.md)
#
# Deploys seguintes (mesma VPS já provisionada): só repetir o mesmo comando.
param(
    [Parameter(Mandatory = $true)][string]$VpsHost,
    [string]$VpsUser = "root",
    [string]$RemoteDir = "/var/www/martial-arts-hub"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$archive = Join-Path $env:TEMP "martial-arts-hub-release.tar.gz"

Write-Host "==> Empacotando o repositório..." -ForegroundColor Cyan
if (Test-Path $archive) { Remove-Item $archive -Force }

Push-Location $repoRoot
try {
    tar -czf $archive `
        --exclude='*node_modules*' `
        --exclude='.git' `
        --exclude='*.local*' `
        --exclude='*.cache*' `
        --exclude='*dist*' `
        --exclude='*storage*' `
        --exclude='**/.env' `
        --exclude='*.tsbuildinfo' `
        --exclude='*coverage*' `
        --exclude='*.expo*' `
        --exclude='artifacts/academia-mobile' `
        --exclude='artifacts/mockup-sandbox' `
        artifacts/api-server artifacts/academia lib scripts `
        pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.json tsconfig.base.json deploy
    if ($LASTEXITCODE -ne 0) { throw "tar falhou (exit $LASTEXITCODE)" }
}
finally {
    Pop-Location
}

$sizeMB = [Math]::Round((Get-Item $archive).Length / 1MB, 1)
Write-Host "    $archive ($sizeMB MB)"

Write-Host "==> Enviando pra ${VpsUser}@${VpsHost}:$RemoteDir ..." -ForegroundColor Cyan
ssh "${VpsUser}@${VpsHost}" "mkdir -p $RemoteDir"
scp $archive "${VpsUser}@${VpsHost}:/tmp/martial-arts-hub-release.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "scp falhou (exit $LASTEXITCODE)" }

Write-Host "==> Extraindo, instalando dependências e buildando na VPS..." -ForegroundColor Cyan
# Extrai por cima do que já existe (não apaga artifacts/api-server/storage,
# que fica fora do tarball de propósito — são as fotos já enviadas em produção).
$remoteScript = @"
set -euo pipefail
tar -xzf /tmp/martial-arts-hub-release.tar.gz -C $RemoteDir
rm -f /tmp/martial-arts-hub-release.tar.gz
cd $RemoteDir
export PATH="\$PATH:/usr/local/bin"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/academia run build
if systemctl list-unit-files | grep -q '^api-server.service'; then
  sudo systemctl restart api-server
  sudo systemctl reload nginx || true
  echo 'Serviço reiniciado.'
else
  echo 'Aviso: api-server.service ainda não está instalado — rode deploy/setup-vps.sh (uma vez) antes de iniciar o serviço.'
fi
"@

ssh "${VpsUser}@${VpsHost}" $remoteScript
if ($LASTEXITCODE -ne 0) { throw "Deploy remoto falhou (exit $LASTEXITCODE)" }

Remove-Item $archive -Force
Write-Host "==> Deploy concluído." -ForegroundColor Green

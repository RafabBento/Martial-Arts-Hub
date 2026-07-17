# Publica a última versão commitada/enviada ao GitHub na VPS: dá git pull,
# reinstala dependências, builda api-server + academia e reinicia o serviço.
#
# IMPORTANTE: só publica o que já foi commitado E enviado (push) pro GitHub —
# mudanças locais não commitadas NÃO chegam na VPS. Fluxo normal:
#   1. Commitar e publicar (push) as mudanças (GitHub Desktop, ou git push).
#   2. .\deploy\release.ps1 -VpsHost <IP> -VpsUser root
#
# Primeiro deploy: rode deploy/setup-vps.sh na VPS (ver deploy/DEPLOY.md) —
# ele já clona, instala e builda tudo sozinho. Depois é só usar este script
# pra cada atualização.
param(
    [Parameter(Mandatory = $true)][string]$VpsHost,
    [string]$VpsUser = "root",
    [string]$RemoteDir = "/var/www/martial-arts-hub"
)

$ErrorActionPreference = "Stop"

$remoteScript = @"
set -euo pipefail
cd $RemoteDir
sudo -u martialarts git pull
sudo -u martialarts pnpm install --frozen-lockfile
sudo -u martialarts pnpm --filter @workspace/api-server run build
sudo -u martialarts pnpm --filter @workspace/academia run build
sudo systemctl restart api-server
sudo systemctl reload nginx || true
echo 'Deploy concluido.'
"@

Write-Host "==> Atualizando ${VpsUser}@${VpsHost}:$RemoteDir ..." -ForegroundColor Cyan
ssh "${VpsUser}@${VpsHost}" $remoteScript
if ($LASTEXITCODE -ne 0) { throw "Deploy remoto falhou (exit $LASTEXITCODE)" }

Write-Host "==> Deploy concluído." -ForegroundColor Green

#!/usr/bin/env bash
# Provisionamento único de uma VPS Ubuntu (ex.: Hostinger KVM 2) para rodar o
# Martial Arts Hub a partir do repositório no GitHub.
#
# Uso (na VPS, como root ou via sudo):
#   curl -fsSL https://raw.githubusercontent.com/RafabBento/Martial-Arts-Hub/main/deploy/setup-vps.sh -o setup-vps.sh
#   chmod +x setup-vps.sh && sudo ./setup-vps.sh
set -euo pipefail

REPO_URL=https://github.com/RafabBento/Martial-Arts-Hub.git
APP_DIR=/var/www/martial-arts-hub
APP_USER=martialarts
ENV_DIR=/etc/martial-arts-hub

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root (sudo ./setup-vps.sh)" >&2
  exit 1
fi

echo "==> Atualizando pacotes..."
apt-get update -y
apt-get install -y curl git nginx ufw

echo "==> Instalando Node.js 24 (NodeSource)..."
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

echo "==> Instalando pnpm..."
corepack enable
corepack prepare pnpm@11 --activate

echo "==> Criando usuário de serviço '$APP_USER' (sem shell de login)..."
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

echo "==> Clonando o repositório em $APP_DIR..."
mkdir -p "$APP_DIR"
chown "$APP_USER":"$APP_USER" "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" pull
else
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
fi
sudo -u "$APP_USER" mkdir -p "$APP_DIR/artifacts/api-server/storage"

echo "==> Instalando dependências e buildando..."
cd "$APP_DIR"
sudo -u "$APP_USER" pnpm install --frozen-lockfile
sudo -u "$APP_USER" pnpm --filter @workspace/api-server run build
sudo -u "$APP_USER" pnpm --filter @workspace/academia run build

echo "==> Preparando /etc/martial-arts-hub/api-server.env..."
mkdir -p "$ENV_DIR"
if [ ! -f "$ENV_DIR/api-server.env" ]; then
  cp "$APP_DIR/deploy/api-server.env.example" "$ENV_DIR/api-server.env"
  echo "    Criado a partir do template — edite AGORA com:"
  echo "      sudo nano $ENV_DIR/api-server.env"
fi
chown "$APP_USER":"$APP_USER" "$ENV_DIR/api-server.env"
chmod 600 "$ENV_DIR/api-server.env"

echo "==> Instalando serviço systemd..."
cp "$APP_DIR/deploy/api-server.service" /etc/systemd/system/api-server.service
systemctl daemon-reload
systemctl enable api-server

echo "==> Configurando nginx..."
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/martial-arts-hub
ln -sf /etc/nginx/sites-available/martial-arts-hub /etc/nginx/sites-enabled/martial-arts-hub
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Configurando firewall (ufw)..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "Provisionamento concluído."
echo "Se ainda não editou o .env de produção, edite agora:"
echo "  sudo nano $ENV_DIR/api-server.env"
echo "Depois inicie a API:"
echo "  sudo systemctl start api-server"
echo "  sudo systemctl status api-server"

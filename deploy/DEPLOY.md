# Deploy na VPS (Hostinger KVM 2)

Pré-requisitos: VPS Ubuntu 22.04/24.04 já provisionada, com acesso SSH (root
ou usuário com sudo). Rode os comandos abaixo a partir do Windows (PowerShell),
na raiz do repositório.

## 1. Primeiro deploy

```powershell
.\deploy\release.ps1 -VpsHost <IP_DA_VPS> -VpsUser root
```

Isso sobe o código, instala dependências e builda o front + a API. Na
primeira vez o serviço ainda não existe — o script só avisa e para aí.

Depois, conecte na VPS e rode o provisionamento (uma vez só):

```bash
ssh root@<IP_DA_VPS>
cd /var/www/martial-arts-hub
chmod +x deploy/setup-vps.sh
sudo ./deploy/setup-vps.sh
```

O script instala Node 24, pnpm, nginx, cria o usuário de serviço, registra o
systemd unit, configura o nginx e o firewall (ufw). Ele copia
`deploy/api-server.env.example` para `/etc/martial-arts-hub/api-server.env`
na primeira execução — **edite esse arquivo antes de iniciar**:

```bash
sudo nano /etc/martial-arts-hub/api-server.env
```

Preencha:
- `DATABASE_URL` — a connection string do Neon (a mesma do `.env` local).
- `SESSION_SECRET` — gere um valor novo: `openssl rand -hex 32` (não reuse o de dev).

Depois inicie:

```bash
sudo systemctl start api-server
sudo systemctl status api-server
```

Acesse `http://<IP_DA_VPS>` no navegador — deve carregar o app.

## 2. Deploys seguintes (atualizar o código)

Sempre que quiser publicar mudanças, do Windows:

```powershell
.\deploy\release.ps1 -VpsHost <IP_DA_VPS> -VpsUser root
```

Isso já builda e reinicia o serviço sozinho (a VPS já está provisionada).
As fotos já enviadas (`artifacts/api-server/storage/`) **não são apagadas** —
ficam fora do pacote de propósito.

## 3. Comandos úteis na VPS

```bash
sudo systemctl status api-server      # está rodando?
sudo journalctl -u api-server -f      # logs em tempo real
sudo systemctl restart api-server     # reiniciar manualmente
sudo nginx -t && sudo systemctl reload nginx   # validar/aplicar config do nginx
```

## 4. Quando tiver um domínio

1. Aponte o DNS (registro A) do domínio pro IP da VPS.
2. Troque `server_name _;` por `server_name seudominio.com;` em
   `/etc/nginx/sites-available/martial-arts-hub` (ou edite `deploy/nginx.conf`
   e rode `release.ps1` de novo).
3. Instale certbot e gere o certificado:
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d seudominio.com
   ```
4. Em `/etc/martial-arts-hub/api-server.env`, mude `COOKIE_SECURE=true` e
   `sudo systemctl restart api-server`.

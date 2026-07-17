# Deploy na VPS (Hostinger KVM 2)

O código é publicado via GitHub: https://github.com/RafabBento/Martial-Arts-Hub
(repositório público — a VPS clona/atualiza direto por HTTPS, sem precisar de
chave SSH ou token).

Pré-requisito: VPS Ubuntu 22.04/24.04 com acesso SSH (root ou usuário com sudo).

## 1. Primeiro deploy

Conecte na VPS e rode o script de provisionamento (uma vez só) — ele instala
Node 24, pnpm, git, nginx, clona o repositório, instala dependências, builda
tudo, configura o systemd e o nginx, e ajusta o firewall (ufw):

```bash
ssh root@<IP_DA_VPS>
curl -fsSL https://raw.githubusercontent.com/RafabBento/Martial-Arts-Hub/main/deploy/setup-vps.sh -o setup-vps.sh
chmod +x setup-vps.sh
sudo ./setup-vps.sh
```

Ele copia `deploy/api-server.env.example` para
`/etc/martial-arts-hub/api-server.env` na primeira execução —
**edite esse arquivo antes de iniciar**:

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

O deploy só pega o que já foi **commitado e enviado (push) pro GitHub** —
mudanças locais não sobem sozinhas. Fluxo normal:

1. Commitar e publicar as mudanças (GitHub Desktop → Commit → Push, ou `git push`).
2. Do Windows, na raiz do repositório:
   ```powershell
   .\deploy\release.ps1 -VpsHost <IP_DA_VPS> -VpsUser root
   ```

Isso faz `git pull` na VPS, reinstala dependências, builda e reinicia o
serviço. As fotos já enviadas (`artifacts/api-server/storage/`) não são
apagadas — ficam fora do controle de versão de propósito.

## 3. Comandos úteis na VPS

```bash
sudo systemctl status api-server      # está rodando?
sudo journalctl -u api-server -f      # logs em tempo real
sudo systemctl restart api-server     # reiniciar manualmente
sudo nginx -t && sudo systemctl reload nginx   # validar/aplicar config do nginx
cd /var/www/martial-arts-hub && git log --oneline -5   # qual commit está rodando
```

## 4. Quando tiver um domínio

1. Aponte o DNS (registro A) do domínio pro IP da VPS.
2. Troque `server_name _;` por `server_name seudominio.com;` em
   `/etc/nginx/sites-available/martial-arts-hub` (ou edite `deploy/nginx.conf`
   no repositório, dê push, e rode `release.ps1` de novo — mas nesse caso
   também copie o arquivo atualizado por cima do de `/etc/nginx/sites-available/`
   manualmente, o `release.ps1` não mexe na config do nginx sozinho).
3. Instale certbot e gere o certificado:
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d seudominio.com
   ```
4. Em `/etc/martial-arts-hub/api-server.env`, mude `COOKIE_SECURE=true` e
   `sudo systemctl restart api-server`.

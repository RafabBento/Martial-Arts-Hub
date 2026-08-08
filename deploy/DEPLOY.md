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

## 4. HTTPS (domínio + Cloudflare Tunnel)

O projeto usa **Cloudflare Tunnel** para HTTPS, não certbot — o Nginx nunca
termina TLS diretamente, ele só recebe HTTP puro em `localhost:80` vindo do
`cloudflared`. Isso é por isso que `deploy/nginx.conf` tem o `map` de
`X-Forwarded-Proto` (repassa o esquema real do visitante em vez de sempre
`http`, que é o que o Nginx veria sozinho).

Domínio atual: `frontartesmarciais.com` (nameservers na Cloudflare). Tunnel
nomeado `martial-arts-hub`, config em `/etc/cloudflared/config.yml`, serviço
systemd `cloudflared.service` (`enabled`, sobrevive a reboot).

**Importante — forçar protocolo HTTP/2 em vez de QUIC:**
Por padrão o `cloudflared` usa QUIC (UDP) pra falar com a borda da
Cloudflare. Em VPS que tratam mal UDP (ex.: Hostinger KVM), isso causa
desconexões intermitentes (`journalctl -u cloudflared -g quic` mostra
`failed to dial to edge with quic: timeout`) — na prática, o usuário vê
"Failed to fetch" no navegador bem no meio de um login/requisição, sem
nenhum log do lado do `api-server` (a requisição nem chega a sair do
tunnel). A correção é adicionar `protocol: http2` (TCP, bem mais tolerante)
no topo de `/etc/cloudflared/config.yml`:

```yaml
protocol: http2
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: frontartesmarciais.com
    service: http://localhost:80
  - hostname: www.frontartesmarciais.com
    service: http://localhost:80
  - service: http_status:404
```

Depois: `sudo systemctl restart cloudflared` e confirme nos logs
(`journalctl -u cloudflared -n 20`) que as conexões registraram com
`protocol=http2`.

`COOKIE_SECURE=true` em `/etc/martial-arts-hub/api-server.env` já deve estar
ativo (necessário para os cookies de sessão funcionarem por HTTPS).

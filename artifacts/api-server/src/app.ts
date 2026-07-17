// =============================================================================
// app.ts — Montagem da aplicação Express (API do sistema da academia).
// Define a ordem dos middlewares globais (logging, CORS, parsing de body,
// sessão, autenticação via Bearer) e monta o roteador principal sob "/api".
// O arquivo apenas configura o app; quem o sobe na porta é o index.ts.
// =============================================================================
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import router from "./routes";
import { logger } from "./lib/logger";
import { bearerAuth } from "./middlewares/bearerAuth";

const app: Express = express();

// Atrás do nginx (reverse proxy), confia no X-Forwarded-Proto/Host para que
// req.protocol/req.get("host") reflitam o que o cliente realmente acessou
// (usado para montar URLs de upload absolutas — ver routes/storage.ts).
app.set("trust proxy", 1);

// Logging HTTP estruturado (pino). Os serializers reduzem o que é logado por
// request/response para evitar ruído e vazamento de dados — guardamos apenas o
// id da requisição, método, URL (sem query string) e o status code da resposta.
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// CORS com `origin: true` reflete a origem da requisição e `credentials: true`
// permite o envio de cookies de sessão entre o front (web/mobile) e a API.
app.use(cors({
  origin: true,
  credentials: true,
}));

// Parsing do corpo da requisição. Limite de 10mb porque alguns endpoints
// recebem imagens em base64 (fotos de perfil/equipe para reconhecimento facial).
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Sessão baseada em cookie. O segredo vem do ambiente (com fallback fixo só
// para dev). saveUninitialized:false evita criar sessão antes do login; o cookie
// é httpOnly (não acessível via JS) e expira em 7 dias.
app.use(session({
  secret: process.env.SESSION_SECRET ?? "academia_fight_club_secret_2024",
  resave: false,
  saveUninitialized: false,
  cookie: {
    // Só exige HTTPS quando COOKIE_SECURE=true (ativar ao configurar domínio
    // + TLS na VPS). Em HTTP puro (ex.: acesso direto por IP) precisa ficar
    // false, senão o navegador nunca envia o cookie de volta.
    secure: process.env.COOKIE_SECURE === "true",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// bearerAuth roda DEPOIS da sessão: quando não há cookie (ex.: app nativo no
// Expo Go), ele decodifica o token Bearer e popula req.session.userId, para que
// as rotas funcionem igual ao fluxo de cookie. Em seguida monta a API em "/api".
app.use(bearerAuth);
app.use("/api", router);

export default app;

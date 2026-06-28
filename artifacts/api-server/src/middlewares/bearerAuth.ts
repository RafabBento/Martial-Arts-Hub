// =============================================================================
// bearerAuth.ts — Middleware de autenticação por token Bearer (modelo
// "populate-only"). Ponte entre o app web (que usa cookie de sessão) e o app
// nativo (Expo Go), que não envia cookies. Quando há um Bearer válido, ele
// apenas POPULA req.session.userId — NÃO bloqueia a requisição. A autorização
// efetiva (verificar se userId existe, checar role) fica a cargo de cada rota.
// =============================================================================
import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

/**
 * Middleware that accepts Bearer token auth alongside session cookies.
 * The token is base64(userId:email:timestamp) — we decode it, validate
 * the user exists in the DB, and populate req.session.userId so all
 * downstream route handlers work without changes.
 * This enables Expo Go (physical device) where cookies are not sent.
 */
export async function bearerAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const session = req.session as unknown as Record<string, unknown>;

  // Se a sessão já tem userId (autenticação por cookie no web), não há nada a
  // fazer — segue para o próximo middleware.
  if (session.userId) {
    next();
    return;
  }

  // Sem cabeçalho "Bearer ..." também seguimos sem autenticar: este middleware
  // nunca rejeita a requisição, apenas tenta enriquecer a sessão.
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    next();
    return;
  }

  try {
    // O token é base64 de "userId:email:timestamp". Decodificamos e extraímos
    // o userId (primeiro segmento).
    const token = authHeader.slice(7);
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const parts = decoded.split(":");
    const userId = parseInt(parts[0], 10);

    // userId inválido/ausente → ignora o token e continua sem autenticar.
    if (!userId || isNaN(userId)) {
      next();
      return;
    }

    // Confirma que o usuário realmente existe no banco antes de confiar no token.
    const [user] = await db.select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) {
      next();
      return;
    }

    // Checagem básica anti-forjamento: o email embutido no token (2º segmento)
    // deve bater com o email atual do usuário no banco.
    if (parts[1] && parts[1] !== user.email) {
      next();
      return;
    }

    // Token válido: popula a sessão para que as rotas tratem como autenticado.
    session.userId = user.id;
    session.token = token;
  } catch {
    // Token malformado/inválido — apenas seguimos sem autenticação.
  }

  next();
}

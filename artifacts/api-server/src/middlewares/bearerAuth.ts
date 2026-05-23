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

  // If session already has userId (cookie auth), skip
  if (session.userId) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    next();
    return;
  }

  try {
    const token = authHeader.slice(7);
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const parts = decoded.split(":");
    const userId = parseInt(parts[0], 10);

    if (!userId || isNaN(userId)) {
      next();
      return;
    }

    const [user] = await db.select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) {
      next();
      return;
    }

    // Validate email in token matches DB (basic anti-forgery check)
    if (parts[1] && parts[1] !== user.email) {
      next();
      return;
    }

    session.userId = user.id;
    session.token = token;
  } catch {
    // Invalid token — continue without auth
  }

  next();
}

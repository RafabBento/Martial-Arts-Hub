// =============================================================================
// routes/index.ts — Roteador agregador da API.
// Importa todos os sub-roteadores por domínio (health, auth, users, students,
// sessions, attendance, rankings, stats, payments, storage, face) e os monta em
// um único Router que o app.ts expõe sob o prefixo "/api".
// =============================================================================
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import studentsRouter from "./students";
import sessionsRouter from "./sessions";
import attendanceRouter from "./attendance";
import rankingsRouter from "./rankings";
import statsRouter from "./stats";
import paymentsRouter from "./payments";
import storageRouter from "./storage";
import faceRouter from "./face";

const router: IRouter = Router();

// A ordem de montagem importa pouco aqui porque cada sub-roteador usa caminhos
// distintos; todos são compostos sob o mesmo prefixo "/api" definido no app.ts.
router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(studentsRouter);
router.use(sessionsRouter);
router.use(attendanceRouter);
router.use(rankingsRouter);
router.use(statsRouter);
router.use(paymentsRouter);
router.use(storageRouter);
router.use(faceRouter);

export default router;

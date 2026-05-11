import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import studentsRouter from "./students";
import sessionsRouter from "./sessions";
import attendanceRouter from "./attendance";
import rankingsRouter from "./rankings";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(studentsRouter);
router.use(sessionsRouter);
router.use(attendanceRouter);
router.use(rankingsRouter);
router.use(statsRouter);

export default router;

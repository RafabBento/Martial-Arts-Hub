// =============================================================================
// routes/rankings.ts — Ranking de frequência (presenças) dos alunos.
// Constrói um ranking por modalidade e período, calculando presenças e o total
// de sessões. Regra de negócio central: aulas de Muay Thai no SÁBADO contam em
// dobro tanto no total de sessões quanto na presença do aluno; Jiu-Jitsu conta
// de forma simples. O percentual é presenças/total.
// =============================================================================
import { Router, type IRouter } from "express";
import { eq, and, sql, gte, inArray } from "drizzle-orm";
import { db, attendanceTable, usersTable, studentProfilesTable, trainingSessionsTable } from "@workspace/db";
import { ListRankingsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

// Monta a lista de ranking de uma modalidade dentro de um período.
async function buildRanking(modality: "thai" | "jiu", period: "all" | "week" | "month" | "year") {
  // Converte o período em uma data-corte (dateFilter). "all" não filtra por data.
  let dateFilter: Date | null = null;
  const now = new Date();
  if (period === "week") {
    dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    dateFilter = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === "year") {
    dateFilter = new Date(now.getFullYear(), 0, 1);
  }

  // Saturday (DOW=6) Thai sessions count double
  // (Sábado de Muay Thai conta em dobro — isThai habilita esse peso.)
  const isThai = modality === "thai";

  // Total de sessões da modalidade no período (com peso de sábado p/ Thai). Esse
  // total é o denominador do percentual de frequência de cada aluno.
  const [{ count: totalSessions }] = await db
    .select({
      count: isThai
        ? sql<number>`SUM(CASE WHEN EXTRACT(DOW FROM session_date) = 6 THEN 2 ELSE 1 END)::int`
        : sql<number>`count(*)::int`,
    })
    .from(trainingSessionsTable)
    .where(
      and(
        eq(trainingSessionsTable.modality, modality),
        dateFilter ? gte(trainingSessionsTable.sessionDate, dateFilter) : undefined,
      )
    );

  // Coluna do perfil que indica se o aluno treina a modalidade em questão.
  const modalityCol = isThai
    ? studentProfilesTable.modalityThai
    : studentProfilesTable.modalityJiu;

  // For Thai: correlated subquery with Saturday double-weight; for Jiu: normal count via LEFT JOIN
  // Expressão das presenças do aluno: para Thai, subconsulta correlacionada com
  // peso de sábado; para Jiu, contagem simples via LEFT JOIN (montado adiante).
  const presentCountExpr = isThai
    ? sql<number>`COALESCE((
        SELECT SUM(CASE WHEN EXTRACT(DOW FROM ts.session_date) = 6 THEN 2 ELSE 1 END)::int
        FROM attendance a
        JOIN training_sessions ts ON ts.id = a.session_id
        WHERE a.student_id = ${usersTable.id}
          AND ts.modality = 'thai'
          ${dateFilter ? sql`AND ts.session_date >= ${dateFilter}` : sql``}
      ), 0)`
    : sql<number>`count(${attendanceTable.id})::int`;

  // Expressão de ordenação: mais presenças primeiro e, em empate, nome A→Z.
  // Para Thai repete a subconsulta ponderada; para Jiu ordena pela contagem.
  const orderExpr = isThai
    ? sql`COALESCE((
        SELECT SUM(CASE WHEN EXTRACT(DOW FROM ts.session_date) = 6 THEN 2 ELSE 1 END)
        FROM attendance a
        JOIN training_sessions ts ON ts.id = a.session_id
        WHERE a.student_id = ${usersTable.id}
          AND ts.modality = 'thai'
          ${dateFilter ? sql`AND ts.session_date >= ${dateFilter}` : sql``}
      ), 0) DESC, ${usersTable.name} ASC`
    : sql`count(${attendanceTable.id}) DESC, ${usersTable.name} ASC`;

  // Query base do ranking Thai: alunos/professores que treinam a modalidade,
  // com a contagem ponderada de presenças por aluno.
  const query = db
    .select({
      userId: usersTable.id,
      name: usersTable.name,
      profilePhotoUrl: usersTable.profilePhotoUrl,
      thaiGrade: studentProfilesTable.thaiGrade,
      jiuGrade: studentProfilesTable.jiuGrade,
      thaiGradeColor: studentProfilesTable.thaiGradeColor,
      jiuGradeColor: studentProfilesTable.jiuGradeColor,
      jiuDegree: studentProfilesTable.jiuDegree,
      presentCount: presentCountExpr,
    })
    .from(usersTable)
    .innerJoin(studentProfilesTable, and(
      eq(usersTable.id, studentProfilesTable.userId),
      eq(modalityCol, true),
    ))
    .where(inArray(usersTable.role, ["student", "teacher"]))
    .groupBy(
      usersTable.id,
      usersTable.name,
      usersTable.profilePhotoUrl,
      studentProfilesTable.thaiGrade,
      studentProfilesTable.jiuGrade,
      studentProfilesTable.thaiGradeColor,
      studentProfilesTable.jiuGradeColor,
      studentProfilesTable.jiuDegree,
    )
    .orderBy(orderExpr);

  // For Jiu we still need the LEFT JOIN to count via GROUP BY
  // Thai usa a query acima (subconsulta). Jiu precisa de um LEFT JOIN com
  // attendance + EXISTS de sessão da modalidade no período, contando via GROUP BY.
  const rows = isThai
    ? await query
    : await db
        .select({
          userId: usersTable.id,
          name: usersTable.name,
          profilePhotoUrl: usersTable.profilePhotoUrl,
          thaiGrade: studentProfilesTable.thaiGrade,
          jiuGrade: studentProfilesTable.jiuGrade,
          thaiGradeColor: studentProfilesTable.thaiGradeColor,
          jiuGradeColor: studentProfilesTable.jiuGradeColor,
          jiuDegree: studentProfilesTable.jiuDegree,
          presentCount: sql<number>`count(${attendanceTable.id})::int`,
        })
        .from(usersTable)
        .innerJoin(studentProfilesTable, and(
          eq(usersTable.id, studentProfilesTable.userId),
          eq(studentProfilesTable.modalityJiu, true),
        ))
        .leftJoin(attendanceTable, and(
          eq(attendanceTable.studentId, usersTable.id),
          sql`EXISTS (
            SELECT 1 FROM training_sessions ts
            WHERE ts.id = ${attendanceTable.sessionId}
            AND ts.modality = 'jiu'
            ${dateFilter ? sql`AND ts.session_date >= ${dateFilter}` : sql``}
          )`
        ))
        .where(inArray(usersTable.role, ["student", "teacher"]))
        .groupBy(
          usersTable.id,
          usersTable.name,
          usersTable.profilePhotoUrl,
          studentProfilesTable.thaiGrade,
          studentProfilesTable.jiuGrade,
          studentProfilesTable.thaiGradeColor,
          studentProfilesTable.jiuGradeColor,
          studentProfilesTable.jiuDegree,
        )
        .orderBy(sql`count(${attendanceTable.id}) DESC, ${usersTable.name} ASC`);

  // Mapeia para o formato de saída: posição (rank) pela ordem já calculada e
  // percentual = presenças/total (0 quando não há sessões no período).
  return rows.map((s, index) => ({
    rank: index + 1,
    studentId: s.userId,
    name: s.name,
    profilePhotoUrl: s.profilePhotoUrl ?? null,
    thaiGrade: s.thaiGrade ?? null,
    jiuGrade: s.jiuGrade ?? null,
    thaiGradeColor: s.thaiGradeColor ?? null,
    jiuGradeColor: s.jiuGradeColor ?? null,
    jiuDegree: s.jiuDegree ?? null,
    totalSessions: totalSessions ?? 0,
    presentCount: s.presentCount,
    percentage: totalSessions > 0 ? Math.round((s.presentCount / totalSessions) * 100) : 0,
    modality,
  }));
}

// GET /rankings — endpoint público da rota: aceita modality e period.
router.get("/rankings", async (req, res): Promise<void> => {
  const query = ListRankingsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  // Valores padrão: ambas as modalidades e período "all" (sem corte de data).
  const modality = (query.data.modality ?? "both") as "both" | "thai" | "jiu";
  const period = (query.data.period ?? "all") as "all" | "week" | "month" | "year";

  // "both": calcula os dois rankings em paralelo e devolve { thai, jiu }.
  if (modality === "both") {
    const [thai, jiu] = await Promise.all([
      buildRanking("thai", period),
      buildRanking("jiu", period),
    ]);
    res.json({ thai, jiu });
    return;
  }

  const list = await buildRanking(modality, period);
  res.json(list);
});

export default router;

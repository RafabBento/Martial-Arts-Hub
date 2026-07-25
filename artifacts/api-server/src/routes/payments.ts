// =============================================================================
// routes/payments.ts — Controle de mensalidades dos alunos.
// Lista o status de pagamento de cada aluno em um mês/ano e permite marcar
// (PUT) ou desmarcar (DELETE) o pagamento. A presença de uma linha em
// monthlyPaymentsTable para (aluno, mês, ano) significa "pago".
// =============================================================================
import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, monthlyPaymentsTable, usersTable, studentProfilesTable } from "@workspace/db";
import { ListPaymentsQueryParams, MarkPaymentParams, UnmarkPaymentParams, MarkPaymentBody } from "@workspace/api-zod";
import { getSessionUserId, getRequester, isMasterRole } from "../lib/authz";

const router: IRouter = Router();

// GET /payments — para um mês/ano, retorna todos os alunos com flag de pago.
// Um aluno (não-mestre) só recebe a própria linha; mestre vê todo mundo.
router.get("/payments", async (req, res): Promise<void> => {
  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const query = ListPaymentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { month, year } = query.data;

  // Todos os alunos (ordenados por nome), para que a tela liste pagos e não pagos.
  const students = await db
    .select({
      userId: usersTable.id,
      name: usersTable.name,
      profilePhotoUrl: usersTable.profilePhotoUrl,
      paymentDay: usersTable.paymentDay,
      unit: usersTable.unit,
      scholarship: studentProfilesTable.scholarship,
    })
    .from(usersTable)
    .innerJoin(studentProfilesTable, eq(usersTable.id, studentProfilesTable.userId))
    .where(eq(usersTable.role, "student"))
    .orderBy(usersTable.name);

  // Pagamentos registrados no mês/ano consultado.
  const payments = await db
    .select()
    .from(monthlyPaymentsTable)
    .where(
      and(
        eq(monthlyPaymentsTable.month, month),
        eq(monthlyPaymentsTable.year, year),
      )
    );

  // Indexa por aluno para cruzar com a lista completa de alunos.
  const paymentMap = new Map(payments.map(p => [p.studentId, p]));

  // Não-mestre só enxerga a própria linha (mesmo formato de array, sem mudar
  // o contrato consumido pelo front).
  const visibleStudents = isMasterRole(requester.role)
    ? students
    : students.filter(s => s.userId === requester.id);

  // Combina: paid=true quando existe registro; senão os campos de pagamento ficam nulos.
  // Isento (bolsista ou unidade parceira) conta sempre como pago, sem precisar
  // de linha em monthly_payments nem de e-mail de cobrança.
  res.json(
    visibleStudents.map(s => {
      const p = paymentMap.get(s.userId);
      const exempt = s.unit !== "matriz" || s.scholarship;
      return {
        studentId: s.userId,
        name: s.name,
        profilePhotoUrl: s.profilePhotoUrl ?? null,
        paymentDay: s.paymentDay ?? null,
        paid: exempt || !!p,
        paidAt: p?.paidAt?.toISOString() ?? null,
        notes: p?.notes ?? null,
        exempt,
        exemptReason: s.scholarship ? "scholarship" : s.unit !== "matriz" ? "unit" : null,
        month,
        year,
      };
    })
  );
});

// PUT /payments/:studentId/:year/:month — marca a mensalidade como paga.
// Master-only: só professor/admin confirma o recebimento de um pagamento.
router.put("/payments/:studentId/:year/:month", async (req, res): Promise<void> => {
  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  if (!isMasterRole(requester.role)) {
    res.status(403).json({ error: "Acesso restrito a professores e administradores" });
    return;
  }

  const params = MarkPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Notas são opcionais; body inválido é tolerado (notes = null).
  const bodyParse = MarkPaymentBody.safeParse(req.body);
  const notes = bodyParse.success ? (bodyParse.data?.notes ?? null) : null;

  const { studentId, month, year } = params.data;

  // Nome de quem está registrando o pagamento, para auditoria (paidByName).
  const [requesterUser] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, requester.id));

  // Insere o registro de pagamento. onConflictDoNothing torna a operação
  // idempotente: marcar de novo o mesmo (aluno, mês, ano) não duplica nem falha.
  await db
    .insert(monthlyPaymentsTable)
    .values({
      studentId,
      month,
      year,
      paidAt: new Date(),
      paidByName: requesterUser?.name ?? null,
      notes: notes ?? null,
    })
    .onConflictDoNothing();

  // Relê aluno e pagamento para devolver o estado consolidado ao cliente.
  const [student] = await db
    .select({ name: usersTable.name, profilePhotoUrl: usersTable.profilePhotoUrl, paymentDay: usersTable.paymentDay })
    .from(usersTable)
    .where(eq(usersTable.id, studentId));

  const [payment] = await db
    .select()
    .from(monthlyPaymentsTable)
    .where(
      and(
        eq(monthlyPaymentsTable.studentId, studentId),
        eq(monthlyPaymentsTable.month, month),
        eq(monthlyPaymentsTable.year, year),
      )
    );

  res.json({
    studentId,
    name: student?.name ?? "",
    profilePhotoUrl: student?.profilePhotoUrl ?? null,
    paymentDay: student?.paymentDay ?? null,
    paid: true,
    paidAt: payment?.paidAt?.toISOString() ?? null,
    notes: payment?.notes ?? null,
    month,
    year,
  });
});

// DELETE /payments/:studentId/:year/:month — desmarca (remove) a mensalidade.
// Master-only.
router.delete("/payments/:studentId/:year/:month", async (req, res): Promise<void> => {
  const requester = await getRequester(getSessionUserId(req));
  if (!requester) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  if (!isMasterRole(requester.role)) {
    res.status(403).json({ error: "Acesso restrito a professores e administradores" });
    return;
  }

  const params = UnmarkPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { studentId, month, year } = params.data;

  // Remove o registro daquele (aluno, mês, ano); sem registro = "não pago".
  await db
    .delete(monthlyPaymentsTable)
    .where(
      and(
        eq(monthlyPaymentsTable.studentId, studentId),
        eq(monthlyPaymentsTable.month, month),
        eq(monthlyPaymentsTable.year, year),
      )
    );

  res.json({ message: "Pagamento desmarcado" });
});

export default router;

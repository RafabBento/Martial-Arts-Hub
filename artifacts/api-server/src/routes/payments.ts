import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, monthlyPaymentsTable, usersTable, studentProfilesTable } from "@workspace/db";
import { ListPaymentsQueryParams, MarkPaymentParams, UnmarkPaymentParams, MarkPaymentBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/payments", async (req, res): Promise<void> => {
  const query = ListPaymentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { month, year } = query.data;

  const students = await db
    .select({
      userId: usersTable.id,
      name: usersTable.name,
      profilePhotoUrl: usersTable.profilePhotoUrl,
      paymentDay: usersTable.paymentDay,
    })
    .from(usersTable)
    .innerJoin(studentProfilesTable, eq(usersTable.id, studentProfilesTable.userId))
    .where(eq(usersTable.role, "student"))
    .orderBy(usersTable.name);

  const payments = await db
    .select()
    .from(monthlyPaymentsTable)
    .where(
      and(
        eq(monthlyPaymentsTable.month, month),
        eq(monthlyPaymentsTable.year, year),
      )
    );

  const paymentMap = new Map(payments.map(p => [p.studentId, p]));

  res.json(
    students.map(s => {
      const p = paymentMap.get(s.userId);
      return {
        studentId: s.userId,
        name: s.name,
        profilePhotoUrl: s.profilePhotoUrl ?? null,
        paymentDay: s.paymentDay ?? null,
        paid: !!p,
        paidAt: p?.paidAt?.toISOString() ?? null,
        notes: p?.notes ?? null,
        month,
        year,
      };
    })
  );
});

router.put("/payments/:studentId/:year/:month", async (req, res): Promise<void> => {
  const params = MarkPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const bodyParse = MarkPaymentBody.safeParse(req.body);
  const notes = bodyParse.success ? (bodyParse.data?.notes ?? null) : null;

  const requesterId = (req.session as unknown as Record<string, unknown>).userId as number | undefined;
  const [requester] = requesterId
    ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, requesterId))
    : [{ name: null }];

  const { studentId, month, year } = params.data;

  await db
    .insert(monthlyPaymentsTable)
    .values({
      studentId,
      month,
      year,
      paidAt: new Date(),
      paidByName: requester?.name ?? null,
      notes: notes ?? null,
    })
    .onConflictDoNothing();

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

router.delete("/payments/:studentId/:year/:month", async (req, res): Promise<void> => {
  const params = UnmarkPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { studentId, month, year } = params.data;

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

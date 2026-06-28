import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useListSessions, getListSessionsQueryKey,
  useListStudents, getListStudentsQueryKey,
  useListUsers, getListUsersQueryKey,
  useCreateSession,
  useCreateAttendance, useListAttendance, getListAttendanceQueryKey,
  recognizeTeam, bulkAttendance,
  type TeamMatch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Loader2, UserCheck, Users, Zap, ImagePlus, CalendarCheck, Clock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "../contexts/AuthContext";
import { uploadImageToStorage } from "../lib/uploadImage";

type ScanStatus = "idle" | "uploading" | "recognizing" | "found" | "notfound";

// ---------- Cronograma semanal ----------
// days: 0=Dom 1=Seg 2=Ter 3=Qua 4=Qui 5=Sex 6=Sáb
const WEEKLY_SCHEDULE = [
  { days: [1,2,3,4,5], hour: 19, minute: 0,  modality: "jiu"  as const, instructorKey: "Ewerton"  },
  { days: [1,3,5],      hour: 20, minute: 30, modality: "thai" as const, instructorKey: "Ewerton"  },
  { days: [2,4],        hour: 20, minute: 30, modality: "thai" as const, instructorKey: "Luis"     },
  { days: [6],          hour: 10, minute: 30, modality: "thai" as const, instructorKey: "Nilberto" },
];

function detectCurrentClass(now = new Date()) {
  const day   = now.getDay();
  const total = now.getHours() * 60 + now.getMinutes();
  for (const entry of WEEKLY_SCHEDULE) {
    if (entry.days.includes(day)) {
      const start = entry.hour * 60 + entry.minute;
      if (total >= start - 30 && total <= start + 90) return entry;
    }
  }
  return null;
}

function isToday(date: Date) {
  const t = new Date();
  return date.getFullYear() === t.getFullYear()
      && date.getMonth()    === t.getMonth()
      && date.getDate()     === t.getDate();
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(d: Date) {
  const label = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fmtTime(hour: number, minute: number) {
  return `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
}

function modalitiesOf(m: TeamMatch): ("thai" | "jiu")[] {
  const list: ("thai" | "jiu")[] = [];
  if (m.modalityThai) list.push("thai");
  if (m.modalityJiu) list.push("jiu");
  return list;
}

function studentToMatch(s: {
  userId: number;
  name: string;
  profilePhotoUrl?: string | null;
  modalityThai?: boolean;
  modalityJiu?: boolean;
}): TeamMatch {
  return {
    studentId: s.userId,
    name: s.name,
    profilePhotoUrl: s.profilePhotoUrl ?? null,
    distance: 0,
    modalityThai: !!s.modalityThai,
    modalityJiu: !!s.modalityJiu,
  };
}

export default function Attendance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Bloquear acesso de alunos
  const isMaster = user?.role === "teacher" || user?.role === "admin";

  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [selectedSession, setSelectedSession] = useState("");
  const [matches, setMatches] = useState<TeamMatch[]>([]);
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [confirmedIds, setConfirmedIds] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"team" | "manual">("team");
  const [manualStudent, setManualStudent] = useState("");
  const [teamPreviewUrl, setTeamPreviewUrl] = useState<string | null>(null);
  const [teamPhotoUrl, setTeamPhotoUrl] = useState<string | null>(null);
  const [registeringAll, setRegisteringAll] = useState(false);
  const [autoCreating, setAutoCreating] = useState(false);
  const [manualAdds, setManualAdds] = useState<TeamMatch[]>([]);
  const [teamAddStudent, setTeamAddStudent] = useState("");
  const teamInputRef = useRef<HTMLInputElement>(null);

  const { data: sessions } = useListSessions(
    { modality: undefined },
    { query: { queryKey: getListSessionsQueryKey() } }
  );

  const { data: teachers } = useListUsers(
    { role: "teacher" },
    { query: { queryKey: getListUsersQueryKey({ role: "teacher" }) } }
  );

  const createSessionMutation = useCreateSession();

  // ---- Detecção inteligente da aula atual ----
  const currentClass = detectCurrentClass();

  const currentTeacher = currentClass && teachers
    ? teachers.find(t => t.name.toLowerCase().includes(currentClass.instructorKey.toLowerCase()))
    : null;

  const todaySession = currentClass && sessions
    ? sessions.find(s =>
        s.modality === currentClass.modality &&
        isToday(new Date(s.sessionDate))
      )
    : null;

  // Auto-seleciona sessão de hoje quando carregada (usada na aba manual)
  useEffect(() => {
    if (todaySession && !selectedSession) {
      setSelectedSession(String(todaySession.id));
    }
  }, [todaySession, selectedSession]);

  const handleAutoSession = async () => {
    if (!currentClass) return;
    if (todaySession) {
      setSelectedSession(String(todaySession.id));
      toast({ title: "Sessão de hoje selecionada!" });
      return;
    }
    if (!currentTeacher) {
      toast({ title: "Instrutor não encontrado no sistema. Cadastre-o primeiro.", variant: "destructive" });
      return;
    }
    setAutoCreating(true);
    const now = new Date();
    const sessionDate = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(),
      currentClass.hour, currentClass.minute, 0
    );
    createSessionMutation.mutate(
      {
        data: {
          modality: currentClass.modality,
          sessionDate: sessionDate.toISOString(),
          teacherId: currentTeacher.id,
          description: undefined,
        },
      },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          setSelectedSession(String(created.id));
          toast({ title: "Sessão criada e selecionada automaticamente!" });
          setAutoCreating(false);
        },
        onError: () => {
          toast({ title: "Erro ao criar sessão automática", variant: "destructive" });
          setAutoCreating(false);
        },
      }
    );
  };

  const { data: students } = useListStudents(
    {},
    { query: { queryKey: getListStudentsQueryKey() } }
  );

  const { data: attendance } = useListAttendance(
    { sessionId: selectedSession ? parseInt(selectedSession, 10) : undefined },
    { query: { enabled: !!selectedSession, queryKey: getListAttendanceQueryKey({ sessionId: selectedSession ? parseInt(selectedSession, 10) : undefined }) } }
  );

  // Todas as presenças (todas as sessões/dias) — base para a lista diária de
  // hoje e para o histórico por data mais abaixo na tela.
  const { data: allAttendance } = useListAttendance(
    {},
    { query: { queryKey: getListAttendanceQueryKey() } }
  );

  // Vira o dia automaticamente à meia-noite: ao chegar 00h reavalia a tela e
  // recarrega as presenças, de modo que "Presentes hoje" zere e o dia anterior
  // desça para o histórico mesmo com a tela aberta.
  const [, setDayTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        setDayTick(t => t + 1);
        queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey() });
        schedule();
      }, next.getTime() - now.getTime());
    };
    schedule();
    return () => clearTimeout(timer);
  }, [queryClient]);

  const createAttMutation = useCreateAttendance();

  const confirmAttendance = (studentId: number, faceRecognized: boolean) => {
    if (!selectedSession) {
      toast({ title: "Selecione uma sessão primeiro", variant: "destructive" });
      return;
    }
    if (confirmedIds.has(studentId)) {
      toast({ title: "Presença já registrada para este aluno" });
      return;
    }
    createAttMutation.mutate(
      { data: { sessionId: parseInt(selectedSession, 10), studentId, faceRecognized } },
      {
        onSuccess: () => {
          setConfirmedIds(prev => new Set([...prev, studentId]));
          queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey() });
          toast({ title: "Presença confirmada!" });
        },
        onError: (e: any) => {
          toast({ title: e?.data?.error ?? "Erro ao registrar presença", variant: "destructive" });
        }
      }
    );
  };

  const handleManualAdd = () => {
    if (!manualStudent) {
      toast({ title: "Selecione um aluno", variant: "destructive" });
      return;
    }
    confirmAttendance(parseInt(manualStudent, 10), false);
    setManualStudent("");
  };

  // ---------------- Reconhecimento 100% no servidor ----------------
  const handleTeamPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMatches([]);
    setManualAdds([]);
    setTeamPhotoUrl(null);
    setUnmatchedCount(0);
    setScanStatus("uploading");

    const previewUrl = URL.createObjectURL(file);
    setTeamPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return previewUrl; });

    try {
      const objectPath = await uploadImageToStorage(file);
      setScanStatus("recognizing");
      const result = await recognizeTeam({ objectPath });
      setUnmatchedCount(result.unmatchedCount);
      setTeamPhotoUrl(result.photoUrl);
      if (result.matches.length > 0) {
        setMatches(result.matches);
        setScanStatus("found");
      } else {
        setScanStatus("notfound");
        toast({
          title: "Nenhum aluno identificado na foto",
          description: result.detectedFaces > 0
            ? `${result.detectedFaces} rosto(s) detectado(s), mas nenhum corresponde a um aluno cadastrado.`
            : "Nenhum rosto foi detectado na imagem.",
          variant: "destructive",
        });
      }
    } catch {
      setScanStatus("notfound");
      toast({ title: "Erro ao processar a foto", variant: "destructive" });
    } finally {
      if (teamInputRef.current) teamInputRef.current.value = "";
    }
  };

  const addTeamStudent = (v: string) => {
    const id = parseInt(v, 10);
    const s = students?.find(st => st.userId === id);
    if (!s) return;
    if (matches.some(m => m.studentId === id) || manualAdds.some(m => m.studentId === id)) return;
    setManualAdds(prev => [...prev, studentToMatch(s)]);
    setTeamAddStudent("");
  };

  const handleRegisterAll = async () => {
    if (!user) return;
    const toRegister = [...matches, ...manualAdds].filter(m => !confirmedIds.has(m.studentId));
    if (toRegister.length === 0) {
      toast({ title: "Todos já estão registrados!" });
      return;
    }
    setRegisteringAll(true);
    try {
      const result = await bulkAttendance({
        teacherId: user.id,
        photoUrl: teamPhotoUrl ?? undefined,
        students: toRegister.map(m => ({ studentId: m.studentId, modalities: modalitiesOf(m) })),
      });
      setConfirmedIds(prev => {
        const next = new Set(prev);
        toRegister.forEach(m => next.add(m.studentId));
        return next;
      });
      queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      toast({
        title: `${result.created} presença${result.created !== 1 ? "s" : ""} registrada${result.created !== 1 ? "s" : ""}!`,
        description: result.skipped > 0 ? `${result.skipped} já estavam registradas (ignoradas).` : "Marcadas em todas as modalidades de cada aluno.",
      });
    } catch {
      toast({ title: "Erro ao registrar presenças", variant: "destructive" });
    } finally {
      setRegisteringAll(false);
    }
  };

  const attendedIds = new Set(attendance?.map(a => a.studentId) ?? []);

  // Presentes HOJE: todas as presenças marcadas no dia atual (de todas as
  // sessões/modalidades), deduplicadas por aluno. Zera sozinho à meia-noite,
  // pois passa a não haver mais registros com a data de hoje. Junta também as
  // confirmações locais da foto da equipe (modo team) para feedback imediato.
  const presentList = (() => {
    const map = new Map<number, { studentId: number; name: string; photoUrl: string | null; faceRecognized: boolean }>();
    for (const rec of allAttendance ?? []) {
      if (!isToday(new Date(rec.createdAt))) continue;
      const ex = map.get(rec.studentId);
      map.set(rec.studentId, {
        studentId: rec.studentId,
        name: rec.studentName,
        photoUrl: rec.studentPhotoUrl ?? null,
        faceRecognized: (ex?.faceRecognized ?? false) || (rec.faceRecognized ?? false),
      });
    }
    if (mode === "team") {
      for (const m of [...matches, ...manualAdds]) {
        if (!confirmedIds.has(m.studentId) || map.has(m.studentId)) continue;
        map.set(m.studentId, {
          studentId: m.studentId,
          name: m.name,
          photoUrl: m.profilePhotoUrl ?? null,
          faceRecognized: matches.some(x => x.studentId === m.studentId),
        });
      }
    }
    return [...map.values()];
  })();

  // Histórico de presenças agrupado por dia (exclui hoje, que aparece acima).
  const historyByDay = (() => {
    const groups = new Map<string, { label: string; ts: number; students: Map<number, { name: string; photoUrl: string | null; faceRecognized: boolean; thai: boolean; jiu: boolean }> }>();
    for (const rec of allAttendance ?? []) {
      const d = new Date(rec.createdAt);
      if (isToday(d)) continue;
      const key = dayKey(d);
      let g = groups.get(key);
      if (!g) {
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        g = { label: dayLabel(d), ts: dayStart.getTime(), students: new Map() };
        groups.set(key, g);
      }
      const ex = g.students.get(rec.studentId);
      g.students.set(rec.studentId, {
        name: rec.studentName,
        photoUrl: rec.studentPhotoUrl ?? null,
        faceRecognized: (ex?.faceRecognized ?? false) || (rec.faceRecognized ?? false),
        thai: (ex?.thai ?? false) || rec.modality === "thai",
        jiu: (ex?.jiu ?? false) || rec.modality === "jiu",
      });
    }
    return [...groups.values()]
      .sort((a, b) => b.ts - a.ts)
      .map(g => ({ label: g.label, ts: g.ts, students: [...g.students.values()] }));
  })();

  const teamAddCandidates = (students ?? []).filter(s =>
    !matches.some(m => m.studentId === s.userId) &&
    !manualAdds.some(m => m.studentId === s.userId) &&
    !confirmedIds.has(s.userId)
  );

  if (!isMaster) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <ShieldAlert size={32} className="text-primary" />
        </div>
        <h2 className="text-2xl font-black uppercase">Acesso restrito</h2>
        <p className="text-muted-foreground max-w-sm">
          O controle de presenças é exclusivo para professores e administradores.
          Consulte seu professor para ver seu histórico.
        </p>
        <Button variant="outline" onClick={() => setLocation("/dashboard")}>Voltar ao Painel</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-black tracking-tight uppercase">Controle de Presença</h1>
        <p className="text-muted-foreground mt-1">Envie a foto pós-treino da equipe — o reconhecimento facial é feito no servidor e marca a presença em todas as modalidades de cada aluno</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">

          {/* Banner inteligente de aula atual */}
          {currentClass ? (
            <div className={`rounded-xl border p-4 flex items-center gap-4 ${
              todaySession
                ? "bg-green-500/10 border-green-500/30"
                : "bg-primary/10 border-primary/30"
            }`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                todaySession ? "bg-green-500/20" : "bg-primary/20"
              }`}>
                {todaySession ? <CalendarCheck size={20} className="text-green-400" /> : <Clock size={20} className="text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">
                  {currentClass.modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"} — {fmtTime(currentClass.hour, currentClass.minute)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {currentTeacher ? currentTeacher.name : `Instrutor: ${currentClass.instructorKey}`}
                  {todaySession ? " · Sessão já aberta" : " · Nenhuma sessão criada hoje"}
                </div>
              </div>
              <Button
                size="sm"
                variant={todaySession ? "outline" : "default"}
                disabled={autoCreating}
                onClick={handleAutoSession}
              >
                {autoCreating
                  ? <><Loader2 size={13} className="animate-spin mr-1" />Criando...</>
                  : todaySession
                    ? <><CalendarCheck size={13} className="mr-1" />Selecionar</>
                    : <><Zap size={13} className="mr-1" />Abrir aula</>
                }
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center gap-3 text-muted-foreground text-sm">
              <Clock size={16} />
              <span>Nenhuma aula no cronograma para este horário</span>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button
              data-testid="button-mode-team"
              variant={mode === "team" ? "default" : "outline"}
              onClick={() => { setMode("team"); }}
            >
              <ImagePlus size={16} className="mr-2" /> Foto da equipe
            </Button>
            <Button
              data-testid="button-mode-manual"
              variant={mode === "manual" ? "default" : "outline"}
              onClick={() => { setMode("manual"); }}
            >
              <Users size={16} className="mr-2" /> Manual
            </Button>
          </div>

          {mode === "team" && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Preview da foto */}
              {teamPreviewUrl && (
                <div className="relative">
                  <img
                    src={teamPreviewUrl}
                    alt="Foto pós-treino"
                    className="w-full max-h-72 object-cover"
                  />
                  {(scanStatus === "uploading" || scanStatus === "recognizing") && (
                    <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-3 px-6">
                      <Loader2 size={36} className="animate-spin text-primary" />
                      <span className="text-sm font-semibold text-white text-center">
                        {scanStatus === "uploading" ? "Enviando foto…" : "Reconhecendo rostos no servidor…"}
                      </span>
                    </div>
                  )}
                  {matches.length > 0 && scanStatus === "found" && (
                    <div className="absolute top-3 left-3 bg-black/70 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                      <CheckCircle size={13} className="text-green-400" />
                      {matches.length} identificado{matches.length !== 1 ? "s" : ""}
                      {unmatchedCount > 0 && <span className="text-muted-foreground"> · {unmatchedCount} não reconhecido{unmatchedCount !== 1 ? "s" : ""}</span>}
                    </div>
                  )}
                </div>
              )}

              <div className="p-5 space-y-4">
                <div>
                  <h3 className="font-bold text-sm uppercase tracking-wide">Foto Pós-Treino</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Envie a foto do grupo — o servidor identifica cada aluno e registra a presença em todas as modalidades que ele treina</p>
                </div>

                <input
                  ref={teamInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleTeamPhoto}
                  data-testid="input-team-photo"
                />
                <Button
                  onClick={() => teamInputRef.current?.click()}
                  disabled={scanStatus === "uploading" || scanStatus === "recognizing"}
                  className="w-full"
                  size="lg"
                  data-testid="button-team-photo"
                >
                  {scanStatus === "uploading" || scanStatus === "recognizing"
                    ? <><Loader2 size={16} className="animate-spin mr-2" />Processando…</>
                    : <><ImagePlus size={16} className="mr-2" />{teamPreviewUrl ? "Trocar foto" : "Enviar foto do grupo"}</>
                  }
                </Button>

                {scanStatus === "notfound" && (
                  <div className="flex items-center gap-2 text-sm text-red-400">
                    <XCircle size={14} /> Nenhum aluno identificado — certifique-se que os rostos estão cadastrados (foto de perfil) no sistema
                  </div>
                )}

                {(matches.length > 0 || manualAdds.length > 0 || scanStatus === "found" || scanStatus === "notfound") && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Confira a lista, remova quem não treinou e adicione quem faltou. Depois confirme a presença.
                    </p>

                    {(matches.length > 0 || manualAdds.length > 0) && (
                      <div className="space-y-2">
                        {[...matches, ...manualAdds].map(m => {
                          const alreadyIn = confirmedIds.has(m.studentId);
                          const isManual = manualAdds.some(a => a.studentId === m.studentId);
                          const mods = modalitiesOf(m);
                          return (
                            <div key={m.studentId} data-testid={`match-${m.studentId}`} className={`flex items-center gap-3 p-3 rounded-lg border ${alreadyIn ? "bg-green-500/10 border-green-500/30" : "bg-muted/40 border-border"}`}>
                              <div className="w-10 h-10 rounded-full bg-muted border border-border overflow-hidden shrink-0">
                                {m.profilePhotoUrl
                                  ? <img src={m.profilePhotoUrl} alt={m.name} className="w-full h-full object-cover" />
                                  : <div className="w-full h-full flex items-center justify-center text-sm font-bold">{m.name.charAt(0)}</div>
                                }
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm">{m.name}</div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {mods.map(mod => (
                                    <span key={mod} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${mod === "thai" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>
                                      {mod === "thai" ? "MUAY THAI" : "JIU-JITSU"}
                                    </span>
                                  ))}
                                  <span className="text-xs text-muted-foreground">{isManual ? "Adicionado manualmente" : `Confiança: ${((1 - m.distance) * 100).toFixed(0)}%`}</span>
                                </div>
                              </div>
                              {alreadyIn
                                ? <CheckCircle size={18} className="text-green-400 shrink-0" />
                                : <button
                                    type="button"
                                    onClick={() => isManual
                                      ? setManualAdds(prev => prev.filter(x => x.studentId !== m.studentId))
                                      : setMatches(prev => prev.filter(x => x.studentId !== m.studentId))}
                                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                                    title="Remover este aluno"
                                    aria-label={`Remover ${m.name}`}
                                    data-testid={`button-remove-match-${m.studentId}`}
                                  >
                                    <XCircle size={18} />
                                  </button>
                              }
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {matches.length === 0 && manualAdds.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Nenhum aluno reconhecido automaticamente. Use o seletor abaixo para adicionar quem treinou.
                      </p>
                    )}

                    {/* Adicionar quem faltou */}
                    <Select value={teamAddStudent} onValueChange={addTeamStudent}>
                      <SelectTrigger data-testid="select-team-add-student">
                        <SelectValue placeholder="Adicionar quem faltou..." />
                      </SelectTrigger>
                      <SelectContent>
                        {teamAddCandidates.length === 0
                          ? <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum aluno disponível</div>
                          : teamAddCandidates.map(s => (
                            <SelectItem key={s.userId} value={String(s.userId)}>{s.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>

                    {[...matches, ...manualAdds].some(m => !confirmedIds.has(m.studentId)) && (
                      <Button
                        className="w-full"
                        onClick={handleRegisterAll}
                        disabled={registeringAll}
                        data-testid="button-register-all"
                      >
                        {registeringAll
                          ? <><Loader2 size={16} className="animate-spin mr-2" />Registrando...</>
                          : <><UserCheck size={16} className="mr-2" />Confirmar {[...matches, ...manualAdds].filter(m => !confirmedIds.has(m.studentId)).length} presença{[...matches, ...manualAdds].filter(m => !confirmedIds.has(m.studentId)).length !== 1 ? "s" : ""}</>
                        }
                      </Button>
                    )}

                    {unmatchedCount > 0 && (
                      <p className="text-xs text-muted-foreground text-center">
                        O servidor detectou {unmatchedCount} rosto{unmatchedCount !== 1 ? "s" : ""} a mais que não casaram com alunos cadastrados — podem ser detecções falsas. Confira a lista e adicione manualmente quem faltar.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === "manual" && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">Adicionar Presença Manualmente</h3>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Sessão de Treino</label>
                <Select value={selectedSession} onValueChange={setSelectedSession} data-testid="select-session">
                  <SelectTrigger data-testid="select-session-trigger">
                    <SelectValue placeholder="Selecione a sessão..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions?.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        <span className={`font-bold mr-2 ${s.modality === "thai" ? "text-red-400" : "text-blue-400"}`}>
                          {s.modality === "thai" ? "[MT]" : "[JJ]"}
                        </span>
                        {new Date(s.sessionDate).toLocaleString("pt-BR")} — {s.description ?? "Treino"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3">
                <Select value={manualStudent} onValueChange={setManualStudent}>
                  <SelectTrigger data-testid="select-manual-student" className="flex-1">
                    <SelectValue placeholder="Selecionar aluno..." />
                  </SelectTrigger>
                  <SelectContent>
                    {students?.map(s => (
                      <SelectItem key={s.userId} value={String(s.userId)}>
                        {s.name}
                        {(attendedIds.has(s.userId) || confirmedIds.has(s.userId)) && " ✓"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  data-testid="button-manual-add"
                  onClick={handleManualAdd}
                  disabled={!manualStudent || !selectedSession || createAttMutation.isPending}
                >
                  <UserCheck size={14} className="mr-2" /> Adicionar
                </Button>
              </div>

              {!selectedSession && (
                <p className="text-xs text-primary">⚠ Selecione uma sessão de treino antes de adicionar presenças manuais</p>
              )}

              <div className="space-y-2">
                {students?.filter(s => attendedIds.has(s.userId) || confirmedIds.has(s.userId)).map(s => (
                  <div key={s.userId} className="flex items-center gap-2 text-sm text-green-400">
                    <CheckCircle size={14} /> {s.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserCheck size={18} className="text-primary" />
            <h2 className="font-bold uppercase tracking-wide text-sm">Presentes hoje</h2>
            <span className="ml-auto text-sm font-bold text-primary">{presentList.length}</span>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2 mb-3">Lista do dia — zera automaticamente à meia-noite</p>
          {presentList.length > 0 ? (
            <div className="space-y-2 max-h-[480px] overflow-y-auto">
              {presentList.map(p => (
                <div key={p.studentId} data-testid={`att-confirmed-${p.studentId}`} className="flex items-center gap-2 py-2 border-b border-border/50 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-muted border border-border overflow-hidden shrink-0">
                    {p.photoUrl
                      ? <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">{p.name.charAt(0)}</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    {p.faceRecognized && <div className="text-xs text-green-400">Facial</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-xs">
              Nenhuma presença marcada hoje ainda
            </div>
          )}
        </div>
      </div>

      {/* Histórico de presenças por dia */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarCheck size={18} className="text-primary" />
          <h2 className="font-bold uppercase tracking-wide text-sm">Histórico por dia</h2>
          {historyByDay.length > 0 && (
            <span className="ml-auto text-sm font-bold text-primary">{historyByDay.length} dia{historyByDay.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        {historyByDay.length > 0 ? (
          <div className="space-y-5 max-h-[640px] overflow-y-auto pr-1">
            {historyByDay.map(day => (
              <div key={day.ts}>
                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-card py-1">
                  <span className="text-sm font-bold capitalize">{day.label}</span>
                  <span className="ml-auto text-xs font-bold text-muted-foreground">{day.students.length} presente{day.students.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-2">
                  {day.students.map(s => (
                    <div key={s.name + day.ts} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
                      <div className="w-7 h-7 rounded-full bg-muted border border-border overflow-hidden shrink-0">
                        {s.photoUrl
                          ? <img src={s.photoUrl} alt={s.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-muted-foreground">{s.name.charAt(0)}</div>
                        }
                      </div>
                      <div className="text-sm font-medium truncate flex-1 min-w-0">{s.name}</div>
                      <div className="flex items-center gap-1 shrink-0">
                        {s.thai && <span className="text-[10px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">MT</span>}
                        {s.jiu && <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">JJ</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-xs">Nenhum registro de dias anteriores</div>
        )}
      </div>
    </div>
  );
}

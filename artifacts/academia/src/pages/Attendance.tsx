// ============================================================
// Attendance.tsx — Controle de presença da academia
//
// Esta é a página mais complexa do sistema. Ela combina:
//   1. Detecção inteligente da aula atual (baseada no horário)
//   2. Dois modos de registro de presença:
//      - "Foto da equipe": envia foto para o servidor que
//        identifica os rostos via IA e marca as presenças
//      - "Manual": seleciona aluno + sessão manualmente
//   3. Lista de presentes hoje (atualiza em tempo real)
//   4. Histórico de presenças agrupado por dia
//
// Acesso restrito a professores e admins — alunos veem uma
// tela de "acesso restrito" ao tentar entrar nesta página.
// ============================================================

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

// ============================================================
// Tipo do status do escaneamento de foto
//
// idle       → nenhuma foto enviada ainda
// uploading  → enviando a foto para o object storage
// recognizing→ servidor processando o reconhecimento facial
// found      → pelo menos um aluno foi identificado
// notfound   → nenhum aluno foi identificado na foto
// ============================================================
type ScanStatus = "idle" | "uploading" | "recognizing" | "found" | "notfound";

// ============================================================
// Cronograma semanal da academia
//
// Define quando cada aula acontece durante a semana.
// days: índices dos dias da semana (0=Dom, 1=Seg ... 6=Sáb)
// hour/minute: horário de início da aula
// modality: "thai" (Muay Thai) ou "jiu" (Jiu-Jitsu)
// instructorKey: parte do nome do instrutor, usado para
//   encontrar o professor correspondente na lista da API
//
// Esses dados são estáticos e não vêm do banco de dados.
// ============================================================
const WEEKLY_SCHEDULE = [
  { days: [1,2,3,4,5], hour: 19, minute: 0,  modality: "jiu"  as const, instructorKey: "Ewerton"  },
  { days: [1,3,5],      hour: 20, minute: 30, modality: "thai" as const, instructorKey: "Ewerton"  },
  { days: [2,4],        hour: 20, minute: 30, modality: "thai" as const, instructorKey: "Luis"     },
  { days: [6],          hour: 10, minute: 30, modality: "thai" as const, instructorKey: "Nilberto" },
];

// ============================================================
// detectCurrentClass — detecta se há uma aula acontecendo agora
//
// Percorre o cronograma e verifica se o horário atual está
// dentro de uma janela de 30 min antes até 90 min depois do
// início da aula. Isso permite que o professor abra a aula
// com antecedência e ainda marque presenças após o treino.
//
// Retorna o item do cronograma correspondente ou null se não
// houver aula no momento.
// ============================================================
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

// Verifica se uma data é hoje comparando ano, mês e dia
function isToday(date: Date) {
  const t = new Date();
  return date.getFullYear() === t.getFullYear()
      && date.getMonth()    === t.getMonth()
      && date.getDate()     === t.getDate();
}

// Gera uma chave única para um dia no formato "YYYY-MM-DD",
// usada para agrupar presenças por dia no histórico
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Formata uma data com dia da semana e data por extenso em pt-BR,
// com a primeira letra em maiúscula (ex: "Segunda-feira, 28 de junho")
function dayLabel(d: Date) {
  const label = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Formata hora e minuto com zero à esquerda (ex: 9:5 → "09:05")
function fmtTime(hour: number, minute: number) {
  return `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
}

// Extrai as modalidades de um TeamMatch como array.
// Um aluno pode treinar Thai, Jiu ou ambos — essa função
// retorna apenas as modalidades que ele efetivamente pratica.
function modalitiesOf(m: TeamMatch): ("thai" | "jiu")[] {
  const list: ("thai" | "jiu")[] = [];
  if (m.modalityThai) list.push("thai");
  if (m.modalityJiu)  list.push("jiu");
  return list;
}

// Converte um objeto de aluno (da lista de students) para o
// formato TeamMatch usado pela lista de identificados.
// distance: 0 indica que foi adicionado manualmente (não por IA)
function studentToMatch(s: {
  userId: number;
  name: string;
  profilePhotoUrl?: string | null;
  modalityThai?: boolean;
  modalityJiu?: boolean;
}): TeamMatch {
  return {
    studentId:      s.userId,
    name:           s.name,
    profilePhotoUrl: s.profilePhotoUrl ?? null,
    distance:       0,
    modalityThai:   !!s.modalityThai,
    modalityJiu:    !!s.modalityJiu,
  };
}

// ============================================================
// Componente principal: Attendance
// ============================================================
export default function Attendance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Controle de acesso: apenas professores e admins podem
  // acessar esta página. Alunos veem a tela de bloqueio.
  const isMaster = user?.role === "teacher" || user?.role === "admin";

  // ----------------------------------------------------------
  // Estados locais da página
  //
  // scanStatus: estado atual do processo de reconhecimento facial
  // selectedSession: ID da sessão selecionada no modo manual
  // matches: alunos identificados pelo reconhecimento facial
  // unmatchedCount: rostos detectados mas não identificados
  // confirmedIds: Set de IDs de alunos com presença já registrada
  //   (Set é usado por performance — has() é O(1) vs O(n) do array)
  // mode: "team" (foto) ou "manual" (seleção individual)
  // manualStudent: ID do aluno selecionado no modo manual
  // teamPreviewUrl: URL local da foto para preview antes do upload
  // teamPhotoUrl: URL da foto no servidor após o upload (usada
  //   no bulk attendance para associar a foto às presenças)
  // registeringAll: true enquanto o bulk attendance está em andamento
  // autoCreating: true enquanto a sessão automática está sendo criada
  // manualAdds: alunos adicionados manualmente à lista da foto
  // teamAddStudent: valor do select "adicionar quem faltou"
  // ----------------------------------------------------------
  const [scanStatus, setScanStatus]         = useState<ScanStatus>("idle");
  const [selectedSession, setSelectedSession] = useState("");
  const [matches, setMatches]               = useState<TeamMatch[]>([]);
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [confirmedIds, setConfirmedIds]     = useState<Set<number>>(new Set());
  const [mode, setMode]                     = useState<"team" | "manual">("team");
  const [manualStudent, setManualStudent]   = useState("");
  const [teamPreviewUrl, setTeamPreviewUrl] = useState<string | null>(null);
  const [teamPhotoUrl, setTeamPhotoUrl]     = useState<string | null>(null);
  const [registeringAll, setRegisteringAll] = useState(false);
  const [autoCreating, setAutoCreating]     = useState(false);
  const [manualAdds, setManualAdds]         = useState<TeamMatch[]>([]);
  const [teamAddStudent, setTeamAddStudent] = useState("");

  // Ref para o input de arquivo oculto da foto da equipe.
  // Usamos ref em vez de estado para controlar o input diretamente
  // (limpar o valor após o upload sem re-renderizar o componente)
  const teamInputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------------
  // Queries de dados da API
  // ----------------------------------------------------------

  // Lista todas as sessões (sem filtro de modalidade) para
  // popular o select de sessão no modo manual e para detectar
  // se já existe uma sessão hoje no cronograma atual
  const { data: sessions } = useListSessions(
    { modality: undefined },
    { query: { queryKey: getListSessionsQueryKey() } }
  );

  // Lista os professores para encontrar o instrutor da aula
  // atual e usá-lo na criação automática de sessão
  const { data: teachers } = useListUsers(
    { role: "teacher" },
    { query: { queryKey: getListUsersQueryKey({ role: "teacher" }) } }
  );

  const createSessionMutation = useCreateSession();

  // ----------------------------------------------------------
  // Detecção inteligente da aula atual
  //
  // currentClass: aula que deveria estar acontecendo agora
  //   baseada no WEEKLY_SCHEDULE e no horário atual
  //
  // currentTeacher: professor cadastrado no sistema que
  //   corresponde ao instrutor da aula atual. A busca é feita
  //   por .includes() para ser tolerante a variações de nome
  //   (ex: "Mestre Ewerton" vs "Ewerton Silva")
  //
  // todaySession: sessão já criada no banco para a aula atual.
  //   Se existir, o botão mostra "Selecionar" em vez de "Abrir aula"
  // ----------------------------------------------------------
  const currentClass = detectCurrentClass();

  const currentTeacher = currentClass && Array.isArray(teachers)
    ? teachers.find(t => t.name.toLowerCase().includes(currentClass.instructorKey.toLowerCase()))
    : null;

  const todaySession = currentClass && Array.isArray(sessions)
    ? sessions.find(s =>
        s.modality === currentClass.modality &&
        isToday(new Date(s.sessionDate))
      )
    : null;

  // Auto-seleciona a sessão de hoje no modo manual quando
  // ela é detectada, evitando que o professor precise selecionar
  // manualmente uma sessão que já é óbvia
  useEffect(() => {
    if (todaySession && !selectedSession) {
      setSelectedSession(String(todaySession.id));
    }
  }, [todaySession, selectedSession]);

  // ----------------------------------------------------------
  // handleAutoSession — cria ou seleciona a sessão de hoje
  //
  // Se já existe uma sessão para a aula atual: apenas a seleciona
  // Se não existe: cria uma nova sessão com os dados do cronograma
  //   (modalidade, horário exato de início, professor detectado)
  //   e a seleciona após a criação bem-sucedida
  // ----------------------------------------------------------
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
    // Cria a data exata de início da aula (hoje + horário do cronograma)
    const sessionDate = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(),
      currentClass.hour, currentClass.minute, 0
    );
    createSessionMutation.mutate(
      { data: { modality: currentClass.modality, sessionDate: sessionDate.toISOString(), teacherId: currentTeacher.id, description: undefined } },
      {
        onSuccess: (created) => {
          // Invalida o cache de sessões para que a nova sessão
          // apareça no select do modo manual imediatamente
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

  // Lista todos os alunos (sem filtro) para popular os selects
  // de adição manual no modo foto e no modo manual
  const { data: students } = useListStudents(
    {},
    { query: { queryKey: getListStudentsQueryKey() } }
  );

  // Presenças da sessão selecionada — usadas no modo manual
  // para indicar quais alunos já foram marcados (✓ no select).
  // A query só é executada quando há uma sessão selecionada
  // (enabled: !!selectedSession evita requisição desnecessária)
  const { data: attendance } = useListAttendance(
    { sessionId: selectedSession ? parseInt(selectedSession, 10) : undefined },
    { query: { enabled: !!selectedSession, queryKey: getListAttendanceQueryKey({ sessionId: selectedSession ? parseInt(selectedSession, 10) : undefined }) } }
  );

  // Todas as presenças do sistema (sem filtro de sessão).
  // Usadas para montar a lista "Presentes hoje" e o histórico
  // por dia. Busca separada para não depender da sessão selecionada.
  const { data: allAttendance } = useListAttendance(
    {},
    { query: { queryKey: getListAttendanceQueryKey() } }
  );

  // ----------------------------------------------------------
  // Timer de virada de dia
  //
  // Agenda um setTimeout para disparar exatamente à meia-noite
  // (00:00:01 do dia seguinte). Quando dispara:
  //   - Força re-render do componente (setDayTick)
  //   - Invalida o cache de presenças para recarregar do servidor
  //   - Reagenda o próximo timer para a próxima meia-noite
  //
  // Isso faz a lista "Presentes hoje" zerar automaticamente
  // sem que o professor precise recarregar a página.
  // O cleanup (return () => clearTimeout) evita memory leak
  // quando o componente é desmontado.
  // ----------------------------------------------------------
  const [, setDayTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now  = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        setDayTick(t => t + 1);
        queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey() });
        schedule(); // reagenda para a próxima meia-noite
      }, next.getTime() - now.getTime());
    };
    schedule();
    return () => clearTimeout(timer);
  }, [queryClient]);

  const createAttMutation = useCreateAttendance();

  // ----------------------------------------------------------
  // confirmAttendance — registra presença individual
  //
  // Valida se há sessão selecionada e se o aluno já foi
  // confirmado (evita duplicatas). Após sucesso, adiciona o
  // ID ao Set local (feedback imediato) e invalida o cache
  // para sincronizar com o servidor.
  //
  // faceRecognized: true quando veio do reconhecimento facial,
  //   false quando adicionado manualmente
  // ----------------------------------------------------------
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
          // Spread do Set anterior + novo ID para criar um novo Set
          // (Sets são mutáveis, mas React precisa de nova referência
          // para detectar a mudança e re-renderizar)
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

  // Registra presença do aluno selecionado no modo manual
  // e limpa o select para facilitar adicionar o próximo
  const handleManualAdd = () => {
    if (!manualStudent) {
      toast({ title: "Selecione um aluno", variant: "destructive" });
      return;
    }
    confirmAttendance(parseInt(manualStudent, 10), false);
    setManualStudent("");
  };

  // ----------------------------------------------------------
  // handleTeamPhoto — processa a foto da equipe
  //
  // Fluxo completo:
  // 1. Lê o arquivo selecionado pelo input de arquivo
  // 2. Cria uma URL local (createObjectURL) para preview
  //    imediato sem precisar esperar o upload
  // 3. Envia a foto para o object storage (etapa 1 do upload)
  // 4. Chama a API de reconhecimento com o objectPath retornado
  //    (o reconhecimento facial acontece 100% no servidor)
  // 5. Atualiza o estado com os alunos identificados
  //
  // Por que revokeObjectURL?
  // createObjectURL cria uma referência na memória do browser.
  // Se não for liberada, causa memory leak. Revogamos a URL
  // anterior antes de criar uma nova.
  // ----------------------------------------------------------
  const handleTeamPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limpa estado anterior antes de processar nova foto
    setMatches([]);
    setManualAdds([]);
    setTeamPhotoUrl(null);
    setUnmatchedCount(0);
    setScanStatus("uploading");

    // Preview imediato da foto antes do upload
    const previewUrl = URL.createObjectURL(file);
    setTeamPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev); // libera memória da URL anterior
      return previewUrl;
    });

    try {
      // Etapa 1: upload para object storage, retorna o caminho do objeto
      const objectPath = await uploadImageToStorage(file);
      setScanStatus("recognizing");

      // Etapa 2: reconhecimento facial no servidor usando o caminho do objeto
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
      // Limpa o input para permitir enviar a mesma foto novamente
      if (teamInputRef.current) teamInputRef.current.value = "";
    }
  };

  // Adiciona um aluno manualmente à lista de identificados na foto.
  // Verifica duplicatas antes de adicionar para evitar registros duplos.
  const addTeamStudent = (v: string) => {
    const id = parseInt(v, 10);
    const s = Array.isArray(students) ? students.find(st => st.userId === id) : undefined;
    if (!s) return;
    if (matches.some(m => m.studentId === id) || manualAdds.some(m => m.studentId === id)) return;
    setManualAdds(prev => [...prev, studentToMatch(s)]);
    setTeamAddStudent("");
  };

  // ----------------------------------------------------------
  // handleRegisterAll — registra presença em lote
  //
  // Envia de uma vez as presenças de todos os alunos na lista
  // (identificados pela IA + adicionados manualmente), exceto
  // os que já foram confirmados anteriormente.
  //
  // Usa bulkAttendance (endpoint otimizado para múltiplos alunos)
  // em vez de chamadas individuais para evitar N requisições.
  //
  // photoUrl: passa a URL da foto para o servidor associar
  //   a foto da equipe a cada registro de presença
  // ----------------------------------------------------------
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

      // Atualiza o Set local com todos os IDs recém-registrados
      setConfirmedIds(prev => {
        const next = new Set(prev);
        toRegister.forEach(m => next.add(m.studentId));
        return next;
      });

      // Invalida caches de presenças E sessões (pois attendanceCount
      // da sessão muda quando novas presenças são adicionadas)
      queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });

      toast({
        title: `${result.created} presença${result.created !== 1 ? "s" : ""} registrada${result.created !== 1 ? "s" : ""}!`,
        description: result.skipped > 0
          ? `${result.skipped} já estavam registradas (ignoradas).`
          : "Marcadas em todas as modalidades de cada aluno.",
      });
    } catch {
      toast({ title: "Erro ao registrar presenças", variant: "destructive" });
    } finally {
      setRegisteringAll(false);
    }
  };

  // Set de IDs de alunos já presentes na sessão selecionada
  // (vindo do servidor). Usado para mostrar ✓ no select manual.
  const attendedIds = new Set(Array.isArray(attendance) ? attendance.map(a => a.studentId) : []);

  // ----------------------------------------------------------
  // presentList — lista de presentes HOJE
  //
  // Monta a lista deduplicada de alunos presentes no dia atual
  // a partir de TODAS as sessões/modalidades do dia.
  //
  // Usa um Map<studentId, dados> para deduplicar: se o mesmo
  // aluno aparece em Thai E Jiu no mesmo dia, aparece uma vez.
  //
  // faceRecognized: true se em QUALQUER presença do dia o aluno
  //   foi identificado por reconhecimento facial.
  //
  // No modo "team", também inclui alunos confirmados localmente
  //   (confirmedIds) que ainda não chegaram do servidor, para
  //   feedback visual imediato após registrar a foto.
  // ----------------------------------------------------------
  const presentList = (() => {
    const map = new Map<number, { studentId: number; name: string; photoUrl: string | null; faceRecognized: boolean }>();

    for (const rec of (Array.isArray(allAttendance) ? allAttendance : [])) {
      if (!isToday(new Date(rec.createdAt))) continue;
      const ex = map.get(rec.studentId);
      map.set(rec.studentId, {
        studentId:     rec.studentId,
        name:          rec.studentName,
        photoUrl:      rec.studentPhotoUrl ?? null,
        // Se qualquer presença do dia foi por facial, marca como facial
        faceRecognized: (ex?.faceRecognized ?? false) || (rec.faceRecognized ?? false),
      });
    }

    // Adiciona confirmações locais do modo foto para feedback imediato
    if (mode === "team") {
      for (const m of [...matches, ...manualAdds]) {
        if (!confirmedIds.has(m.studentId) || map.has(m.studentId)) continue;
        map.set(m.studentId, {
          studentId:     m.studentId,
          name:          m.name,
          photoUrl:      m.profilePhotoUrl ?? null,
          faceRecognized: matches.some(x => x.studentId === m.studentId),
        });
      }
    }

    return [...map.values()];
  })();

  // ----------------------------------------------------------
  // historyByDay — histórico de presenças agrupado por dia
  //
  // Agrupa todas as presenças (exceto hoje) por data.
  // Estrutura: Map<"YYYY-MM-DD", { label, ts, students: Map }>
  //
  // Usa Map interno de students para deduplicar por aluno
  // dentro do mesmo dia (mesmo aluno em Thai + Jiu = 1 entrada).
  //
  // O resultado é ordenado do dia mais recente para o mais antigo
  // (.sort com b.ts - a.ts = ordem decrescente de timestamp).
  // ----------------------------------------------------------
  const historyByDay = (() => {
    const groups = new Map<string, {
      label: string;
      ts: number;
      students: Map<number, { name: string; photoUrl: string | null; faceRecognized: boolean; thai: boolean; jiu: boolean }>;
    }>();

    for (const rec of (Array.isArray(allAttendance) ? allAttendance : [])) {
      const d = new Date(rec.createdAt);
      if (isToday(d)) continue; // hoje fica na lista "Presentes hoje"

      const key = dayKey(d);
      let g = groups.get(key);
      if (!g) {
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        g = { label: dayLabel(d), ts: dayStart.getTime(), students: new Map() };
        groups.set(key, g);
      }

      const ex = g.students.get(rec.studentId);
      g.students.set(rec.studentId, {
        name:          rec.studentName,
        photoUrl:      rec.studentPhotoUrl ?? null,
        faceRecognized: (ex?.faceRecognized ?? false) || (rec.faceRecognized ?? false),
        // Acumula modalidades: se treinou Thai em uma sessão e Jiu em outra,
        // ambas ficam marcadas na entrada do histórico daquele dia
        thai: (ex?.thai ?? false) || rec.modality === "thai",
        jiu:  (ex?.jiu  ?? false) || rec.modality === "jiu",
      });
    }

    return [...groups.values()]
      .sort((a, b) => b.ts - a.ts) // mais recente primeiro
      .map(g => ({ label: g.label, ts: g.ts, students: [...g.students.values()] }));
  })();

  // Candidatos para adicionar manualmente à lista da foto:
  // todos os alunos que ainda não estão na lista (nem como
  // identificado pela IA, nem como adicionado manualmente,
  // nem como já confirmado)
  const teamAddCandidates = (Array.isArray(students) ? students : []).filter(s =>
    !matches.some(m => m.studentId === s.userId) &&
    !manualAdds.some(m => m.studentId === s.userId) &&
    !confirmedIds.has(s.userId)
  );

  // ----------------------------------------------------------
  // Tela de acesso restrito para alunos
  //
  // Renderizado antes do return principal para não executar
  // nenhum JSX da página real quando o acesso é negado
  // ----------------------------------------------------------
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

      {/* Cabeçalho da página */}
      <div>
        <h1 className="text-3xl font-black tracking-tight uppercase">Controle de Presença</h1>
        <p className="text-muted-foreground mt-1">
          Envie a foto pós-treino da equipe — o reconhecimento facial é feito no servidor
          e marca a presença em todas as modalidades de cada aluno
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">

          {/* --------------------------------------------------------
              Banner inteligente de aula atual

              Aparece em verde se já existe sessão criada para a aula
              atual, em azul/primário se a aula está no horário mas
              a sessão ainda não foi criada.

              O botão muda de "Abrir aula" (cria nova sessão) para
              "Selecionar" (seleciona a sessão já existente).

              Se não há aula no horário atual, exibe uma mensagem
              neutra informativa sem botão de ação.
          -------------------------------------------------------- */}
          {currentClass ? (
            <div className={`rounded-xl border p-4 flex items-center gap-4 ${
              todaySession
                ? "bg-green-500/10 border-green-500/30"
                : "bg-primary/10 border-primary/30"
            }`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                todaySession ? "bg-green-500/20" : "bg-primary/20"
              }`}>
                {todaySession
                  ? <CalendarCheck size={20} className="text-green-400" />
                  : <Clock size={20} className="text-primary" />
                }
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

          {/* Alternador de modo: Foto da equipe vs Manual */}
          <div className="flex gap-2 flex-wrap">
            <Button
              data-testid="button-mode-team"
              variant={mode === "team" ? "default" : "outline"}
              onClick={() => setMode("team")}
            >
              <ImagePlus size={16} className="mr-2" /> Foto da equipe
            </Button>
            <Button
              data-testid="button-mode-manual"
              variant={mode === "manual" ? "default" : "outline"}
              onClick={() => setMode("manual")}
            >
              <Users size={16} className="mr-2" /> Manual
            </Button>
          </div>

          {/* --------------------------------------------------------
              Modo "Foto da equipe"

              Fluxo visual:
              1. Botão "Enviar foto do grupo" → abre seletor de arquivo
              2. Preview da foto aparece imediatamente (URL local)
              3. Overlay de loading enquanto processa (upload + IA)
              4. Lista de alunos identificados com opção de remover
              5. Select para adicionar quem não foi reconhecido
              6. Botão "Confirmar X presenças" → bulk attendance
          -------------------------------------------------------- */}
          {mode === "team" && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">

              {/* Preview da foto com overlay de status */}
              {teamPreviewUrl && (
                <div className="relative">
                  <img src={teamPreviewUrl} alt="Foto pós-treino" className="w-full max-h-72 object-cover" />

                  {/* Overlay de loading durante upload/reconhecimento */}
                  {(scanStatus === "uploading" || scanStatus === "recognizing") && (
                    <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-3 px-6">
                      <Loader2 size={36} className="animate-spin text-primary" />
                      <span className="text-sm font-semibold text-white text-center">
                        {scanStatus === "uploading" ? "Enviando foto…" : "Reconhecendo rostos no servidor…"}
                      </span>
                    </div>
                  )}

                  {/* Badge de resultado sobre a foto */}
                  {matches.length > 0 && scanStatus === "found" && (
                    <div className="absolute top-3 left-3 bg-black/70 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                      <CheckCircle size={13} className="text-green-400" />
                      {matches.length} identificado{matches.length !== 1 ? "s" : ""}
                      {unmatchedCount > 0 && (
                        <span className="text-muted-foreground">
                          · {unmatchedCount} não reconhecido{unmatchedCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="p-5 space-y-4">
                <div>
                  <h3 className="font-bold text-sm uppercase tracking-wide">Foto Pós-Treino</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Envie a foto do grupo — o servidor identifica cada aluno e registra a presença
                    em todas as modalidades que ele treina
                  </p>
                </div>

                {/* Input de arquivo oculto — ativado pelo botão abaixo via ref */}
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

                {/* Mensagem de erro quando nenhum aluno foi identificado */}
                {scanStatus === "notfound" && (
                  <div className="flex items-center gap-2 text-sm text-red-400">
                    <XCircle size={14} />
                    Nenhum aluno identificado — certifique-se que os rostos estão cadastrados (foto de perfil) no sistema
                  </div>
                )}

                {/* Lista de alunos identificados + controles de confirmação */}
                {(matches.length > 0 || manualAdds.length > 0 || scanStatus === "found" || scanStatus === "notfound") && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Confira a lista, remova quem não treinou e adicione quem faltou. Depois confirme a presença.
                    </p>

                    {(matches.length > 0 || manualAdds.length > 0) && (
                      <div className="space-y-2">
                        {[...matches, ...manualAdds].map(m => {
                          const alreadyIn = confirmedIds.has(m.studentId);
                          const isManual  = manualAdds.some(a => a.studentId === m.studentId);
                          const mods      = modalitiesOf(m);
                          return (
                            <div
                              key={m.studentId}
                              data-testid={`match-${m.studentId}`}
                              className={`flex items-center gap-3 p-3 rounded-lg border ${
                                alreadyIn
                                  ? "bg-green-500/10 border-green-500/30"
                                  : "bg-muted/40 border-border"
                              }`}
                            >
                              {/* Avatar do aluno */}
                              <div className="w-10 h-10 rounded-full bg-muted border border-border overflow-hidden shrink-0">
                                {m.profilePhotoUrl
                                  ? <img src={m.profilePhotoUrl} alt={m.name} className="w-full h-full object-cover" />
                                  : <div className="w-full h-full flex items-center justify-center text-sm font-bold">{m.name.charAt(0)}</div>
                                }
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm">{m.name}</div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {/* Selos de modalidade */}
                                  {mods.map(mod => (
                                    <span key={mod} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                      mod === "thai"
                                        ? "bg-red-500/20 text-red-400"
                                        : "bg-blue-500/20 text-blue-400"
                                    }`}>
                                      {mod === "thai" ? "MUAY THAI" : "JIU-JITSU"}
                                    </span>
                                  ))}
                                  {/* Fonte de identificação: manual ou % de confiança da IA */}
                                  <span className="text-xs text-muted-foreground">
                                    {isManual
                                      ? "Adicionado manualmente"
                                      : `Confiança: ${((1 - m.distance) * 100).toFixed(0)}%`
                                    }
                                  </span>
                                </div>
                              </div>

                              {/* Ícone de confirmado ou botão de remover */}
                              {alreadyIn
                                ? <CheckCircle size={18} className="text-green-400 shrink-0" />
                                : <button
                                    type="button"
                                    onClick={() => isManual
                                      ? setManualAdds(prev => prev.filter(x => x.studentId !== m.studentId))
                                      : setMatches(prev => prev.filter(x => x.studentId !== m.studentId))
                                    }
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

                    {/* Select para adicionar alunos não reconhecidos pela IA */}
                    <Select value={teamAddStudent} onValueChange={addTeamStudent}>
                      <SelectTrigger data-testid="select-team-add-student">
                        <SelectValue placeholder="Adicionar quem faltou..." />
                      </SelectTrigger>
                      <SelectContent>
                        {teamAddCandidates.length === 0
                          ? <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum aluno disponível</div>
                          : teamAddCandidates.map(s => (
                              <SelectItem key={s.userId} value={String(s.userId)}>{s.name}</SelectItem>
                            ))
                        }
                      </SelectContent>
                    </Select>

                    {/* Botão de confirmação em lote — só aparece se há pendentes */}
                    {[...matches, ...manualAdds].some(m => !confirmedIds.has(m.studentId)) && (
                      <Button
                        className="w-full"
                        onClick={handleRegisterAll}
                        disabled={registeringAll}
                        data-testid="button-register-all"
                      >
                        {registeringAll
                          ? <><Loader2 size={16} className="animate-spin mr-2" />Registrando...</>
                          : <>
                              <UserCheck size={16} className="mr-2" />
                              Confirmar {[...matches, ...manualAdds].filter(m => !confirmedIds.has(m.studentId)).length} presença
                              {[...matches, ...manualAdds].filter(m => !confirmedIds.has(m.studentId)).length !== 1 ? "s" : ""}
                            </>
                        }
                      </Button>
                    )}

                    {/* Aviso sobre rostos não identificados */}
                    {unmatchedCount > 0 && (
                      <p className="text-xs text-muted-foreground text-center">
                        O servidor detectou {unmatchedCount} rosto{unmatchedCount !== 1 ? "s" : ""} a mais que não casaram
                        com alunos cadastrados — podem ser detecções falsas. Confira a lista e adicione manualmente quem faltar.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --------------------------------------------------------
              Modo "Manual"

              Permite selecionar a sessão e o aluno individualmente.
              Ideal para corrigir presenças ou registrar alunos que
              não apareceram na foto da equipe.

              Os alunos já presentes aparecem com ✓ no select e
              na lista abaixo do formulário.
          -------------------------------------------------------- */}
          {mode === "manual" && (
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">
                Adicionar Presença Manualmente
              </h3>

              {/* Seletor de sessão */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                  Sessão de Treino
                </label>
                <Select value={selectedSession} onValueChange={setSelectedSession} data-testid="select-session">
                  <SelectTrigger data-testid="select-session-trigger">
                    <SelectValue placeholder="Selecione a sessão..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(sessions) && sessions.map(s => (
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

              {/* Seletor de aluno + botão de adicionar */}
              <div className="flex gap-3">
                <Select value={manualStudent} onValueChange={setManualStudent}>
                  <SelectTrigger data-testid="select-manual-student" className="flex-1">
                    <SelectValue placeholder="Selecionar aluno..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.isArray(students) && students.map(s => (
                      <SelectItem key={s.userId} value={String(s.userId)}>
                        {s.name}
                        {/* ✓ indica que já tem presença nesta sessão */}
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

              {/* Aviso quando nenhuma sessão está selecionada */}
              {!selectedSession && (
                <p className="text-xs text-primary">
                  ⚠ Selecione uma sessão de treino antes de adicionar presenças manuais
                </p>
              )}

              {/* Lista de alunos já confirmados na sessão atual */}
              <div className="space-y-2">
                {Array.isArray(students) && students
                  .filter(s => attendedIds.has(s.userId) || confirmedIds.has(s.userId))
                  .map(s => (
                    <div key={s.userId} className="flex items-center gap-2 text-sm text-green-400">
                      <CheckCircle size={14} /> {s.name}
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </div>

        {/* --------------------------------------------------------
            Coluna lateral: Presentes hoje

            Lista em tempo real de todos os alunos que tiveram
            presença registrada hoje (qualquer sessão/modalidade).
            O ícone "Facial" aparece quando a presença foi via
            reconhecimento facial, não manual.

            Zera automaticamente à meia-noite via o timer acima.
        -------------------------------------------------------- */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserCheck size={18} className="text-primary" />
            <h2 className="font-bold uppercase tracking-wide text-sm">Presentes hoje</h2>
            <span className="ml-auto text-sm font-bold text-primary">{presentList.length}</span>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2 mb-3">
            Lista do dia — zera automaticamente à meia-noite
          </p>
          {presentList.length > 0 ? (
            <div className="space-y-2 max-h-[480px] overflow-y-auto">
              {presentList.map(p => (
                <div
                  key={p.studentId}
                  data-testid={`att-confirmed-${p.studentId}`}
                  className="flex items-center gap-2 py-2 border-b border-border/50 last:border-0"
                >
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

      {/* --------------------------------------------------------
          Histórico de presenças por dia

          Exibe os dias anteriores (não hoje) em ordem decrescente.
          Cada dia mostra quantos alunos estiveram presentes e
          quais modalidades cada um treinou (MT e/ou JJ).

          max-h + overflow-y-auto limita a altura e adiciona
          scroll interno para não ocupar a tela toda.
      -------------------------------------------------------- */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarCheck size={18} className="text-primary" />
          <h2 className="font-bold uppercase tracking-wide text-sm">Histórico por dia</h2>
          {historyByDay.length > 0 && (
            <span className="ml-auto text-sm font-bold text-primary">
              {historyByDay.length} dia{historyByDay.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {historyByDay.length > 0 ? (
          <div className="space-y-5 max-h-[640px] overflow-y-auto pr-1">
            {historyByDay.map(day => (
              <div key={day.ts}>
                {/* Cabeçalho do dia com sticky para ficar visível ao rolar */}
                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-card py-1">
                  <span className="text-sm font-bold capitalize">{day.label}</span>
                  <span className="ml-auto text-xs font-bold text-muted-foreground">
                    {day.students.length} presente{day.students.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-2">
                  {day.students.map(s => (
                    <div
                      key={s.name + day.ts}
                      className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0"
                    >
                      <div className="w-7 h-7 rounded-full bg-muted border border-border overflow-hidden shrink-0">
                        {s.photoUrl
                          ? <img src={s.photoUrl} alt={s.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-muted-foreground">{s.name.charAt(0)}</div>
                        }
                      </div>
                      <div className="text-sm font-medium truncate flex-1 min-w-0">{s.name}</div>
                      {/* Selos de modalidade do dia */}
                      <div className="flex items-center gap-1 shrink-0">
                        {s.thai && <span className="text-[10px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">MT</span>}
                        {s.jiu  && <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">JJ</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-xs">
            Nenhum registro de dias anteriores
          </div>
        )}
      </div>

    </div>
  );
}
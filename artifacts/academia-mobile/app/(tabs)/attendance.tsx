import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useState, useMemo, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useListSessions,
  useListStudents,
  useListAttendance,
  useCreateAttendance,
  useCreateSession,
  useListUsers,
  getListAttendanceQueryKey,
  getListSessionsQueryKey,
  recognizeTeam,
  bulkAttendance,
  type TeamMatch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { MenuButton } from "@/components/MenuButton";
import { uploadImageToStorage } from "@/lib/uploadImage";
import { AuthImage } from "@/components/AuthImage";
import * as Haptics from "expo-haptics";

type ScanStatus = "idle" | "uploading" | "recognizing" | "found" | "notfound";
type AttendMode = "team" | "manual";

const WEEKLY_SCHEDULE = [
  { days: [1, 2, 3, 4, 5], hour: 19, minute: 0, modality: "jiu" as const, instructorKey: "Ewerton" },
  { days: [1, 3, 5], hour: 20, minute: 30, modality: "thai" as const, instructorKey: "Ewerton" },
  { days: [2, 4], hour: 20, minute: 30, modality: "thai" as const, instructorKey: "Luis" },
  { days: [6], hour: 10, minute: 30, modality: "thai" as const, instructorKey: "Nilberto" },
];

function detectCurrentClass(now = new Date()) {
  const day = now.getDay();
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
  return (
    date.getFullYear() === t.getFullYear() &&
    date.getMonth() === t.getMonth() &&
    date.getDate() === t.getDate()
  );
}

function fmtTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(d: Date) {
  const label = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
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

export default function AttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<AttendMode>("team");
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [autoCreating, setAutoCreating] = useState(false);
  const [confirmedIds, setConfirmedIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // Estado do fluxo de reconhecimento (100% servidor)
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [matches, setMatches] = useState<TeamMatch[]>([]);
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [teamPhotoUri, setTeamPhotoUri] = useState<string | null>(null);
  const [teamPhotoUrl, setTeamPhotoUrl] = useState<string | null>(null);
  const [registeringAll, setRegisteringAll] = useState(false);
  const [manualAdds, setManualAdds] = useState<TeamMatch[]>([]);
  const [pickerMode, setPickerMode] = useState<"manual" | "team">("manual");

  const isMaster = user?.role === "teacher" || user?.role === "admin";

  const { data: sessions, isLoading: sessionsLoading, refetch: refetchSessions } = useListSessions({});
  const { data: students } = useListStudents({});
  const { data: teachers } = useListUsers({ role: "teacher" });
  const { data: attendance, refetch: refetchAttendance } = useListAttendance(
    { sessionId: selectedSessionId ?? undefined },
    { query: { enabled: !!selectedSessionId, queryKey: getListAttendanceQueryKey({ sessionId: selectedSessionId ?? undefined }) } }
  );

  // Todas as presenças (todas as sessões/dias) — base para a lista diária de
  // hoje e para o histórico por data mais abaixo na tela.
  const { data: allAttendance, refetch: refetchAllAttendance } = useListAttendance(
    {},
    { query: { queryKey: getListAttendanceQueryKey() } }
  );

  const createAttMutation = useCreateAttendance();
  const createSessionMutation = useCreateSession();

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
        refetchAllAttendance();
        schedule();
      }, next.getTime() - now.getTime());
    };
    schedule();
    return () => clearTimeout(timer);
  }, [queryClient, refetchAllAttendance]);

  const currentClass = detectCurrentClass();
  const currentTeacher = currentClass && teachers
    ? teachers.find(t => t.name.toLowerCase().includes(currentClass.instructorKey.toLowerCase()))
    : null;
  const todaySession = currentClass && sessions
    ? sessions.find(s => s.modality === currentClass.modality && isToday(new Date(s.sessionDate)))
    : null;

  const selectedSession = sessions?.find(s => s.id === selectedSessionId);
  const attendedIds = useMemo(() => new Set(attendance?.map(a => a.studentId) ?? []), [attendance]);

  // Presentes HOJE: todas as presenças marcadas no dia atual (de todas as
  // sessões/modalidades), deduplicadas por aluno. Zera sozinho à meia-noite,
  // pois passa a não haver mais registros com a data de hoje. Junta também as
  // confirmações locais da foto da equipe (modo team) para feedback imediato.
  const presentList = useMemo(() => {
    const map = new Map<number, { studentId: number; name: string; photoUrl: string | null; faceRecognized: boolean }>();
    for (const rec of allAttendance ?? []) {
      if (!isToday(new Date(rec.createdAt))) continue;
      const student = students?.find(s => s.userId === rec.studentId);
      const ex = map.get(rec.studentId);
      map.set(rec.studentId, {
        studentId: rec.studentId,
        name: student?.name ?? rec.studentName ?? "Aluno",
        photoUrl: student?.profilePhotoUrl ?? rec.studentPhotoUrl ?? null,
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
  }, [allAttendance, students, matches, manualAdds, confirmedIds, mode]);

  // Histórico de presenças agrupado por dia (exclui hoje, que aparece acima).
  const historyByDay = useMemo(() => {
    const groups = new Map<string, { label: string; ts: number; students: Map<number, { name: string; photoUrl: string | null; thai: boolean; jiu: boolean }> }>();
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
      const student = students?.find(s => s.userId === rec.studentId);
      const ex = g.students.get(rec.studentId);
      g.students.set(rec.studentId, {
        name: student?.name ?? rec.studentName ?? "Aluno",
        photoUrl: student?.profilePhotoUrl ?? rec.studentPhotoUrl ?? null,
        thai: (ex?.thai ?? false) || rec.modality === "thai",
        jiu: (ex?.jiu ?? false) || rec.modality === "jiu",
      });
    }
    return [...groups.values()]
      .sort((a, b) => b.ts - a.ts)
      .map(g => ({ label: g.label, ts: g.ts, students: [...g.students.values()] }));
  }, [allAttendance, students]);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleAutoSession = async () => {
    if (!currentClass) return;
    if (todaySession) {
      setSelectedSessionId(todaySession.id);
      showToast("Sessão de hoje selecionada!");
      return;
    }
    if (!currentTeacher) {
      showToast("Instrutor não encontrado no sistema.", "err");
      return;
    }
    setAutoCreating(true);
    const now = new Date();
    const sessionDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), currentClass.hour, currentClass.minute, 0);
    createSessionMutation.mutate(
      { data: { modality: currentClass.modality, sessionDate: sessionDate.toISOString(), teacherId: currentTeacher.id } },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          refetchSessions();
          setSelectedSessionId(created.id);
          showToast("Sessão criada e selecionada!");
          setAutoCreating(false);
        },
        onError: () => { showToast("Erro ao criar sessão", "err"); setAutoCreating(false); },
      }
    );
  };

  const confirmAttendance = (studentId: number, faceRecognized = false) => {
    if (!selectedSessionId) { showToast("Selecione uma sessão primeiro", "err"); return; }
    if (attendedIds.has(studentId) || confirmedIds.has(studentId)) {
      showToast("Presença já registrada"); return;
    }
    createAttMutation.mutate(
      { data: { sessionId: selectedSessionId, studentId, faceRecognized } },
      {
        onSuccess: () => {
          setConfirmedIds(prev => new Set([...prev, studentId]));
          queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey() });
          refetchAttendance();
          refetchAllAttendance();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast("Presença confirmada!");
          setStudentPickerOpen(false);
        },
        onError: () => showToast("Erro ao registrar presença", "err"),
      }
    );
  };

  // ---------------- Reconhecimento 100% no servidor ----------------
  const pickAndRecognize = async (source: "camera" | "gallery") => {
    try {
      let perm;
      if (source === "camera") {
        perm = await ImagePicker.requestCameraPermissionsAsync();
      } else {
        perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }
      if (!perm.granted) {
        showToast("Permissão negada para câmera/galeria", "err");
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.8 };
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      setMatches([]);
      setManualAdds([]);
      setUnmatchedCount(0);
      setTeamPhotoUrl(null);
      setTeamPhotoUri(asset.uri);
      setScanStatus("uploading");

      const objectPath = await uploadImageToStorage(asset.uri, {
        name: asset.fileName ?? "equipe.jpg",
        contentType: asset.mimeType ?? "image/jpeg",
        size: asset.fileSize,
      });
      setScanStatus("recognizing");
      const res = await recognizeTeam({ objectPath });
      setUnmatchedCount(res.unmatchedCount);
      setTeamPhotoUrl(res.photoUrl);
      if (res.matches.length > 0) {
        setMatches(res.matches);
        setScanStatus("found");
      } else {
        setScanStatus("notfound");
        showToast(
          res.detectedFaces > 0
            ? `${res.detectedFaces} rosto(s) detectado(s), nenhum cadastrado`
            : "Nenhum rosto detectado na foto",
          "err",
        );
      }
    } catch {
      setScanStatus("notfound");
      showToast("Erro ao processar a foto", "err");
    }
  };

  const toggleTeamAdd = (s: {
    userId: number;
    name: string;
    profilePhotoUrl?: string | null;
    modalityThai?: boolean;
    modalityJiu?: boolean;
  }) => {
    setManualAdds(prev =>
      prev.some(a => a.studentId === s.userId)
        ? prev.filter(a => a.studentId !== s.userId)
        : [...prev, studentToMatch(s)],
    );
  };

  const handleRegisterAll = async () => {
    if (!user) return;
    const toRegister = [...matches, ...manualAdds].filter(m => !confirmedIds.has(m.studentId));
    if (toRegister.length === 0) { showToast("Todos já estão registrados!"); return; }
    setRegisteringAll(true);
    try {
      const res = await bulkAttendance({
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
      refetchSessions();
      refetchAttendance();
      refetchAllAttendance();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(
        `${res.created} presença${res.created !== 1 ? "s" : ""} registrada${res.created !== 1 ? "s" : ""}!${res.skipped > 0 ? ` (${res.skipped} já existiam)` : ""}`,
      );
    } catch {
      showToast("Erro ao registrar presenças", "err");
    } finally {
      setRegisteringAll(false);
    }
  };

  const switchMode = (next: AttendMode) => {
    if (next === mode) return;
    setMode(next);
  };

  const filteredStudents = useMemo(() => {
    if (!students) return [];
    return students.filter(s =>
      !attendedIds.has(s.userId) && !confirmedIds.has(s.userId) &&
      (studentSearch === "" || s.name.toLowerCase().includes(studentSearch.toLowerCase()))
    );
  }, [students, attendedIds, confirmedIds, studentSearch]);

  const teamAddCandidates = useMemo(() => {
    if (!students) return [];
    const recognized = new Set(matches.map(m => m.studentId));
    return students.filter(s =>
      !recognized.has(s.userId) && !confirmedIds.has(s.userId) &&
      (studentSearch === "" || s.name.toLowerCase().includes(studentSearch.toLowerCase()))
    );
  }, [students, matches, confirmedIds, studentSearch]);

  if (!user && !authLoading) return <Redirect href="/login" />;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (!isMaster) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <MenuButton />
            <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Presença</Text>
          </View>
        </View>
        <View style={styles.restricted}>
          <View style={[styles.restrictedIcon, { backgroundColor: colors.primary + "18" }]}>
            <Ionicons name="shield-outline" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.restrictedTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Acesso Restrito
          </Text>
          <Text style={[styles.restrictedSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            O controle de presenças é exclusivo para professores e administradores.
          </Text>
          <TouchableOpacity
            style={[styles.backBtn2, { borderColor: colors.border }]}
            onPress={() => router.push("/(tabs)")}
          >
            <Text style={[styles.backBtn2Text, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              Voltar ao Painel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const busy = scanStatus === "uploading" || scanStatus === "recognizing";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Toast */}
      {toast && (
        <View style={[styles.toastWrap, { backgroundColor: toast.type === "ok" ? "#166534" : "#7f1d1d" }]}>
          <Ionicons name={toast.type === "ok" ? "checkmark-circle" : "alert-circle"} size={16} color="#fff" />
          <Text style={[styles.toastText, { fontFamily: "Inter_500Medium" }]}>{toast.msg}</Text>
        </View>
      )}

      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <MenuButton />
          <View>
            <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Presença</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Foto da equipe — reconhecimento no servidor
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: botPad + 24 }]}
        refreshControl={<RefreshControl refreshing={sessionsLoading} onRefresh={refetchSessions} tintColor={colors.primary} />}
      >
        {/* Banner inteligente */}
        {currentClass ? (
          <View style={[styles.banner, {
            backgroundColor: todaySession ? "rgba(34,197,94,0.1)" : colors.primary + "18",
            borderColor: todaySession ? "rgba(34,197,94,0.3)" : colors.primary + "50",
          }]}>
            <View style={[styles.bannerIcon, {
              backgroundColor: todaySession ? "rgba(34,197,94,0.2)" : colors.primary + "30",
            }]}>
              <Ionicons
                name={todaySession ? "calendar-outline" : "time-outline"}
                size={20}
                color={todaySession ? "#4ade80" : colors.primary}
              />
            </View>
            <View style={styles.bannerInfo}>
              <Text style={[styles.bannerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {currentClass.modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"} — {fmtTime(currentClass.hour, currentClass.minute)}
              </Text>
              <Text style={[styles.bannerSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {currentTeacher ? currentTeacher.name : `Instrutor: ${currentClass.instructorKey}`}
                {todaySession ? " · Sessão aberta" : " · Nenhuma sessão hoje"}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.bannerBtn, { backgroundColor: todaySession ? "transparent" : colors.primary, borderColor: todaySession ? colors.border : colors.primary }]}
              onPress={handleAutoSession}
              disabled={autoCreating}
            >
              {autoCreating
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[styles.bannerBtnText, { color: todaySession ? colors.mutedForeground : "#fff", fontFamily: "Inter_600SemiBold" }]}>
                    {todaySession ? "Selecionar" : "Abrir aula"}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.noBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
            <Text style={[styles.noBannerText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Nenhuma aula no cronograma para este horário
            </Text>
          </View>
        )}

        {/* Seletor de modo */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, { borderColor: mode === "team" ? colors.primary : colors.border, backgroundColor: mode === "team" ? colors.primary : "transparent" }]}
            onPress={() => switchMode("team")}
          >
            <Ionicons name="images-outline" size={16} color={mode === "team" ? "#fff" : colors.mutedForeground} />
            <Text style={[styles.modeBtnText, { color: mode === "team" ? "#fff" : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>Foto da equipe</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, { borderColor: mode === "manual" ? colors.primary : colors.border, backgroundColor: mode === "manual" ? colors.primary : "transparent" }]}
            onPress={() => switchMode("manual")}
          >
            <Ionicons name="people-outline" size={16} color={mode === "manual" ? "#fff" : colors.mutedForeground} />
            <Text style={[styles.modeBtnText, { color: mode === "manual" ? "#fff" : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>Manual</Text>
          </TouchableOpacity>
        </View>

        {/* Modo FOTO DA EQUIPE (servidor) */}
        {mode === "team" && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: "hidden" }]}>
            {teamPhotoUri && (
              <View style={styles.galleryPreviewWrap}>
                <Image source={{ uri: teamPhotoUri }} style={styles.galleryPreview} resizeMode="cover" />
                {busy && (
                  <View style={styles.galleryOverlay}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.galleryOverlayText, { fontFamily: "Inter_600SemiBold" }]}>
                      {scanStatus === "uploading" ? "Enviando foto…" : "Reconhecendo rostos no servidor…"}
                    </Text>
                  </View>
                )}
                {matches.length > 0 && !busy && (
                  <View style={styles.galleryBadge}>
                    <Ionicons name="checkmark-circle" size={13} color="#4ade80" />
                    <Text style={[styles.galleryBadgeText, { fontFamily: "Inter_600SemiBold" }]}>
                      {matches.length} identificado{matches.length !== 1 ? "s" : ""}{unmatchedCount > 0 ? ` · ${unmatchedCount} não reconh.` : ""}
                    </Text>
                  </View>
                )}
              </View>
            )}
            <View style={{ padding: 16, gap: 12 }}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>FOTO PÓS-TREINO</Text>
              <Text style={[styles.galleryHint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Envie a foto do grupo — o servidor identifica cada aluno e marca a presença em todas as modalidades que ele treina.
              </Text>
              <View style={styles.cameraBtns}>
                <TouchableOpacity
                  style={[styles.addStudentBtn, { backgroundColor: colors.primary, flex: 1, opacity: busy ? 0.6 : 1 }]}
                  onPress={() => pickAndRecognize("camera")}
                  disabled={busy}
                >
                  <Ionicons name="camera-outline" size={18} color="#fff" />
                  <Text style={[styles.addStudentText, { fontFamily: "Inter_600SemiBold" }]}>Câmera</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addStudentBtn, { backgroundColor: colors.primary, flex: 1, opacity: busy ? 0.6 : 1 }]}
                  onPress={() => pickAndRecognize("gallery")}
                  disabled={busy}
                >
                  <Ionicons name="image-outline" size={18} color="#fff" />
                  <Text style={[styles.addStudentText, { fontFamily: "Inter_600SemiBold" }]}>Galeria</Text>
                </TouchableOpacity>
              </View>
              {scanStatus === "notfound" && !busy && (
                <View style={styles.inlineRow}>
                  <Ionicons name="close-circle" size={14} color="#f87171" />
                  <Text style={[styles.inlineText, { color: "#f87171", fontFamily: "Inter_400Regular", flex: 1 }]}>Nenhum aluno identificado — verifique se os rostos têm foto de perfil cadastrada.</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Revisão da presença (team) */}
        {mode === "team" && (matches.length > 0 || manualAdds.length > 0 || scanStatus === "found" || scanStatus === "notfound") && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.inlineRow}>
              <Ionicons name="people-circle-outline" size={16} color={colors.primary} />
              <Text style={[styles.cardLabel, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {matches.length} IDENTIFICADO{matches.length !== 1 ? "S" : ""}{manualAdds.length > 0 ? ` · ${manualAdds.length} ADICIONADO${manualAdds.length !== 1 ? "S" : ""}` : ""}
              </Text>
            </View>
            <Text style={[styles.galleryHint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Confira a lista, remova quem não treinou e adicione quem faltou. Depois confirme a presença.
            </Text>

            {[...matches, ...manualAdds].map((m) => {
              const alreadyIn = confirmedIds.has(m.studentId);
              const isManual = manualAdds.some(a => a.studentId === m.studentId);
              const initials = m.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
              const mods = modalitiesOf(m);
              return (
                <View key={m.studentId} style={[styles.attendRow, { borderBottomColor: colors.border }]}>
                  {m.profilePhotoUrl
                    ? <AuthImage path={m.profilePhotoUrl} style={styles.attendAvatar} />
                    : <View style={[styles.attendAvatar, { backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }]}>
                        <Text style={[styles.attendInitials, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>{initials}</Text>
                      </View>}
                  <View style={styles.attendInfo}>
                    <Text style={[styles.attendName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{m.name}</Text>
                    <View style={styles.modBadgeRow}>
                      {mods.map(mod => (
                        <View key={mod} style={[styles.modBadge, { backgroundColor: mod === "thai" ? "rgba(239,68,68,0.18)" : "rgba(59,130,246,0.18)" }]}>
                          <Text style={[styles.modBadgeText, { color: mod === "thai" ? "#f87171" : "#60a5fa", fontFamily: "Inter_700Bold" }]}>
                            {mod === "thai" ? "MUAY THAI" : "JIU-JITSU"}
                          </Text>
                        </View>
                      ))}
                      <Text style={[styles.attendTime, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        {isManual ? "Adicionado" : `${((1 - m.distance) * 100).toFixed(0)}%`}
                      </Text>
                    </View>
                  </View>
                  {alreadyIn ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  ) : (
                    <TouchableOpacity
                      onPress={() => isManual
                        ? setManualAdds(prev => prev.filter(x => x.studentId !== m.studentId))
                        : setMatches(prev => prev.filter(x => x.studentId !== m.studentId))}
                      hitSlop={10}
                      accessibilityLabel={`Remover ${m.name}`}
                    >
                      <Ionicons name="close-circle" size={22} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            {matches.length === 0 && manualAdds.length === 0 && (
              <Text style={[styles.warnText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Nenhum aluno reconhecido automaticamente. Adicione manualmente quem treinou hoje.
              </Text>
            )}

            <TouchableOpacity
              style={[styles.addStudentBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.primary }]}
              onPress={() => { setPickerMode("team"); setStudentSearch(""); setStudentPickerOpen(true); }}
            >
              <Ionicons name="person-add-outline" size={18} color={colors.primary} />
              <Text style={[styles.addStudentText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                Adicionar quem faltou
              </Text>
            </TouchableOpacity>

            {[...matches, ...manualAdds].some(m => !confirmedIds.has(m.studentId)) && (
              <TouchableOpacity
                style={[styles.addStudentBtn, { backgroundColor: colors.primary, opacity: registeringAll ? 0.6 : 1 }]}
                onPress={handleRegisterAll}
                disabled={registeringAll}
              >
                {registeringAll
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Ionicons name="checkmark-done-outline" size={18} color="#fff" /><Text style={[styles.addStudentText, { fontFamily: "Inter_600SemiBold" }]}>
                      Confirmar {[...matches, ...manualAdds].filter(m => !confirmedIds.has(m.studentId)).length} presença{[...matches, ...manualAdds].filter(m => !confirmedIds.has(m.studentId)).length !== 1 ? "s" : ""}
                    </Text></>}
              </TouchableOpacity>
            )}

            {unmatchedCount > 0 && (
              <Text style={[styles.warnText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                O servidor detectou {unmatchedCount} rosto{unmatchedCount !== 1 ? "s" : ""} a mais que não casaram com alunos cadastrados — podem ser detecções falsas ou alunos sem foto de perfil. Use "Adicionar quem faltou" se faltar alguém.
              </Text>
            )}
          </View>
        )}

        {/* Modo MANUAL */}
        {mode === "manual" && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              SESSÃO DE TREINO
            </Text>
            <TouchableOpacity
              style={[styles.sessionPicker, { borderColor: colors.border, backgroundColor: colors.background }]}
              onPress={() => setSessionPickerOpen(true)}
            >
              <Ionicons name="barbell-outline" size={18} color={colors.mutedForeground} />
              <Text
                style={[styles.sessionPickerText, { color: selectedSession ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                numberOfLines={1}
              >
                {selectedSession
                  ? `${selectedSession.modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"} — ${new Date(selectedSession.sessionDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                  : "Selecionar sessão de treino..."
                }
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>

            {selectedSessionId ? (
              <TouchableOpacity
                style={[styles.addStudentBtn, { backgroundColor: colors.primary }]}
                onPress={() => { setPickerMode("manual"); setStudentSearch(""); setStudentPickerOpen(true); }}
                activeOpacity={0.85}
              >
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={[styles.addStudentText, { fontFamily: "Inter_600SemiBold" }]}>
                  Adicionar Aluno Manualmente
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.warnText, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>⚠ Selecione uma sessão para adicionar presenças</Text>
            )}
          </View>
        )}

        {/* Lista de presentes (reconhecimento facial + sessão) */}
        {(
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.attendListHeader}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                PRESENTES HOJE
              </Text>
              <View style={[styles.countBadge, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[styles.countText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                  {presentList.length}
                </Text>
              </View>
            </View>
            <Text style={[styles.attendTime, { color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 12 }]}>
              Lista do dia — zera automaticamente à meia-noite
            </Text>
            {presentList.length > 0 ? (
              presentList.map((p) => {
                const initials = (p.name ?? "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
                return (
                  <View
                    key={p.studentId}
                    style={[styles.attendRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={[styles.attendAvatar, { backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }]}>
                      <Text style={[styles.attendInitials, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                        {initials}
                      </Text>
                    </View>
                    <View style={styles.attendInfo}>
                      <Text style={[styles.attendName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                        {p.name}
                      </Text>
                      <Text style={[styles.attendTime, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        {p.faceRecognized ? "Reconhecimento facial" : "Registro manual"}
                      </Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyAttend}>
                <Ionicons name="people-outline" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyAttendText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Nenhuma presença marcada hoje ainda
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Histórico de presenças por dia */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.attendListHeader}>
            <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              HISTÓRICO POR DIA
            </Text>
            {historyByDay.length > 0 && (
              <View style={[styles.countBadge, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[styles.countText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                  {historyByDay.length}
                </Text>
              </View>
            )}
          </View>
          {historyByDay.length > 0 ? (
            historyByDay.map((day) => (
              <View key={day.ts} style={{ marginBottom: 16 }}>
                <View style={[styles.attendListHeader, { marginBottom: 8 }]}>
                  <Text style={[styles.attendName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    {day.label}
                  </Text>
                  <Text style={[styles.attendTime, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {day.students.length} presente{day.students.length !== 1 ? "s" : ""}
                  </Text>
                </View>
                {day.students.map((s, idx) => {
                  const initials = (s.name ?? "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
                  return (
                    <View key={s.name + idx} style={[styles.attendRow, { borderBottomColor: colors.border }]}>
                      <View style={[styles.attendAvatar, { backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }]}>
                        <Text style={[styles.attendInitials, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                          {initials}
                        </Text>
                      </View>
                      <View style={styles.attendInfo}>
                        <Text style={[styles.attendName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                          {s.name}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 4 }}>
                        {s.thai && (
                          <View style={{ backgroundColor: "#ef444422", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ color: "#f87171", fontSize: 10, fontFamily: "Inter_700Bold" }}>MT</Text>
                          </View>
                        )}
                        {s.jiu && (
                          <View style={{ backgroundColor: "#3b82f622", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ color: "#60a5fa", fontSize: 10, fontFamily: "Inter_700Bold" }}>JJ</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          ) : (
            <View style={styles.emptyAttend}>
              <Ionicons name="calendar-outline" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyAttendText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Nenhum registro de dias anteriores
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modal: seletor de sessão */}
      <Modal visible={sessionPickerOpen} transparent animationType="slide" onRequestClose={() => setSessionPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSessionPickerOpen(false)} />
        <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: botPad + 16 }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Selecionar Sessão
          </Text>
          <ScrollView style={{ maxHeight: 400 }}>
            {sessions?.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.sessionItem, {
                  backgroundColor: selectedSessionId === s.id ? colors.primary + "20" : "transparent",
                  borderColor: selectedSessionId === s.id ? colors.primary + "60" : colors.border,
                }]}
                onPress={() => { setSelectedSessionId(s.id); setSessionPickerOpen(false); }}
              >
                <View style={[styles.sessionItemBadge, { backgroundColor: s.modality === "thai" ? "#7f1d1d" : "#1a2744" }]}>
                  <Text style={[styles.sessionItemBadgeText, { fontFamily: "Inter_700Bold", color: s.modality === "thai" ? colors.thai : colors.jiu }]}>
                    {s.modality === "thai" ? "MT" : "JJ"}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.sessionItemName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    {s.modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"}
                  </Text>
                  <Text style={[styles.sessionItemSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {new Date(s.sessionDate).toLocaleString("pt-BR")} · Prof. {s.teacherName}
                  </Text>
                </View>
                <View style={styles.sessionItemCount}>
                  <Ionicons name="people-outline" size={13} color={colors.mutedForeground} />
                  <Text style={[{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }]}>{s.attendanceCount}</Text>
                </View>
                {selectedSessionId === s.id && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Modal: adicionar aluno */}
      <Modal visible={studentPickerOpen} transparent animationType="slide" onRequestClose={() => setStudentPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setStudentPickerOpen(false)} />
        <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: botPad + 16 }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Adicionar Aluno
          </Text>
          <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              placeholder="Buscar aluno..."
              placeholderTextColor={colors.mutedForeground}
              value={studentSearch}
              onChangeText={setStudentSearch}
              autoFocus
            />
          </View>
          <FlatList
            data={pickerMode === "team" ? teamAddCandidates : filteredStudents}
            keyExtractor={item => String(item.userId)}
            style={{ maxHeight: 350 }}
            renderItem={({ item }) => {
              const initials = item.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
              const added = pickerMode === "team" && manualAdds.some(a => a.studentId === item.userId);
              return (
                <TouchableOpacity
                  style={[styles.studentItem, { borderBottomColor: colors.border }]}
                  onPress={() => pickerMode === "team" ? toggleTeamAdd(item) : confirmAttendance(item.userId)}
                >
                  <View style={[styles.attendAvatar, { backgroundColor: colors.primary + "22" }]}>
                    <Text style={[styles.attendInitials, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                      {initials}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.attendName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{item.name}</Text>
                    <Text style={[styles.attendTime, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{item.email}</Text>
                  </View>
                  <Ionicons name={added ? "checkmark-circle" : "add-circle-outline"} size={22} color={added ? colors.success : colors.primary} />
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyAttend}>
                <Text style={[styles.emptyAttendText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {studentSearch ? "Nenhum aluno encontrado" : (pickerMode === "team" ? "Todos os alunos já estão na lista" : "Todos os alunos já estão presentes")}
                </Text>
              </View>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 26, letterSpacing: 0.5 },
  subtitle: { fontSize: 13, marginTop: 2 },
  content: { padding: 16, gap: 14 },

  toastWrap: {
    position: "absolute", top: 60, left: 16, right: 16, zIndex: 99,
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 10,
  },
  toastText: { color: "#fff", fontSize: 13, flex: 1 },

  banner: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  bannerIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  bannerInfo: { flex: 1 },
  bannerTitle: { fontSize: 14 },
  bannerSub: { fontSize: 12, marginTop: 2 },
  bannerBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  bannerBtnText: { fontSize: 12 },

  noBanner: { borderRadius: 12, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  noBannerText: { fontSize: 13 },

  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  cardLabel: { fontSize: 11, letterSpacing: 1 },

  sessionPicker: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, padding: 12 },
  sessionPickerText: { flex: 1, fontSize: 13 },

  addStudentBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, padding: 14 },
  addStudentText: { color: "#fff", fontSize: 14 },

  modeRow: { flexDirection: "row", gap: 8 },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, borderWidth: 1, paddingVertical: 10 },
  modeBtnText: { fontSize: 13 },

  cameraBtns: { flexDirection: "row", gap: 8 },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  inlineText: { fontSize: 13 },
  warnText: { fontSize: 12, textAlign: "center" },

  galleryPreviewWrap: { position: "relative", width: "100%" },
  galleryPreview: { width: "100%", height: 220 },
  galleryOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
  galleryOverlayText: { color: "#fff", fontSize: 13, textAlign: "center" },
  galleryBadge: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  galleryBadgeText: { color: "#fff", fontSize: 11 },
  galleryHint: { fontSize: 12, lineHeight: 17 },

  modBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" },
  modBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  modBadgeText: { fontSize: 9, letterSpacing: 0.3 },

  attendListHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  countBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  countText: { fontSize: 13 },

  attendRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  attendAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  attendInitials: { fontSize: 14 },
  attendInfo: { flex: 1 },
  attendName: { fontSize: 14 },
  attendTime: { fontSize: 11, marginTop: 2 },

  emptyAttend: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyAttendText: { fontSize: 13 },

  restricted: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  restrictedIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  restrictedTitle: { fontSize: 20, letterSpacing: 0.5 },
  restrictedSub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  backBtn2: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  backBtn2Text: { fontSize: 14 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#555", alignSelf: "center", marginBottom: 4 },
  modalTitle: { fontSize: 18 },

  searchWrap: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 14 },

  sessionItem: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8, gap: 10 },
  sessionItemBadge: { width: 38, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sessionItemBadgeText: { fontSize: 11 },
  sessionItemName: { fontSize: 14 },
  sessionItemSub: { fontSize: 12, marginTop: 2 },
  sessionItemCount: { flexDirection: "row", alignItems: "center", gap: 3 },

  studentItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, gap: 12 },
});

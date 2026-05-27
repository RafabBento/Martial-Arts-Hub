import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React, { useState, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
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
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";

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

export default function AttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [autoCreating, setAutoCreating] = useState(false);
  const [confirmedIds, setConfirmedIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const isMaster = user?.role === "teacher" || user?.role === "admin";

  const { data: sessions, isLoading: sessionsLoading, refetch: refetchSessions } = useListSessions({});
  const { data: students } = useListStudents({});
  const { data: teachers } = useListUsers({ role: "teacher" });
  const { data: attendance, refetch: refetchAttendance } = useListAttendance(
    { sessionId: selectedSessionId ?? undefined },
    { query: { enabled: !!selectedSessionId, queryKey: getListAttendanceQueryKey({ sessionId: selectedSessionId ?? undefined }) } }
  );

  const createAttMutation = useCreateAttendance();
  const createSessionMutation = useCreateSession();

  const currentClass = detectCurrentClass();
  const currentTeacher = currentClass && teachers
    ? teachers.find(t => t.name.toLowerCase().includes(currentClass.instructorKey.toLowerCase()))
    : null;
  const todaySession = currentClass && sessions
    ? sessions.find(s => s.modality === currentClass.modality && isToday(new Date(s.sessionDate)))
    : null;

  const selectedSession = sessions?.find(s => s.id === selectedSessionId);
  const attendedIds = useMemo(() => new Set(attendance?.map(a => a.studentId) ?? []), [attendance]);

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

  const confirmAttendance = (studentId: number) => {
    if (!selectedSessionId) { showToast("Selecione uma sessão primeiro", "err"); return; }
    if (attendedIds.has(studentId) || confirmedIds.has(studentId)) {
      showToast("Presença já registrada"); return;
    }
    createAttMutation.mutate(
      { data: { sessionId: selectedSessionId, studentId, faceRecognized: false } },
      {
        onSuccess: () => {
          setConfirmedIds(prev => new Set([...prev, studentId]));
          queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey({ sessionId: selectedSessionId }) });
          refetchAttendance();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast("Presença confirmada!");
          setStudentPickerOpen(false);
        },
        onError: () => showToast("Erro ao registrar presença", "err"),
      }
    );
  };

  const filteredStudents = useMemo(() => {
    if (!students) return [];
    return students.filter(s =>
      !attendedIds.has(s.userId) && !confirmedIds.has(s.userId) &&
      (studentSearch === "" || s.name.toLowerCase().includes(studentSearch.toLowerCase()))
    );
  }, [students, attendedIds, confirmedIds, studentSearch]);

  if (!user && !authLoading) return <Redirect href="/login" />;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (!isMaster) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Presença</Text>
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
        <View>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Presença</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Controle de presenças
          </Text>
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

        {/* Seletor de sessão */}
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
                ? `${selectedSession.modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"} — ${new Date(selectedSession.sessionDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · Prof. ${selectedSession.teacherName}`
                : "Selecionar sessão de treino..."
              }
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Registrar presença manual */}
        {selectedSessionId && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              REGISTRAR PRESENÇA
            </Text>
            <TouchableOpacity
              style={[styles.addStudentBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setStudentSearch(""); setStudentPickerOpen(true); }}
              activeOpacity={0.85}
            >
              <Ionicons name="person-add-outline" size={18} color="#fff" />
              <Text style={[styles.addStudentText, { fontFamily: "Inter_600SemiBold" }]}>
                Adicionar Aluno Manualmente
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Lista de presentes */}
        {selectedSessionId && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.attendListHeader}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                PRESENTES NA SESSÃO
              </Text>
              <View style={[styles.countBadge, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[styles.countText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                  {(attendance?.length ?? 0)}
                </Text>
              </View>
            </View>
            {attendance && attendance.length > 0 ? (
              attendance.map((att) => {
                const student = students?.find(s => s.userId === att.studentId);
                const initials = (student?.name ?? att.studentName ?? "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
                return (
                  <View
                    key={att.id}
                    style={[styles.attendRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={[styles.attendAvatar, { backgroundColor: colors.primary + "22" }]}>
                      <Text style={[styles.attendInitials, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                        {initials}
                      </Text>
                    </View>
                    <View style={styles.attendInfo}>
                      <Text style={[styles.attendName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                        {student?.name ?? att.studentName ?? "Aluno"}
                      </Text>
                      <Text style={[styles.attendTime, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        {att.faceRecognized ? "Reconhecimento facial" : "Registro manual"}
                        {att.createdAt ? ` · ${new Date(att.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
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
                  Nenhuma presença registrada
                </Text>
              </View>
            )}
          </View>
        )}

        {!selectedSessionId && (
          <View style={styles.noSessionHint}>
            <Ionicons name="finger-print-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.noSessionText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Selecione ou crie uma sessão para registrar presenças
            </Text>
          </View>
        )}
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
          <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
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
            data={filteredStudents}
            keyExtractor={item => String(item.userId)}
            style={{ maxHeight: 350 }}
            renderItem={({ item }) => {
              const initials = item.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
              return (
                <TouchableOpacity
                  style={[styles.studentItem, { borderBottomColor: colors.border }]}
                  onPress={() => confirmAttendance(item.userId)}
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
                  <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyAttend}>
                <Text style={[styles.emptyAttendText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {studentSearch ? "Nenhum aluno encontrado" : "Todos os alunos já estão presentes"}
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

  noSessionHint: { alignItems: "center", paddingVertical: 48, gap: 12 },
  noSessionText: { fontSize: 14, textAlign: "center", maxWidth: 240 },

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

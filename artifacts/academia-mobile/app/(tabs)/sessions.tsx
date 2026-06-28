import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
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
  useCreateSession,
  useListUsers,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { MenuButton } from "@/components/MenuButton";
import { SessionCard } from "@/components/SessionCard";
import * as Haptics from "expo-haptics";

// Filtros de modalidade exibidos como "chips" no topo da lista.
const FILTERS = [
  { label: "Todos", value: undefined as undefined | "thai" | "jiu" },
  { label: "Thai", value: "thai" as const },
  { label: "Jiu", value: "jiu" as const },
];

// Cronograma semanal fixo (informativo) mostrado no cabeçalho da lista.
const SCHEDULE = [
  { time: "19:00", modality: "jiu" as const, days: "Seg – Sex", instructor: "Instrutor Ewerton" },
  { time: "20:30", modality: "thai" as const, days: "Seg, Qua e Sex", instructor: "Mestre Ewerton" },
  { time: "20:30", modality: "thai" as const, days: "Ter e Qui", instructor: "Instrutor Luis" },
  { time: "10:30", modality: "thai" as const, days: "Sábado", instructor: "Instrutor Nilberto" },
];

// Tela de sessões (aulas) de treino. Lista as sessões registradas com filtro por
// modalidade e, para mestres/admins, permite criar novas sessões.
export default function SessionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Filtro de modalidade ativo, controle do modal de criação e do formulário.
  const [modality, setModality] = useState<undefined | "thai" | "jiu">(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ modality: "thai" as "thai" | "jiu", date: "", time: "", description: "", teacherId: "" });
  const [toast, setToast] = useState<string | null>(null);
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // Queries: lista de sessões (filtrada) e lista de professores para o seletor.
  const { data, isLoading, refetch } = useListSessions({ modality });
  const { data: teachers } = useListUsers({ role: "teacher" });
  // Mutação para criar uma nova sessão.
  const createMutation = useCreateSession();

  // Mestres (professores) e admins têm permissão para criar sessões.
  const isMaster = user?.role === "teacher" || user?.role === "admin";

  // Exibe um toast temporário (some sozinho após 2,5s).
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Valida o formulário, monta a data/hora ISO e cria a sessão; em sucesso,
  // invalida o cache, fecha o modal e limpa o formulário.
  const handleCreate = () => {
    if (!form.date || !form.time || !form.teacherId) {
      showToast("Preencha data, hora e professor");
      return;
    }
    const sessionDate = new Date(`${form.date}T${form.time}:00`);
    createMutation.mutate(
      {
        data: {
          modality: form.modality,
          sessionDate: sessionDate.toISOString(),
          description: form.description || undefined,
          teacherId: parseInt(form.teacherId, 10),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          refetch();
          setCreateOpen(false);
          setForm({ modality: "thai", date: "", time: "", description: "", teacherId: "" });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast("Sessão criada com sucesso!");
        },
        onError: () => showToast("Erro ao criar sessão"),
      }
    );
  };

  // Guarda de autenticação: sem usuário logado, redireciona para o login.
  if (!user && !authLoading) return <Redirect href="/login" />;

  // Padding superior/inferior: fixos no web, áreas seguras no celular.
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {toast && (
        <View style={[styles.toast, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.toastText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{toast}</Text>
        </View>
      )}

      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <MenuButton />
            <View>
              <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Sessões</Text>
              <Text style={[styles.count, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {data?.length ?? 0} registradas
              </Text>
            </View>
          </View>
          {isMaster && (
            <TouchableOpacity
              style={[styles.newBtn, { backgroundColor: colors.primary }]}
              onPress={() => setCreateOpen(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={[styles.newBtnText, { fontFamily: "Inter_600SemiBold" }]}>Nova</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.filters}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={String(f.value)}
              style={[
                styles.chip,
                {
                  backgroundColor: modality === f.value ? colors.primary : colors.card,
                  borderColor: modality === f.value ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setModality(f.value)}
            >
              <Text style={[
                styles.chipText,
                { color: modality === f.value ? "#fff" : colors.mutedForeground, fontFamily: "Inter_500Medium" },
              ]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 24 },
          ]}
          onRefresh={refetch}
          refreshing={isLoading}
          ListHeaderComponent={
            <View style={[styles.scheduleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.scheduleHeader}>
                <Text style={[styles.scheduleTitle, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                  CRONOGRAMA SEMANAL
                </Text>
                <View style={styles.scheduleLocation}>
                  <Ionicons name="location-outline" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.scheduleLocationText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Av. Julio Buono, 2224
                  </Text>
                </View>
              </View>
              <View style={styles.scheduleGrid}>
                {SCHEDULE.map((item, i) => (
                  <View
                    key={i}
                    style={[
                      styles.scheduleItem,
                      {
                        backgroundColor: item.modality === "thai" ? "rgba(212,43,43,0.1)" : "rgba(59,130,246,0.1)",
                        borderColor: item.modality === "thai" ? "rgba(212,43,43,0.25)" : "rgba(59,130,246,0.25)",
                      },
                    ]}
                  >
                    <View style={styles.scheduleTime}>
                      <Ionicons name="time-outline" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.scheduleTimeText, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                        {item.time}
                      </Text>
                    </View>
                    <Text style={[styles.scheduleModality, { color: item.modality === "thai" ? colors.thai : colors.jiu, fontFamily: "Inter_700Bold" }]}>
                      {item.modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"}
                    </Text>
                    <Text style={[styles.scheduleDays, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      {item.days}
                    </Text>
                    <Text style={[styles.scheduleInstructor, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      {item.instructor}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <SessionCard
              modality={item.modality as "thai" | "jiu"}
              sessionDate={item.sessionDate}
              teacherName={item.teacherName}
              description={item.description}
              attendanceCount={item.attendanceCount ?? 0}
              onPress={() => router.push(`/session/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="barbell-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Nenhuma sessão encontrada
              </Text>
            </View>
          }
        />
      )}

      {/* Modal criar sessão */}
      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCreateOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: botPad + 16 }]}>
          <View style={styles.handle} />
          <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Nova Sessão de Treino
          </Text>

          {/* Modalidade */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>MODALIDADE</Text>
            <View style={styles.toggleRow}>
              {(["thai", "jiu"] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.toggle, {
                    backgroundColor: form.modality === m ? (m === "thai" ? colors.thai + "30" : colors.jiu + "30") : colors.background,
                    borderColor: form.modality === m ? (m === "thai" ? colors.thai : colors.jiu) : colors.border,
                  }]}
                  onPress={() => setForm(f => ({ ...f, modality: m }))}
                >
                  <Text style={[styles.toggleText, {
                    color: form.modality === m ? (m === "thai" ? colors.thai : colors.jiu) : colors.mutedForeground,
                    fontFamily: "Inter_600SemiBold",
                  }]}>
                    {m === "thai" ? "🥊 Muay Thai" : "🥋 Jiu-Jitsu"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Data */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>DATA</Text>
            <View style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Ionicons name="calendar-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.inputText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                value={form.date}
                onChangeText={v => setForm(f => ({ ...f, date: v }))}
              />
            </View>
          </View>

          {/* Hora */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>HORA</Text>
            <View style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.inputText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                placeholder="HH:MM"
                placeholderTextColor={colors.mutedForeground}
                value={form.time}
                onChangeText={v => setForm(f => ({ ...f, time: v }))}
              />
            </View>
          </View>

          {/* Professor */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>PROFESSOR</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
              <View style={styles.toggleRow}>
                {teachers?.map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.toggle, {
                      backgroundColor: form.teacherId === String(t.id) ? colors.primary + "25" : colors.background,
                      borderColor: form.teacherId === String(t.id) ? colors.primary : colors.border,
                    }]}
                    onPress={() => setForm(f => ({ ...f, teacherId: String(t.id) }))}
                  >
                    <Text style={[styles.toggleText, {
                      color: form.teacherId === String(t.id) ? colors.primary : colors.mutedForeground,
                      fontFamily: "Inter_500Medium",
                    }]}>
                      {t.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Descrição */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>DESCRIÇÃO (opcional)</Text>
            <View style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <TextInput
                style={[styles.inputText, { color: colors.foreground, fontFamily: "Inter_400Regular", flex: 1 }]}
                placeholder="Ex: Treino de clinch e joelhada"
                placeholderTextColor={colors.mutedForeground}
                value={form.description}
                onChangeText={v => setForm(f => ({ ...f, description: v }))}
              />
            </View>
          </View>

          <View style={styles.sheetBtns}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={() => setCreateOpen(false)}
            >
              <Text style={[styles.cancelBtnText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
              onPress={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[styles.confirmBtnText, { fontFamily: "Inter_700Bold" }]}>Criar Sessão</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toast: {
    position: "absolute", top: 60, left: 16, right: 16, zIndex: 99,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  toastText: { fontSize: 13, textAlign: "center" },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 26, letterSpacing: 0.5 },
  count: { fontSize: 13, marginTop: 2 },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  newBtnText: { color: "#fff", fontSize: 14 },
  filters: { flexDirection: "row", gap: 8 },
  chip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6 },
  chipText: { fontSize: 13 },
  list: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 15 },

  scheduleCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 12, marginBottom: 16 },
  scheduleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scheduleTitle: { fontSize: 11, letterSpacing: 1 },
  scheduleLocation: { flexDirection: "row", alignItems: "center", gap: 3 },
  scheduleLocationText: { fontSize: 11 },
  scheduleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scheduleItem: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 3, minWidth: "47%", flex: 1 },
  scheduleTime: { flexDirection: "row", alignItems: "center", gap: 4 },
  scheduleTimeText: { fontSize: 14 },
  scheduleModality: { fontSize: 12 },
  scheduleDays: { fontSize: 11 },
  scheduleInstructor: { fontSize: 11 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#555", alignSelf: "center", marginBottom: 4 },
  sheetTitle: { fontSize: 18 },
  field: { gap: 6 },
  label: { fontSize: 11, letterSpacing: 1 },
  input: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, gap: 8 },
  inputText: { fontSize: 14 },
  toggleRow: { flexDirection: "row", gap: 8 },
  toggle: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  toggleText: { fontSize: 13 },
  sheetBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 14, alignItems: "center" },
  cancelBtnText: { fontSize: 14 },
  confirmBtn: { flex: 2, borderRadius: 12, padding: 14, alignItems: "center" },
  confirmBtnText: { color: "#fff", fontSize: 14 },
});

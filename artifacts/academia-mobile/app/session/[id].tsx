import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetSession,
  useListAttendance,
  useDeleteAttendance,
  useDeleteSession,
  getGetSessionQueryKey,
  getListAttendanceQueryKey,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

// Tela de detalhe de uma sessão (rota dinâmica /session/[id]). Mostra os dados
// da sessão e a lista de presenças; mestres podem remover presenças individuais
// ou excluir a sessão inteira.
export default function SessionDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  // Lê o id da sessão da URL (rota dinâmica) e o converte para número.
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Number(id);
  const queryClient = useQueryClient();
  // Mestres (professores) e admins podem excluir sessões/presenças.
  const isMaster = user?.role === "teacher" || user?.role === "admin";

  const [toast, setToast] = useState<string | null>(null);

  // Queries: dados da sessão e lista de presenças daquela sessão.
  const { data: session, isLoading: sessionLoading } = useGetSession(sessionId);
  const { data: attendance, isLoading: attLoading } = useListAttendance({ sessionId });

  // Mutações para excluir uma presença e excluir a sessão.
  const deleteAttMutation = useDeleteAttendance();
  const deleteSessionMutation = useDeleteSession();

  // Padding superior/inferior: fixos no web, áreas seguras no celular.
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Exibe um toast temporário (some sozinho após 2,5s).
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Confirma e remove a presença de um aluno; em sucesso, invalida os caches.
  const handleDeleteAttendance = (attId: number, studentName: string) => {
    Alert.alert(
      "Remover presença",
      `Remover a presença de ${studentName}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: () => {
            deleteAttMutation.mutate({ id: attId }, {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey({ sessionId }) });
                queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showToast("Presença removida");
              },
              onError: () => showToast("Erro ao remover presença"),
            });
          },
        },
      ]
    );
  };

  // Confirma e exclui a sessão inteira; em sucesso, atualiza a lista e volta.
  const handleDeleteSession = () => {
    Alert.alert(
      "Excluir sessão",
      "Tem certeza? Esta ação não pode ser desfeita.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            deleteSessionMutation.mutate({ id: sessionId }, {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.back();
              },
              onError: () => showToast("Erro ao excluir sessão"),
            });
          },
        },
      ]
    );
  };

  // Enquanto a sessão carrega, exibe apenas o cabeçalho e um spinner.
  if (sessionLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Sessão</Text>
          <View style={{ width: 24 }} />
        </View>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (!session) return null;

  // Cor de destaque e data formatada conforme a modalidade da sessão.
  const isThai = session.modality === "thai";
  const accentColor = isThai ? colors.thai : colors.jiu;
  const date = new Date(session.sessionDate);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {toast && (
        <View style={[styles.toast, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.toastText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{toast}</Text>
        </View>
      )}

      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Sessão</Text>
        {isMaster ? (
          <TouchableOpacity
            onPress={handleDeleteSession}
            disabled={deleteSessionMutation.isPending}
            style={styles.deleteSessionBtn}
          >
            {deleteSessionMutation.isPending
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Ionicons name="trash-outline" size={20} color={colors.primary} />
            }
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <FlatList
        data={attendance ?? []}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={[styles.content, { paddingBottom: botPad + 24 }]}
        refreshing={attLoading}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {/* Info card */}
            <View style={[styles.sessionInfo, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: accentColor }]}>
              <View style={styles.sessionInfoTop}>
                <View style={[styles.modalityBadge, { backgroundColor: accentColor + "20", borderColor: accentColor + "50" }]}>
                  <Text style={[styles.modalityText, { color: accentColor, fontFamily: "Inter_700Bold" }]}>
                    {isThai ? "MUAY THAI" : "JIU-JITSU"}
                  </Text>
                </View>
              </View>
              <View style={styles.sessionInfoRow}>
                <Ionicons name="calendar-outline" size={14} color={colors.mutedForeground} />
                <Text style={[styles.sessionInfoText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                </Text>
              </View>
              <View style={styles.sessionInfoRow}>
                <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
                <Text style={[styles.sessionInfoText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
              <View style={styles.sessionInfoRow}>
                <Ionicons name="person-outline" size={14} color={colors.mutedForeground} />
                <Text style={[styles.sessionInfoText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Prof. {session.teacherName}
                </Text>
              </View>
              {session.description ? (
                <Text style={[styles.desc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {session.description}
                </Text>
              ) : null}
            </View>

            {/* Presentes header */}
            <View style={styles.presentesHeader}>
              <Ionicons name="people-outline" size={16} color={colors.primary} />
              <Text style={[styles.sectionLabel, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                Presenças
              </Text>
              <View style={[styles.countBadge, { backgroundColor: colors.primary + "20" }]}>
                <Text style={[styles.countText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                  {attendance?.length ?? 0}
                </Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const initials = item.studentName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
          return (
            <View style={[styles.attendeeRow, { borderBottomColor: colors.border }]}>
              {item.studentPhotoUrl ? (
                <Image source={{ uri: item.studentPhotoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: accentColor + "22", alignItems: "center", justifyContent: "center" }]}>
                  <Text style={[styles.initials, { color: accentColor, fontFamily: "Inter_700Bold" }]}>{initials}</Text>
                </View>
              )}
              <View style={styles.attendeeInfo}>
                <Text style={[styles.attendeeName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                  {item.studentName}
                </Text>
                <View style={styles.attendeeSubRow}>
                  {item.faceRecognized && (
                    <View style={styles.faceTagRow}>
                      <Ionicons name="scan-outline" size={11} color={colors.success} />
                      <Text style={[styles.faceText, { color: colors.success, fontFamily: "Inter_400Regular" }]}>Reconhecido</Text>
                    </View>
                  )}
                  <Text style={[styles.time, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {new Date(item.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </View>
              {isMaster && (
                <TouchableOpacity
                  style={[styles.removeBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => handleDeleteAttendance(item.id, item.studentName)}
                  disabled={deleteAttMutation.isPending}
                >
                  <Ionicons name="trash-outline" size={15} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Nenhuma presença registrada
            </Text>
          </View>
        }
      />
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
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17 },
  deleteSessionBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 0 },
  listHeader: { gap: 16, marginBottom: 8 },
  sessionInfo: {
    borderRadius: 14, borderWidth: 1, borderLeftWidth: 4,
    padding: 16, gap: 8,
  },
  sessionInfoTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalityBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  modalityText: { fontSize: 11, letterSpacing: 1 },
  sessionInfoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sessionInfoText: { fontSize: 14 },
  desc: { fontSize: 13, marginTop: 4 },
  presentesHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionLabel: { fontSize: 15, flex: 1 },
  countBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontSize: 13 },
  attendeeRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, borderBottomWidth: 1, gap: 12,
  },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  initials: { fontSize: 14 },
  attendeeInfo: { flex: 1, gap: 3 },
  attendeeName: { fontSize: 14 },
  attendeeSubRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  faceTagRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  faceText: { fontSize: 11 },
  time: { fontSize: 12 },
  removeBtn: {
    width: 34, height: 34, borderRadius: 10, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  empty: { alignItems: "center", gap: 12, paddingVertical: 40 },
  emptyText: { fontSize: 14 },
});

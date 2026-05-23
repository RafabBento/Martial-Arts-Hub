import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetDashboardStats, useGetRecentActivity } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { StatCard } from "@/components/StatCard";

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, isLoading: authLoading } = useAuth();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGetDashboardStats();
  const { data: activity, isLoading: actLoading, refetch: refetchAct } = useGetRecentActivity();

  if (!user && !authLoading) return <Redirect href="/login" />;

  const dataLoading = statsLoading || actLoading;
  const onRefresh = () => { refetchStats(); refetchAct(); };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Olá, {user?.name?.split(" ")[0]}
          </Text>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Dashboard
          </Text>
        </View>
        <TouchableOpacity onPress={logout} style={[styles.logoutBtn, { borderColor: colors.border }]}>
          <Ionicons name="log-out-outline" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: botPad + 24 }]}
        refreshControl={<RefreshControl refreshing={dataLoading} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {statsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : stats ? (
          <>
            <Text style={[styles.section, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              VISÃO GERAL
            </Text>
            <View style={styles.statsGrid}>
              <StatCard label="Alunos" value={stats.totalStudents} accent="primary" />
              <StatCard label="Professores" value={stats.totalTeachers} accent="success" />
            </View>
            <View style={styles.statsGrid}>
              <StatCard label="Sessões Thai" value={stats.totalSessionsThai} accent="thai" />
              <StatCard label="Sessões Jiu" value={stats.totalSessionsJiu} accent="jiu" />
            </View>
            <View style={styles.statsGrid}>
              <StatCard label="Presenças Hoje Thai" value={stats.attendanceTodayThai} accent="thai" />
              <StatCard label="Presenças Hoje Jiu" value={stats.attendanceTodayJiu} accent="jiu" />
            </View>
          </>
        ) : null}

        <Text style={[styles.section, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", marginTop: 24 }]}>
          ATIVIDADE RECENTE
        </Text>

        {actLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : activity && activity.length > 0 ? (
          activity.slice(0, 10).map((item, i) => {
            const isThai = item.modality === "thai";
            const accentColor = isThai ? colors.thai : colors.jiu;
            return (
              <View
                key={i}
                style={[styles.activityItem, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: accentColor }]}
              >
                <View style={[styles.activityDot, { backgroundColor: accentColor }]} />
                <View style={styles.activityInfo}>
                  <Text style={[styles.activityTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    {item.studentName}
                  </Text>
                  <Text style={[styles.activitySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {isThai ? "Muay Thai" : "Jiu-Jitsu"} · {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Nenhuma atividade recente
            </Text>
          </View>
        )}

        <View style={styles.quickActions}>
          <Text style={[styles.section, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            AÇÕES RÁPIDAS
          </Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push("/(tabs)/students")}
              activeOpacity={0.7}
            >
              <Ionicons name="people-outline" size={24} color={colors.primary} />
              <Text style={[styles.actionLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>Alunos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push("/(tabs)/sessions")}
              activeOpacity={0.7}
            >
              <Ionicons name="barbell-outline" size={24} color={colors.thai} />
              <Text style={[styles.actionLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>Sessões</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push("/(tabs)/rankings")}
              activeOpacity={0.7}
            >
              <Ionicons name="trophy-outline" size={24} color={colors.warning} />
              <Text style={[styles.actionLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>Rankings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  greeting: { fontSize: 13, marginBottom: 2 },
  headerTitle: { fontSize: 26, letterSpacing: 0.5 },
  logoutBtn: { borderWidth: 1, borderRadius: 10, padding: 8 },
  content: { padding: 20, gap: 10 },
  section: { fontSize: 11, letterSpacing: 1, marginBottom: 4 },
  statsGrid: { flexDirection: "row", gap: 10 },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 12,
    gap: 12,
    marginBottom: 8,
  },
  activityDot: { width: 8, height: 8, borderRadius: 4 },
  activityInfo: { flex: 1 },
  activityTitle: { fontSize: 14 },
  activitySub: { fontSize: 12, marginTop: 2 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 32 },
  emptyText: { fontSize: 14 },
  quickActions: { marginTop: 16, gap: 12 },
  actionsRow: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  actionLabel: { fontSize: 12 },
});

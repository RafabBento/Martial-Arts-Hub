import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useListRankings } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { MenuButton } from "@/components/MenuButton";
import { RankingRow } from "@/components/RankingRow";

const MODALITIES = [
  { label: "Todos", value: "both" as const },
  { label: "Thai", value: "thai" as const },
  { label: "Jiu", value: "jiu" as const },
];
const PERIODS = [
  { label: "Semana", value: "week" as const },
  { label: "Mês", value: "month" as const },
  { label: "Ano", value: "year" as const },
  { label: "Geral", value: "all" as const },
];

export default function RankingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [modality, setModality] = useState<"both" | "thai" | "jiu">("both");
  const [period, setPeriod] = useState<"week" | "month" | "year" | "all">("month");
  const { user, isLoading: authLoading } = useAuth();

  const { data, isLoading, refetch } = useListRankings({ modality, period });

  if (!user && !authLoading) return <Redirect href="/login" />;

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <MenuButton />
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Rankings</Text>
        </View>
        <View style={styles.filters}>
          {MODALITIES.map(m => (
            <TouchableOpacity
              key={m.value}
              style={[styles.chip, { backgroundColor: modality === m.value ? colors.primary : colors.card, borderColor: modality === m.value ? colors.primary : colors.border }]}
              onPress={() => setModality(m.value)}
            >
              <Text style={[styles.chipText, { color: modality === m.value ? "#fff" : colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.filters}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.value}
              style={[styles.chip, { backgroundColor: period === p.value ? colors.secondary : colors.card, borderColor: period === p.value ? colors.mutedForeground : colors.border }]}
              onPress={() => setPeriod(p.value)}
            >
              <Text style={[styles.chipText, { color: period === p.value ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={item => String(item.studentId)}
          contentContainerStyle={[styles.list, { paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 24 }]}
          onRefresh={refetch}
          refreshing={isLoading}
          renderItem={({ item }) => (
            <RankingRow
              rank={item.rank}
              name={item.name}
              profilePhotoUrl={item.profilePhotoUrl}
              percentage={item.percentage}
              presentCount={item.presentCount}
              totalSessions={item.totalSessions}
              modality={item.modality ?? "both"}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="trophy-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Sem dados para este período</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, gap: 10 },
  title: { fontSize: 26, letterSpacing: 0.5 },
  filters: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6 },
  chipText: { fontSize: 13 },
  list: { paddingHorizontal: 20 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 15 },
});

import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
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
import { useListSessions } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { SessionCard } from "@/components/SessionCard";

const FILTERS = [
  { label: "Todos", value: undefined as undefined | "thai" | "jiu" },
  { label: "Thai", value: "thai" as const },
  { label: "Jiu", value: "jiu" as const },
];

export default function SessionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [modality, setModality] = useState<undefined | "thai" | "jiu">(undefined);
  const { user, isLoading: authLoading } = useAuth();

  const { data, isLoading, refetch } = useListSessions({ modality });

  if (!user && !authLoading) return <Redirect href="/login" />;

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Sessões</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: { fontSize: 26, letterSpacing: 0.5 },
  filters: { flexDirection: "row", gap: 8 },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipText: { fontSize: 13 },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 15 },
});

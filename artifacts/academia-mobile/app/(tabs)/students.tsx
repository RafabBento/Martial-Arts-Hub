import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useListStudents } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { MenuButton } from "@/components/MenuButton";
import { StudentCard } from "@/components/StudentCard";

const MODALITY_FILTERS = [
  { label: "Todos", value: undefined as undefined | "thai" | "jiu" | "both" },
  { label: "Thai", value: "thai" as const },
  { label: "Jiu", value: "jiu" as const },
  { label: "Ambos", value: "both" as const },
];

const UNIT_LABELS: Record<string, string> = {
  matriz: "Matriz",
  panobianco: "Panobianco",
  upfitness: "Up Fitness",
};

export default function StudentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [modalityFilter, setModalityFilter] = useState<undefined | "thai" | "jiu" | "both">(undefined);
  const [unitFilter, setUnitFilter] = useState<undefined | "matriz" | "panobianco" | "upfitness">(undefined);
  const { user, isLoading: authLoading } = useAuth();

  const isMaster = user?.role === "teacher" || user?.role === "admin";

  const { data: allStudents, isLoading, refetch } = useListStudents({ search: search || undefined });

  if (!user && !authLoading) return <Redirect href="/login" />;

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const filtered = (allStudents ?? []).filter(s => {
    if (modalityFilter === "thai" && !s.modalityThai) return false;
    if (modalityFilter === "jiu" && !s.modalityJiu) return false;
    if (modalityFilter === "both" && !(s.modalityThai && s.modalityJiu)) return false;
    if (unitFilter && s.unit !== unitFilter) return false;
    return true;
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <MenuButton />
          <View style={[styles.titleRow, { flex: 1 }]}>
            <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Alunos</Text>
            <Text style={[styles.count, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {filtered.length} cadastrados
            </Text>
          </View>
        </View>

        <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            placeholder="Buscar aluno..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search ? (
            <Ionicons name="close-circle" size={16} color={colors.mutedForeground} onPress={() => setSearch("")} />
          ) : null}
        </View>

        {/* Filtro modalidade */}
        <View style={styles.filterRow}>
          {MODALITY_FILTERS.map(f => (
            <TouchableOpacity
              key={String(f.value)}
              style={[
                styles.chip,
                {
                  backgroundColor: modalityFilter === f.value ? colors.primary : colors.card,
                  borderColor: modalityFilter === f.value ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setModalityFilter(f.value)}
            >
              <Text style={[
                styles.chipText,
                { color: modalityFilter === f.value ? "#fff" : colors.mutedForeground, fontFamily: "Inter_500Medium" },
              ]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Filtro unidade — só para professores/admins */}
        {isMaster && (
          <View style={styles.filterRow}>
            {([undefined, "matriz", "panobianco", "upfitness"] as const).map(u => (
              <TouchableOpacity
                key={String(u)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: unitFilter === u ? "#7c3aed" : colors.card,
                    borderColor: unitFilter === u ? "#7c3aed" : colors.border,
                  },
                ]}
                onPress={() => setUnitFilter(u)}
              >
                <Text style={[
                  styles.chipText,
                  { color: unitFilter === u ? "#fff" : colors.mutedForeground, fontFamily: "Inter_500Medium" },
                ]}>
                  {u === undefined ? "Todas" : UNIT_LABELS[u]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.userId)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 24 },
          ]}
          onRefresh={refetch}
          refreshing={isLoading}
          renderItem={({ item }) => (
            <StudentCard
              name={item.name}
              email={item.email}
              profilePhotoUrl={item.profilePhotoUrl}
              modalityThai={item.modalityThai}
              modalityJiu={item.modalityJiu}
              thaiGrade={item.thaiGrade}
              thaiGradeColor={item.thaiGradeColor}
              jiuGrade={item.jiuGrade}
              jiuGradeColor={item.jiuGradeColor}
              jiuDegree={item.jiuDegree}
              totalAttendanceThai={item.totalAttendanceThai ?? 0}
              totalAttendanceJiu={item.totalAttendanceJiu ?? 0}
              onPress={() => router.push(`/student/${item.userId}`)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {search || modalityFilter || unitFilter ? "Nenhum aluno encontrado" : "Nenhum aluno cadastrado"}
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
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  title: { fontSize: 26, letterSpacing: 0.5 },
  count: { fontSize: 13 },
  searchWrap: {
    flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6 },
  chipText: { fontSize: 13 },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 15 },
});

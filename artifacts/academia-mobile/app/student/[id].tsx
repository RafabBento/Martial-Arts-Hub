import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetStudent } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { ModalityBadge } from "@/components/ModalityBadge";

export default function StudentDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: student, isLoading } = useGetStudent(Number(id));
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (!student) return null;

  const initials = student.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Perfil do Aluno
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 24 }]}>
        <View style={styles.avatarBlock}>
          {student.profilePhotoUrl ? (
            <Image source={{ uri: student.profilePhotoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }]}>
              <Text style={[styles.initials, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>{initials}</Text>
            </View>
          )}
          <Text style={[styles.name, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{student.name}</Text>
          <Text style={[styles.email, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{student.email}</Text>
          <View style={styles.badges}>
            {student.modalityThai && <ModalityBadge modality="thai" />}
            {student.modalityJiu && <ModalityBadge modality="jiu" />}
          </View>
        </View>

        <View style={styles.statsRow}>
          {student.modalityThai && (
            <View style={[styles.statBox, { backgroundColor: "#3b0a0a", borderColor: colors.thai }]}>
              <Text style={[styles.statNum, { color: colors.thai, fontFamily: "Inter_700Bold" }]}>{student.totalAttendanceThai}</Text>
              <Text style={[styles.statLbl, { color: colors.thai, fontFamily: "Inter_400Regular" }]}>presenças Thai</Text>
            </View>
          )}
          {student.modalityJiu && (
            <View style={[styles.statBox, { backgroundColor: "#0a1a3b", borderColor: colors.jiu }]}>
              <Text style={[styles.statNum, { color: colors.jiu, fontFamily: "Inter_700Bold" }]}>{student.totalAttendanceJiu}</Text>
              <Text style={[styles.statLbl, { color: colors.jiu, fontFamily: "Inter_400Regular" }]}>presenças Jiu</Text>
            </View>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>GRAUS</Text>
          {student.thaiGrade ? (
            <View style={styles.gradeRow}>
              <View style={[styles.gradeDot, { backgroundColor: colors.thai }]} />
              <Text style={[styles.gradeLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Thai</Text>
              <Text style={[styles.gradeValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{student.thaiGrade}</Text>
            </View>
          ) : null}
          {student.jiuGrade ? (
            <View style={styles.gradeRow}>
              <View style={[styles.gradeDot, { backgroundColor: colors.jiu }]} />
              <Text style={[styles.gradeLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Jiu</Text>
              <Text style={[styles.gradeValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{student.jiuGrade}</Text>
            </View>
          ) : null}
          {!student.thaiGrade && !student.jiuGrade && (
            <Text style={[styles.noGrade, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Sem grau registrado</Text>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>RECONHECIMENTO FACIAL</Text>
          <View style={styles.faceRow}>
            <Ionicons
              name={student.hasFaceDescriptor ? "checkmark-circle" : "close-circle"}
              size={20}
              color={student.hasFaceDescriptor ? colors.success : colors.mutedForeground}
            />
            <Text style={[styles.faceText, { color: student.hasFaceDescriptor ? colors.success : colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {student.hasFaceDescriptor ? "Rosto cadastrado" : "Rosto não cadastrado"}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17 },
  content: { padding: 20, gap: 16 },
  avatarBlock: { alignItems: "center", gap: 10 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  initials: { fontSize: 36 },
  name: { fontSize: 22 },
  email: { fontSize: 14 },
  badges: { flexDirection: "row", gap: 8 },
  statsRow: { flexDirection: "row", gap: 12 },
  statBox: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 16, alignItems: "center", gap: 4 },
  statNum: { fontSize: 32 },
  statLbl: { fontSize: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  sectionLabel: { fontSize: 11, letterSpacing: 1 },
  gradeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  gradeDot: { width: 8, height: 8, borderRadius: 4 },
  gradeLabel: { fontSize: 13, flex: 1 },
  gradeValue: { fontSize: 14 },
  noGrade: { fontSize: 13 },
  faceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  faceText: { fontSize: 14 },
});

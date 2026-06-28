// Cartão de uma sessão de treino: mostra modalidade, data/hora formatadas,
// professor, descrição e total de presenças. Toque navega para o detalhe.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface SessionCardProps {
  modality: "thai" | "jiu";
  sessionDate: string;
  teacherName: string;
  description?: string | null;
  attendanceCount: number;
  onPress: () => void;
}

export function SessionCard({
  modality, sessionDate, teacherName, description, attendanceCount, onPress,
}: SessionCardProps) {
  const colors = useColors();
  // Cor de destaque (borda lateral/rótulo) conforme a modalidade.
  const isThai = modality === "thai";
  const accentColor = isThai ? colors.thai : colors.jiu;
  // Formata a data da sessão em dia da semana/data e horário no padrão pt-BR.
  const date = new Date(sessionDate);
  const dayStr = date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  const timeStr = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: accentColor, borderLeftWidth: 3 }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.row}>
        <View style={styles.info}>
          <View style={styles.headerRow}>
            <Text style={[styles.modality, { color: accentColor, fontFamily: "Inter_700Bold" }]}>
              {isThai ? "MUAY THAI" : "JIU-JITSU"}
            </Text>
            <View style={styles.attendanceBadge}>
              <Ionicons name="people" size={12} color={colors.mutedForeground} />
              <Text style={[styles.attendanceText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                {attendanceCount}
              </Text>
            </View>
          </View>
          <Text style={[styles.date, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {dayStr} · {timeStr}
          </Text>
          <Text style={[styles.teacher, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Prof. {teacherName}
          </Text>
          {description && (
            <Text style={[styles.desc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={1}>
              {description}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  info: { flex: 1, gap: 4 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modality: { fontSize: 11, letterSpacing: 0.8 },
  attendanceBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  attendanceText: { fontSize: 12 },
  date: { fontSize: 15 },
  teacher: { fontSize: 12 },
  desc: { fontSize: 12, marginTop: 2 },
});

// Cartão de estatística reutilizável (ex.: total de alunos, presenças). Exibe
// um valor em destaque e um rótulo, com cor de acento configurável.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface StatCardProps {
  label: string;
  value: string | number;
  accent?: "primary" | "thai" | "jiu" | "success";
}

export function StatCard({ label, value, accent = "primary" }: StatCardProps) {
  const colors = useColors();
  // Resolve a cor do valor de acordo com o acento escolhido.
  const accentColor =
    accent === "thai" ? colors.thai :
    accent === "jiu" ? colors.jiu :
    accent === "success" ? colors.success :
    colors.primary;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.value, { color: accentColor, fontFamily: "Inter_700Bold" }]}>
        {value}
      </Text>
      <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  value: {
    fontSize: 28,
    lineHeight: 32,
  },
  label: {
    fontSize: 11,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});

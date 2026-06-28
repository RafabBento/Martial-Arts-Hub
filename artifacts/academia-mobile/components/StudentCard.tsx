// Cartão de aluno usado na listagem de alunos: foto/iniciais, nome, e-mail,
// selos de modalidade, graduações (faixas) e totais de presença por modalidade.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { AuthImage } from "@/components/AuthImage";
import { ModalityBadge } from "./ModalityBadge";

interface StudentCardProps {
  name: string;
  email: string;
  profilePhotoUrl?: string | null;
  modalityThai: boolean;
  modalityJiu: boolean;
  thaiGrade?: string | null;
  thaiGradeColor?: string | null;
  jiuGrade?: string | null;
  jiuGradeColor?: string | null;
  jiuDegree?: number | null;
  totalAttendanceThai: number;
  totalAttendanceJiu: number;
  onPress: () => void;
}

// Mapa de nomes de cor (em inglês) para o hexadecimal correspondente, usado
// para converter cores de graduação salvas como texto.
const COLOR_NAME_HEX: Record<string, string> = {
  white: "#f5f5f5", red: "#dc2626", yellow: "#facc15", green: "#16a34a",
  blue: "#2563eb", purple: "#7c3aed", brown: "#92400e", black: "#111827",
};

// Mapa das faixas de Muay Thai (rótulo em pt-BR) para a cor exibida no badge.
const THAI_LABEL_HEX: Record<string, string> = {
  "Branco": "#f5f5f5", "Branco ponta vermelha": "#f5f5f5",
  "Vermelha": "#dc2626", "Vermelha ponta amarela": "#dc2626",
  "Amarela": "#facc15", "Amarela ponta verde": "#facc15",
  "Verde": "#16a34a", "Verde ponta azul": "#16a34a",
  "Azul": "#2563eb", "Azul ponta preta": "#2563eb",
  "Preta": "#111827",
};

// Mapa das faixas de Jiu-Jitsu (rótulo em pt-BR) para a cor exibida no badge.
const JIU_LABEL_HEX: Record<string, string> = {
  "Branca": "#f5f5f5", "Azul": "#2563eb", "Roxa": "#7c3aed",
  "Marrom": "#92400e", "Preta": "#111827",
};

// Resolve uma cor crua (hex direto ou nome em inglês) para um hexadecimal, ou
// null quando não for possível identificar.
function resolveHex(raw?: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (v.startsWith("#")) return v;
  return COLOR_NAME_HEX[v.toLowerCase()] ?? null;
}

// Badge de graduação: ponto colorido (cor da faixa) + rótulo e grau. Faixas
// claras ganham borda escura no ponto para manter contraste, e vice-versa.
function GradeBadge({ label, grade, hex }: { label: string; grade: string; hex: string }) {
  const colors = useColors();
  const isLight = hex === "#f5f5f5" || hex === "#facc15";
  return (
    <View style={[badgeStyles.pill, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={[badgeStyles.dot, { backgroundColor: hex, borderColor: isLight ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.2)" }]} />
      <Text style={[badgeStyles.text, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]} numberOfLines={1}>
        <Text style={{ color: colors.foreground }}>{label}:</Text> {grade}
      </Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, maxWidth: "100%" },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
  text: { fontSize: 11, flexShrink: 1 },
});

export function StudentCard({
  name, email, profilePhotoUrl, modalityThai, modalityJiu,
  thaiGrade, thaiGradeColor, jiuGrade, jiuGradeColor, jiuDegree,
  totalAttendanceThai, totalAttendanceJiu, onPress,
}: StudentCardProps) {
  const colors = useColors();
  // Iniciais para o avatar quando não há foto de perfil.
  const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  // Resolve as cores das faixas: usa a cor salva; senão deduz pela faixa; por
  // fim cai num cinza neutro.
  const thaiHex = resolveHex(thaiGradeColor) ?? (thaiGrade ? THAI_LABEL_HEX[thaiGrade] : null) ?? "#6b7280";
  const jiuHex = resolveHex(jiuGradeColor) ?? (jiuGrade ? JIU_LABEL_HEX[jiuGrade] : null) ?? "#6b7280";
  // No Jiu-Jitsu, anexa o grau (ex.: "Azul 2º") quando houver graus na faixa.
  const jiuLabel = jiuGrade ? (jiuDegree && jiuDegree > 0 ? `${jiuGrade} ${jiuDegree}º` : jiuGrade) : null;
  // Só exibe a seção de graduações se houver pelo menos uma faixa cadastrada.
  const hasGrades = Boolean(thaiGrade) || Boolean(jiuGrade);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.row}>
        {profilePhotoUrl ? (
          <AuthImage path={profilePhotoUrl} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.initials, { backgroundColor: colors.primary + "22" }]}>
            <Text style={[styles.initialsText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
              {initials}
            </Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.email, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={1}>
            {email}
          </Text>
          <View style={styles.badges}>
            {modalityThai && <ModalityBadge modality="thai" small />}
            {modalityJiu && <ModalityBadge modality="jiu" small />}
          </View>
        </View>
        <View style={styles.stats}>
          {modalityThai && (
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: colors.thai, fontFamily: "Inter_700Bold" }]}>{totalAttendanceThai}</Text>
              <Text style={[styles.statLbl, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Thai</Text>
            </View>
          )}
          {modalityJiu && (
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: colors.jiu, fontFamily: "Inter_700Bold" }]}>{totalAttendanceJiu}</Text>
              <Text style={[styles.statLbl, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Jiu</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </View>
      </View>

      {hasGrades && (
        <View style={styles.grades}>
          {thaiGrade && (
            <GradeBadge label="Thai" grade={thaiGrade} hex={thaiHex} />
          )}
          {jiuGrade && jiuLabel && (
            <GradeBadge label="Jiu" grade={jiuLabel} hex={jiuHex} />
          )}
        </View>
      )}
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
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  initials: { alignItems: "center", justifyContent: "center" },
  initialsText: { fontSize: 18 },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 15 },
  email: { fontSize: 12 },
  badges: { flexDirection: "row", gap: 4, marginTop: 2 },
  stats: { flexDirection: "row", alignItems: "center", gap: 10 },
  stat: { alignItems: "center" },
  statNum: { fontSize: 16 },
  statLbl: { fontSize: 10 },
  grades: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
});

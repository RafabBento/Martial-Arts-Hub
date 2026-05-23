import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface RankingRowProps {
  rank: number;
  name: string;
  profilePhotoUrl?: string | null;
  percentage: number;
  presentCount: number;
  totalSessions: number;
  modality: string;
}

export function RankingRow({
  rank, name, profilePhotoUrl, percentage, presentCount, totalSessions, modality,
}: RankingRowProps) {
  const colors = useColors();
  const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const isThai = modality === "thai";
  const rankColor = rank === 1 ? "#FFD700" : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : colors.mutedForeground;
  const barColor = isThai ? colors.thai : modality === "jiu" ? colors.jiu : colors.primary;

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rank, { color: rankColor, fontFamily: "Inter_700Bold" }]}>
        #{rank}
      </Text>
      {profilePhotoUrl ? (
        <Image source={{ uri: profilePhotoUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }]}>
          <Text style={[styles.initials, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>{initials}</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.barContainer}>
          <View style={[styles.barBg, { backgroundColor: colors.border }]}>
            <View style={[styles.barFill, { width: `${percentage}%` as any, backgroundColor: barColor }]} />
          </View>
          <Text style={[styles.pct, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {percentage.toFixed(0)}%
          </Text>
        </View>
        <Text style={[styles.sessions, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {presentCount}/{totalSessions} aulas
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  rank: { width: 30, fontSize: 14, textAlign: "center" },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  initials: { fontSize: 14 },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 14 },
  barContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  barBg: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 2 },
  pct: { fontSize: 12, width: 36, textAlign: "right" },
  sessions: { fontSize: 11 },
});

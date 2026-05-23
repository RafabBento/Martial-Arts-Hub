import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { ModalityBadge } from "./ModalityBadge";

interface StudentCardProps {
  name: string;
  email: string;
  profilePhotoUrl?: string | null;
  modalityThai: boolean;
  modalityJiu: boolean;
  thaiGrade?: string | null;
  jiuGrade?: string | null;
  totalAttendanceThai: number;
  totalAttendanceJiu: number;
  onPress: () => void;
}

export function StudentCard({
  name, email, profilePhotoUrl, modalityThai, modalityJiu,
  thaiGrade, jiuGrade, totalAttendanceThai, totalAttendanceJiu, onPress,
}: StudentCardProps) {
  const colors = useColors();
  const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.row}>
        {profilePhotoUrl ? (
          <Image source={{ uri: profilePhotoUrl }} style={styles.avatar} />
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
});

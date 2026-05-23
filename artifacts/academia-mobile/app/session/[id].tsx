import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetSession, useListAttendance } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

export default function SessionDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session, isLoading: sessionLoading } = useGetSession(Number(id));
  const { data: attendance, isLoading: attLoading } = useListAttendance({ sessionId: Number(id) });
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const isThai = session?.modality === "thai";
  const accentColor = isThai ? colors.thai : colors.jiu;

  if (sessionLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (!session) return null;

  const date = new Date(session.sessionDate);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Sessão
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={attendance ?? []}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 24 }]}
        refreshing={attLoading}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={[styles.sessionInfo, { backgroundColor: colors.card, borderColor: accentColor, borderLeftColor: accentColor }]}>
              <Text style={[styles.modality, { color: accentColor, fontFamily: "Inter_700Bold" }]}>
                {isThai ? "MUAY THAI" : "JIU-JITSU"}
              </Text>
              <Text style={[styles.dateText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </Text>
              <Text style={[styles.timeText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </Text>
              <Text style={[styles.teacher, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Prof. {session.teacherName}
              </Text>
              {session.description ? (
                <Text style={[styles.desc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {session.description}
                </Text>
              ) : null}
            </View>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              PRESENTES ({attendance?.length ?? 0})
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const initials = item.studentName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
          return (
            <View style={[styles.attendeeRow, { borderBottomColor: colors.border }]}>
              {item.studentPhotoUrl ? (
                <Image source={{ uri: item.studentPhotoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: accentColor + "22", alignItems: "center", justifyContent: "center" }]}>
                  <Text style={[styles.initials, { color: accentColor, fontFamily: "Inter_700Bold" }]}>{initials}</Text>
                </View>
              )}
              <View style={styles.attendeeInfo}>
                <Text style={[styles.attendeeName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                  {item.studentName}
                </Text>
                {item.faceRecognized && (
                  <View style={styles.faceRow}>
                    <Ionicons name="scan-outline" size={12} color={colors.success} />
                    <Text style={[styles.faceText, { color: colors.success, fontFamily: "Inter_400Regular" }]}>Reconhecido</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.time, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {new Date(item.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Nenhuma presença registrada
            </Text>
          </View>
        }
      />
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
  content: { padding: 20, gap: 0 },
  listHeader: { gap: 16, marginBottom: 8 },
  sessionInfo: { borderRadius: 14, borderWidth: 1, borderLeftWidth: 4, padding: 16, gap: 6 },
  modality: { fontSize: 11, letterSpacing: 1 },
  dateText: { fontSize: 17 },
  timeText: { fontSize: 14 },
  teacher: { fontSize: 13 },
  desc: { fontSize: 13, marginTop: 4 },
  sectionLabel: { fontSize: 11, letterSpacing: 1 },
  attendeeRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  initials: { fontSize: 14 },
  attendeeInfo: { flex: 1, gap: 2 },
  attendeeName: { fontSize: 14 },
  faceRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  faceText: { fontSize: 11 },
  time: { fontSize: 12 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 40 },
  emptyText: { fontSize: 14 },
});

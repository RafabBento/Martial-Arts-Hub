import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Redirect } from "expo-router";
import React from "react";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { ModalityBadge } from "@/components/ModalityBadge";

const ROLE_LABEL: Record<string, string> = {
  student: "Aluno",
  teacher: "Professor",
  admin: "Administrador",
};

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, isLoading: authLoading } = useAuth();

  if (!user && !authLoading) return <Redirect href="/login" />;
  if (!user) return null;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const initials = user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Meu Perfil</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 24 }]}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.avatarRow}>
            {user.profilePhotoUrl ? (
              <Image source={{ uri: user.profilePhotoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }]}>
                <Text style={[styles.initials, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>{initials}</Text>
              </View>
            )}
            <View style={styles.nameBlock}>
              <Text style={[styles.name, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{user.name}</Text>
              <Text style={[styles.email, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{user.email}</Text>
              <View style={[styles.roleBadge, { backgroundColor: colors.primary + "22", borderColor: colors.primary }]}>
                <Text style={[styles.roleText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                  {ROLE_LABEL[user.role] ?? user.role}
                </Text>
              </View>
            </View>
          </View>

          {(user.modalityThai || user.modalityJiu) && (
            <View style={styles.modalities}>
              {user.modalityThai && <ModalityBadge modality="thai" />}
              {user.modalityJiu && <ModalityBadge modality="jiu" />}
            </View>
          )}
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            INFORMAÇÕES
          </Text>
          {user.phone ? (
            <InfoRow icon="call-outline" label="Telefone" value={user.phone} colors={colors} />
          ) : null}
          {user.birthDate ? (
            <InfoRow icon="calendar-outline" label="Nascimento" value={new Date(user.birthDate).toLocaleDateString("pt-BR")} colors={colors} />
          ) : null}
          {user.paymentDay ? (
            <InfoRow icon="card-outline" label="Vencimento" value={`Dia ${user.paymentDay}`} colors={colors} />
          ) : null}
          {user.thaiGrade ? (
            <InfoRow icon="ribbon-outline" label="Grau Thai" value={user.thaiGrade} colors={colors} />
          ) : null}
          {user.jiuGrade ? (
            <InfoRow icon="ribbon-outline" label="Faixa Jiu" value={user.jiuGrade} colors={colors} />
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: colors.primary + "15", borderColor: colors.primary }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.primary} />
          <Text style={[styles.logoutText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>Sair</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value, colors }: { icon: any; label: string; value: string; colors: any }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={colors.mutedForeground} />
      <Text style={[styles.infoLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 26, letterSpacing: 0.5 },
  content: { padding: 20, gap: 16 },
  card: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 16 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  initials: { fontSize: 28 },
  nameBlock: { flex: 1, gap: 4 },
  name: { fontSize: 20 },
  email: { fontSize: 13 },
  roleBadge: { alignSelf: "flex-start", borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  roleText: { fontSize: 12 },
  modalities: { flexDirection: "row", gap: 8 },
  infoCard: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 14 },
  sectionLabel: { fontSize: 11, letterSpacing: 1, marginBottom: 4 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoLabel: { fontSize: 13, flex: 1 },
  infoValue: { fontSize: 13 },
  logoutBtn: { borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
  logoutText: { fontSize: 15 },
});

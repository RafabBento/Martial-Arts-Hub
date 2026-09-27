// Tela de bloqueio para contas (novas ou já existentes, qualquer papel) que
// ainda não têm o rosto de referência cadastrado. Reconhecimento facial é
// obrigatório — usado para contabilizar presença automaticamente. O layout
// raiz (_layout.tsx) sempre redireciona para cá quando user.faceRegistered é
// false (depois do gate do termo de saúde, ver complete-profile.tsx).
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMe } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { FaceEnrollModal } from "@/components/FaceEnrollModal";

export default function CompleteFaceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, setUser, logout } = useAuth();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const router = useRouter();

  const topPad = insets.top + 12;
  const botPad = insets.bottom + 24;

  if (!user) return null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.container, { paddingTop: topPad, paddingBottom: botPad }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={logout} style={styles.logoutBtn} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={16} color={colors.mutedForeground} />
            <Text style={[styles.logoutText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Sair</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.iconCircle, { backgroundColor: colors.primary + "18" }]}>
          <Ionicons name="scan-outline" size={30} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Falta o seu rosto, {user.name?.split(" ")[0]}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          O cadastro facial é obrigatório para todos — alunos, professores e administradores.
          É assim que a presença nos treinos é contabilizada automaticamente.
          Você não consegue usar o app até cadastrar seu rosto.
        </Text>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary }]}
          onPress={() => setEnrollOpen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="scan-outline" size={18} color="#fff" />
          <Text style={[styles.btnText, { fontFamily: "Inter_700Bold" }]}>CADASTRAR ROSTO (VÁRIOS ÂNGULOS)</Text>
        </TouchableOpacity>
      </View>

      <FaceEnrollModal
        visible={enrollOpen}
        userId={user.id}
        title="Cadastro facial obrigatório"
        onClose={() => setEnrollOpen(false)}
        onDone={(result) => {
          if (result.anglesStored > 0) {
            // Refaz /me em vez de assumir sucesso localmente — garante que o
            // gate de navegação reflete o que o servidor realmente tem salvo.
            getMe().then((freshUser) => {
              setUser(freshUser);
              router.replace("/(tabs)");
            });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, gap: 16, justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", position: "absolute", top: 0, left: 24, right: 24 },
  logoutBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 4 },
  logoutText: { fontSize: 13 },
  iconCircle: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  title: { fontSize: 22, letterSpacing: 0.3, textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  btn: { flexDirection: "row", gap: 8, borderRadius: 12, paddingVertical: 16, alignItems: "center", justifyContent: "center", marginTop: 8 },
  btnText: { color: "#fff", fontSize: 14, letterSpacing: 0.5 },
});

// Tela "Esqueci minha senha": pede o e-mail e dispara o link de redefinição.
// A redefinição em si (clicar no link do e-mail) abre o navegador no app web
// — mesma decisão já usada pra confirmação de e-mail (sem deep link).
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useForgotPassword } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const forgotMutation = useForgotPassword();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 32 : insets.bottom + 16;

  const handleSubmit = async () => {
    if (!email.trim()) return;
    await forgotMutation.mutateAsync({ data: { email } });
    setSent(true);
  };

  return (
    <ImageBackground
      source={require("../assets/images/bg-login.jpg")}
      style={styles.bg}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: topPad + 16, paddingBottom: botPad }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={[styles.screenTitle, { color: "#fff", fontFamily: "Inter_700Bold" }]}>
              Esqueci minha senha
            </Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={styles.card}>
            {sent ? (
              <View style={styles.successBlock}>
                <Ionicons name="mail-outline" size={40} color={colors.primary} />
                <Text style={[styles.successTitle, { fontFamily: "Inter_700Bold" }]}>Verifique seu e-mail</Text>
                <Text style={[styles.successText, { fontFamily: "Inter_400Regular" }]}>
                  Se {email} estiver cadastrado, enviamos um link para redefinir sua senha. Abra o link no navegador do celular.
                </Text>
                <TouchableOpacity onPress={() => router.replace("/login")} style={[styles.btn, { backgroundColor: colors.primary, marginTop: 8 }]}>
                  <Text style={[styles.btnText, { fontFamily: "Inter_700Bold" }]}>VOLTAR AO LOGIN</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={[styles.subtitle, { fontFamily: "Inter_400Regular" }]}>
                  Digite o e-mail da sua conta — vamos enviar um link para você redefinir a senha.
                </Text>

                <View style={styles.inputWrap}>
                  <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.5)" />
                  <TextInput
                    style={[styles.input, { fontFamily: "Inter_400Regular" }]}
                    placeholder="E-mail"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: colors.primary }]}
                  onPress={handleSubmit}
                  activeOpacity={0.85}
                  disabled={forgotMutation.isPending || !email.trim()}
                >
                  {forgotMutation.isPending
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={[styles.btnText, { fontFamily: "Inter_700Bold" }]}>ENVIAR LINK</Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#000" },
  flex: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.62)" },
  container: { flexGrow: 1, paddingHorizontal: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  screenTitle: { fontSize: 18, letterSpacing: 0.3 },
  card: { gap: 16 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 20 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14, paddingVertical: 14, gap: 10,
  },
  input: { flex: 1, fontSize: 15, color: "#fff" },
  btn: { borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  btnText: { color: "#fff", fontSize: 15, letterSpacing: 1 },
  successBlock: { alignItems: "center", gap: 10, paddingVertical: 12 },
  successTitle: { fontSize: 18, color: "#fff" },
  successText: { fontSize: 13, color: "rgba(255,255,255,0.6)", textAlign: "center", lineHeight: 19 },
});

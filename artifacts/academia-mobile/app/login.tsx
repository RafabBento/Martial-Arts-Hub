// Tela de login. Autentica o usuário (email + senha), salva a sessão via
// AuthContext e redireciona para a área logada (abas). Exibe a imagem de fundo
// da "arena" com um overlay escuro e o formulário sobreposto.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // login: persiste usuário + token no contexto de autenticação.
  const { login } = useAuth();
  // Mutação gerada pela API que faz a chamada de login no servidor.
  const loginMutation = useLogin();

  // Estado controlado dos campos do formulário e mensagem de erro.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // Valida os campos, chama a API de login e, em caso de sucesso, salva a sessão
  // e navega para as abas. Em erro, mostra mensagem e feedback háptico.
  const handleLogin = async () => {
    if (!email || !password) {
      setError("Preencha e-mail e senha.");
      return;
    }
    setError("");
    try {
      const data = await loginMutation.mutateAsync({ data: { email, password } });
      await login(data.user, data.token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch {
      setError("E-mail ou senha incorretos.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // Padding inferior: valor fixo no web, área segura (notch/gestos) no celular.
  const botPad = Platform.OS === "web" ? 32 : insets.bottom + 16;

  return (
    <ImageBackground
      source={require("../assets/images/bg-login.jpg")}
      style={styles.bg}
      resizeMode="cover"
    >
      {/* Gradiente escuro sobre a imagem */}
      <View style={styles.overlay} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[styles.container, { paddingBottom: botPad }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Espaçador para empurrar o card para baixo */}
          <View style={styles.spacer} />

          {/* Card de login */}
          <View style={styles.card}>
            <View style={styles.headingBlock}>
              <Text style={[styles.title, { fontFamily: "Inter_700Bold" }]}>
                ENTRE{"\n"}NA ARENA
              </Text>
              <Text style={[styles.subtitle, { fontFamily: "Inter_400Regular" }]}>
                Acesse sua conta para acompanhar{"\n"}seu progresso e treinos
              </Text>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={15} color="#ef4444" />
                <Text style={[styles.errorText, { fontFamily: "Inter_500Medium" }]}>{error}</Text>
              </View>
            ) : null}

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

            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.5)" />
              <TextInput
                style={[styles.input, { fontFamily: "Inter_400Regular" }]}
                placeholder="Senha"
                placeholderTextColor="rgba(255,255,255,0.4)"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="rgba(255,255,255,0.5)"
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary }]}
              onPress={handleLogin}
              activeOpacity={0.85}
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.btnText, { fontFamily: "Inter_700Bold" }]}>ENTRAR</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/register")} style={styles.registerLink}>
              <Text style={[styles.registerLinkText, { fontFamily: "Inter_400Regular" }]}>
                Não tem uma conta?{" "}
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                  Cadastre-se
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#000" },
  flex: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  spacer: { flex: 1, minHeight: 80 },
  card: {
    gap: 16,
    paddingBottom: 8,
  },
  headingBlock: { marginBottom: 8, gap: 8 },
  title: {
    fontSize: 38,
    color: "#fff",
    letterSpacing: 1.5,
    lineHeight: 44,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    lineHeight: 20,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.15)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
  },
  errorText: { fontSize: 13, color: "#ef4444", flex: 1 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#fff",
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  btnText: { color: "#fff", fontSize: 15, letterSpacing: 1 },
  registerLink: { alignItems: "center", paddingVertical: 4 },
  registerLinkText: { fontSize: 14, color: "rgba(255,255,255,0.5)" },
});

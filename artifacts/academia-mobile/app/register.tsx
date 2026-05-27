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
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const UNITS = [
  { value: "matriz",     label: "Front Matriz",     address: "Endereço atual" },
  { value: "panobianco", label: "Front Panobianco", address: "R. Benjamin Pereira, 548" },
  { value: "upfitness",  label: "Front Up Fitness", address: "Av. Gustavo Adolfo, 588" },
] as const;

type Unit = "matriz" | "panobianco" | "upfitness";

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();
  const registerMutation = useRegister();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [unit, setUnit] = useState<Unit>("matriz");
  const [modalityThai, setModalityThai] = useState(false);
  const [modalityJiu, setModalityJiu] = useState(false);
  const [error, setError] = useState("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Preencha nome, e-mail e senha.");
      return;
    }
    if (password.length < 6) {
      setError("Senha deve ter ao menos 6 caracteres.");
      return;
    }
    setError("");
    try {
      const data = await registerMutation.mutateAsync({
        data: {
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          unit,
          modalityThai: role === "student" ? modalityThai : false,
          modalityJiu: role === "student" ? modalityJiu : false,
        },
      });
      await login(data.user, data.token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: string } })?.data?.error;
      setError(msg ?? "Erro ao cadastrar. Tente novamente.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <ImageBackground
      source={require("../assets/images/bg-register.jpg")}
      style={styles.root}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: topPad + 16, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={[styles.screenTitle, { color: "#fff", fontFamily: "Inter_700Bold" }]}>
              Cadastro
            </Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Error */}
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.4)" }]}>
              <Ionicons name="alert-circle" size={16} color="#ef4444" />
              <Text style={[styles.errorText, { color: "#ef4444", fontFamily: "Inter_500Medium" }]}>{error}</Text>
            </View>
          ) : null}

          {/* Nome */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { fontFamily: "Inter_600SemiBold" }]}>NOME COMPLETO</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.5)" />
              <TextInput
                style={[styles.input, { fontFamily: "Inter_400Regular" }]}
                placeholder="Seu nome"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { fontFamily: "Inter_600SemiBold" }]}>E-MAIL</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.5)" />
              <TextInput
                style={[styles.input, { fontFamily: "Inter_400Regular" }]}
                placeholder="seu@email.com"
                placeholderTextColor="rgba(255,255,255,0.4)"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          {/* Senha */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { fontFamily: "Inter_600SemiBold" }]}>SENHA</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.5)" />
              <TextInput
                style={[styles.input, { fontFamily: "Inter_400Regular" }]}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor="rgba(255,255,255,0.4)"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Perfil */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { fontFamily: "Inter_600SemiBold" }]}>PERFIL</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, { backgroundColor: role === "student" ? colors.primary : "rgba(255,255,255,0.08)", borderColor: role === "student" ? colors.primary : "rgba(255,255,255,0.15)" }]}
                onPress={() => setRole("student")}
              >
                <Ionicons name="person-outline" size={16} color={role === "student" ? "#fff" : "rgba(255,255,255,0.5)"} />
                <Text style={[styles.toggleText, { color: role === "student" ? "#fff" : "rgba(255,255,255,0.5)", fontFamily: "Inter_600SemiBold" }]}>Aluno</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, { backgroundColor: role === "teacher" ? colors.primary : "rgba(255,255,255,0.08)", borderColor: role === "teacher" ? colors.primary : "rgba(255,255,255,0.15)" }]}
                onPress={() => setRole("teacher")}
              >
                <Ionicons name="ribbon-outline" size={16} color={role === "teacher" ? "#fff" : "rgba(255,255,255,0.5)"} />
                <Text style={[styles.toggleText, { color: role === "teacher" ? "#fff" : "rgba(255,255,255,0.5)", fontFamily: "Inter_600SemiBold" }]}>Professor</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Unidade */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { fontFamily: "Inter_600SemiBold" }]}>UNIDADE</Text>
            {UNITS.map(u => (
              <TouchableOpacity
                key={u.value}
                style={[styles.unitRow, { backgroundColor: unit === u.value ? colors.primary + "28" : "rgba(255,255,255,0.06)", borderColor: unit === u.value ? colors.primary + "90" : "rgba(255,255,255,0.13)" }]}
                onPress={() => setUnit(u.value)}
                activeOpacity={0.7}
              >
                <View style={[styles.radio, { borderColor: unit === u.value ? colors.primary : "rgba(255,255,255,0.4)", backgroundColor: unit === u.value ? colors.primary : "transparent" }]}>
                  {unit === u.value && <View style={styles.radioDot} />}
                </View>
                <View style={styles.unitInfo}>
                  <Text style={[styles.unitLabel, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>{u.label}</Text>
                  <Text style={[styles.unitAddress, { color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular" }]}>{u.address}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Modalidades — apenas alunos */}
          {role === "student" && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { fontFamily: "Inter_600SemiBold" }]}>MODALIDADES</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, { backgroundColor: modalityThai ? "rgba(127,29,29,0.7)" : "rgba(255,255,255,0.08)", borderColor: modalityThai ? colors.thai : "rgba(255,255,255,0.15)" }]}
                  onPress={() => setModalityThai(v => !v)}
                >
                  <Text style={[styles.toggleText, { color: modalityThai ? colors.thai : "rgba(255,255,255,0.5)", fontFamily: "Inter_600SemiBold" }]}>🥊 Muay Thai</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, { backgroundColor: modalityJiu ? "rgba(26,39,68,0.9)" : "rgba(255,255,255,0.08)", borderColor: modalityJiu ? colors.jiu : "rgba(255,255,255,0.15)" }]}
                  onPress={() => setModalityJiu(v => !v)}
                >
                  <Text style={[styles.toggleText, { color: modalityJiu ? colors.jiu : "rgba(255,255,255,0.5)", fontFamily: "Inter_600SemiBold" }]}>🥋 Jiu-Jitsu</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Botão */}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={handleRegister}
            activeOpacity={0.8}
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.btnText, { fontFamily: "Inter_700Bold" }]}>CADASTRAR</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.loginLink}>
            <Text style={[styles.loginLinkText, { fontFamily: "Inter_400Regular" }]}>
              Já tem conta?{" "}
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Entrar</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.65)" },
  flex: { flex: 1 },
  container: { paddingHorizontal: 24, gap: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  screenTitle: { fontSize: 22, letterSpacing: 0.5 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  errorText: { fontSize: 13, flex: 1 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.5)" },
  inputWrap: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  input: { flex: 1, fontSize: 15, color: "#fff" },
  toggleRow: { flexDirection: "row", gap: 10 },
  toggleBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 1, paddingVertical: 12 },
  toggleText: { fontSize: 14 },
  unitRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 6 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  unitInfo: { flex: 1 },
  unitLabel: { fontSize: 14 },
  unitAddress: { fontSize: 12, marginTop: 1 },
  btn: { borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  btnText: { color: "#fff", fontSize: 15, letterSpacing: 1 },
  loginLink: { alignItems: "center", paddingVertical: 4 },
  loginLinkText: { fontSize: 14, color: "rgba(255,255,255,0.5)" },
});

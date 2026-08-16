// Tela de bloqueio para contas criadas antes do termo de saúde/responsabilidade
// existir. Enquanto o usuário (aluno, professor ou admin) não preencher esse
// termo, o layout raiz (_layout.tsx) sempre redireciona para cá — ver o efeito
// em RootLayoutNav que checa user.profileComplete.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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
import { useCompleteProfile } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

// Calcula a idade a partir da data de nascimento (YYYY-MM-DD), na data atual.
function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// Só compara telefones se ambos estiverem preenchidos.
function samePhone(a: string, b: string): boolean {
  if (!a.trim() || !b.trim()) return false;
  const digits = (s: string) => s.replace(/\D/g, "");
  return digits(a) === digits(b);
}

export default function CompleteProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, setUser, logout } = useAuth();
  const completeMutation = useCompleteProfile();

  const [phone, setPhone] = useState(user?.phone ?? "");
  const [birthDate, setBirthDate] = useState(user?.birthDate ?? "");
  const [hasInjury, setHasInjury] = useState(false);
  const [injuryDetails, setInjuryDetails] = useState("");
  const [hasCondition, setHasCondition] = useState(false);
  const [conditionDetails, setConditionDetails] = useState("");
  const [takesMedication, setTakesMedication] = useState(false);
  const [medicationDetails, setMedicationDetails] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [imageConsent, setImageConsent] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [error, setError] = useState("");

  const isMinor = !!birthDate && calculateAge(birthDate) < 18;
  const topPad = Platform.OS === "web" ? 24 : insets.top + 12;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
  };

  const handleSubmit = async () => {
    if (!phone.trim() || !birthDate.trim()) {
      setError("Preencha telefone e data de nascimento.");
      return;
    }
    if (!emergencyContactName.trim() || !emergencyContactPhone.trim()) {
      setError("Preencha o nome e telefone do contato de emergência.");
      return;
    }
    if (samePhone(emergencyContactPhone, phone)) {
      setError("O contato de emergência não pode ter o mesmo telefone do próprio usuário.");
      return;
    }
    if (isMinor) {
      if (!guardianName.trim() || !guardianPhone.trim()) {
        setError("Para menores de idade, informe o nome e telefone do responsável.");
        return;
      }
      if (samePhone(guardianPhone, phone)) {
        setError("O telefone do responsável não pode ser o mesmo do usuário.");
        return;
      }
      if (samePhone(guardianPhone, emergencyContactPhone)) {
        setError("O telefone do responsável não pode ser o mesmo do contato de emergência.");
        return;
      }
    }
    if (!declarationAccepted) {
      setError("É necessário aceitar a declaração final para continuar.");
      return;
    }
    setError("");
    try {
      const updated = await completeMutation.mutateAsync({
        data: {
          phone: phone.trim(),
          birthDate: birthDate.trim(),
          hasInjury,
          injuryDetails: hasInjury ? injuryDetails.trim() || undefined : undefined,
          hasCondition,
          conditionDetails: hasCondition ? conditionDetails.trim() || undefined : undefined,
          takesMedication,
          medicationDetails: takesMedication ? medicationDetails.trim() || undefined : undefined,
          emergencyContactName: emergencyContactName.trim(),
          emergencyContactPhone: emergencyContactPhone.trim(),
          imageConsent,
          guardianName: isMinor ? guardianName.trim() : undefined,
          guardianPhone: isMinor ? guardianPhone.trim() : undefined,
          declarationAccepted,
        },
      });
      setUser(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: string } })?.data?.error;
      setError(msg ?? "Erro ao concluir cadastro. Tente novamente.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: topPad, paddingBottom: botPad + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.logoutText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Sair</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.iconCircle, { backgroundColor: colors.primary + "18" }]}>
            <Ionicons name="shield-checkmark-outline" size={28} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Falta pouco, {user?.name?.split(" ")[0]}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Sua conta ainda não tem o termo de saúde e responsabilidade preenchido.
            É obrigatório preencher todas as informações abaixo para acessar a aplicação.
          </Text>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.4)" }]}>
              <Ionicons name="alert-circle" size={16} color="#ef4444" />
              <Text style={[styles.errorText, { color: "#ef4444", fontFamily: "Inter_500Medium" }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>TELEFONE</Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Ionicons name="call-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                placeholder="(11) 99999-0000"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>DATA DE NASCIMENTO</Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Ionicons name="calendar-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                value={birthDate}
                onChangeText={setBirthDate}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>SAÚDE E RESPONSABILIDADE</Text>

            <CheckRow colors={colors} label="Possui alguma lesão ou limitação?" checked={hasInjury} onToggle={() => setHasInjury(v => !v)} />
            {hasInjury && (
              <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card, alignItems: "flex-start" }]}>
                <TextInput
                  style={[styles.input, { color: colors.foreground, fontFamily: "Inter_400Regular", minHeight: 60 }]}
                  placeholder="Descreva a lesão ou limitação"
                  placeholderTextColor={colors.mutedForeground}
                  value={injuryDetails}
                  onChangeText={setInjuryDetails}
                  multiline
                />
              </View>
            )}

            <CheckRow colors={colors} label="Possui alguma doença ou condição que deveríamos saber?" checked={hasCondition} onToggle={() => setHasCondition(v => !v)} />
            {hasCondition && (
              <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card, alignItems: "flex-start" }]}>
                <TextInput
                  style={[styles.input, { color: colors.foreground, fontFamily: "Inter_400Regular", minHeight: 60 }]}
                  placeholder="Descreva a doença ou condição"
                  placeholderTextColor={colors.mutedForeground}
                  value={conditionDetails}
                  onChangeText={setConditionDetails}
                  multiline
                />
              </View>
            )}

            <CheckRow colors={colors} label="Faz uso de medicamento contínuo?" checked={takesMedication} onToggle={() => setTakesMedication(v => !v)} />
            {takesMedication && (
              <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card, alignItems: "flex-start" }]}>
                <TextInput
                  style={[styles.input, { color: colors.foreground, fontFamily: "Inter_400Regular", minHeight: 60 }]}
                  placeholder="Qual(is) medicamento(s)"
                  placeholderTextColor={colors.mutedForeground}
                  value={medicationDetails}
                  onChangeText={setMedicationDetails}
                  multiline
                />
              </View>
            )}

            <Text style={[styles.sublabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>Contato de emergência</Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Ionicons name="person-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                placeholder="Nome completo"
                placeholderTextColor={colors.mutedForeground}
                value={emergencyContactName}
                onChangeText={setEmergencyContactName}
              />
            </View>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Ionicons name="call-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                placeholder="(11) 99999-0000"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                value={emergencyContactPhone}
                onChangeText={setEmergencyContactPhone}
              />
            </View>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>Não pode ser o mesmo telefone do próprio usuário</Text>

            <CheckRow colors={colors} label="Autoriza o uso de imagens?" checked={imageConsent} onToggle={() => setImageConsent(v => !v)} />

            {isMinor && (
              <View style={{ gap: 8, marginTop: 8 }}>
                <Text style={[styles.sublabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>Dados do responsável (menor de idade)</Text>
                <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Ionicons name="person-outline" size={18} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                    placeholder="Nome completo do responsável"
                    placeholderTextColor={colors.mutedForeground}
                    value={guardianName}
                    onChangeText={setGuardianName}
                  />
                </View>
                <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Ionicons name="call-outline" size={18} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                    placeholder="(11) 99999-0000"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="phone-pad"
                    value={guardianPhone}
                    onChangeText={setGuardianPhone}
                  />
                </View>
              </View>
            )}

            <View style={{ marginTop: 8 }}>
              <CheckRow
                colors={colors}
                label={isMinor
                  ? "Li e declaro que estou deixando meu filho treinar com a Front."
                  : "Declaro que li e que as informações acima são verdadeiras."}
                checked={declarationAccepted}
                onToggle={() => setDeclarationAccepted(v => !v)}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={handleSubmit}
            activeOpacity={0.8}
            disabled={completeMutation.isPending}
          >
            {completeMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.btnText, { fontFamily: "Inter_700Bold" }]}>CONCLUIR CADASTRO</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// Linha de checkbox reutilizada nas perguntas do termo de saúde.
function CheckRow({ label, checked, onToggle, colors }: { label: string; checked: boolean; onToggle: () => void; colors: any }) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={onToggle} activeOpacity={0.7}>
      <Ionicons name={checked ? "checkbox" : "square-outline"} size={20} color={checked ? colors.primary : colors.mutedForeground} />
      <Text style={[styles.checkLabel, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  container: { paddingHorizontal: 24, gap: 16 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  logoutBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 4 },
  logoutText: { fontSize: 13 },
  iconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 4 },
  title: { fontSize: 22, letterSpacing: 0.3, textAlign: "center" },
  subtitle: { fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: 4 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  errorText: { fontSize: 13, flex: 1 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 11, letterSpacing: 1 },
  inputWrap: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  input: { flex: 1, fontSize: 15 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  checkLabel: { flex: 1, fontSize: 14 },
  sublabel: { fontSize: 12, marginTop: 4 },
  hint: { fontSize: 11, marginTop: -4 },
  btn: { borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  btnText: { color: "#fff", fontSize: 15, letterSpacing: 1 },
});

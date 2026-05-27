import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Redirect } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useUpdateUser,
  useUpdateStudent,
  useGetStudent,
  getListUsersQueryKey,
  getGetStudentQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { ModalityBadge } from "@/components/ModalityBadge";

const logoThai = require("@/assets/images/logo-thai.png");
const logoJiu = require("@/assets/images/logo-jiu.png");

const ROLE_LABEL: Record<string, string> = {
  student: "Aluno",
  teacher: "Professor",
  admin: "Administrador",
};

const UNIT_OPTIONS = [
  { value: "matriz" as const, label: "Front Matriz", address: "Endereço atual" },
  { value: "panobianco" as const, label: "Front Panobianco", address: "R. Benjamin Pereira, 548" },
  { value: "upfitness" as const, label: "Front Up Fitness", address: "Av. Gustavo Adolfo, 588" },
];

function isBirthdayToday(birthDate: string | null | undefined): boolean {
  if (!birthDate) return false;
  const today = new Date();
  const [, month, day] = birthDate.split("-");
  return (
    parseInt(month, 10) === today.getMonth() + 1 &&
    parseInt(day, 10) === today.getDate()
  );
}

const JIU_COLOR_MAP: Record<string, string> = {
  white: "#f5f5f5",
  blue: "#2563eb",
  purple: "#7c3aed",
  brown: "#92400e",
  black: "#111827",
};

function JiuBeltStripe({ color }: { color: string }) {
  const bg = JIU_COLOR_MAP[color] ?? "#555";
  return (
    <View style={[beltStyles.belt, { backgroundColor: bg, borderColor: color === "white" ? "#ccc" : "rgba(255,255,255,0.2)" }]}>
      <View style={beltStyles.tip} />
    </View>
  );
}
const beltStyles = StyleSheet.create({
  belt: { height: 12, width: 64, borderRadius: 3, borderWidth: 1, overflow: "hidden", flexDirection: "row" },
  tip: { width: 16, backgroundColor: "rgba(0,0,0,0.8)" },
});

function PrajiedStripe({ grade }: { grade: string }) {
  const colorMap: Record<string, string> = {
    branco: "#f5f5f5",
    vermelha: "#dc2626",
    amarela: "#facc15",
    verde: "#16a34a",
    azul: "#2563eb",
    preta: "#1f2937",
  };
  const primary = grade.split(" ")[0]?.toLowerCase() ?? "branco";
  const bg = colorMap[primary] ?? "#555";
  return <View style={[prajStyles.stripe, { backgroundColor: bg, borderColor: primary === "branco" ? "#ccc" : "rgba(255,255,255,0.2)" }]} />;
}
const prajStyles = StyleSheet.create({
  stripe: { height: 10, width: 56, borderRadius: 5, borderWidth: 1 },
});

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, setUser, logout, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [modality, setModality] = useState<"thai" | "jiu">("thai");
  const [toast, setToast] = useState<string | null>(null);

  // Edit fields
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState<"matriz" | "panobianco" | "upfitness">("matriz");
  const [editPhone, setEditPhone] = useState("");
  const [editBirth, setEditBirth] = useState("");
  const [editPayDay, setEditPayDay] = useState("");

  const updateUserMutation = useUpdateUser();
  const updateStudentMutation = useUpdateStudent();

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  const { data: studentData, refetch: refetchStudent } = useGetStudent(user?.id ?? 0, {
    query: { enabled: !!user?.id && user?.role === "student", queryKey: getGetStudentQueryKey(user?.id ?? 0) },
  });

  const hasThai = studentData?.modalityThai ?? (user?.modalityThai ?? false);
  const hasJiu = studentData?.modalityJiu ?? (user?.modalityJiu ?? false);
  const showToggle = hasThai && hasJiu;
  const isBollacha = !isTeacherOrAdmin && (studentData?.bollacha === true);
  const showJiuLogo = hasJiu && isBollacha;

  useEffect(() => {
    if (!isTeacherOrAdmin && studentData && !studentData.modalityThai && studentData.modalityJiu) {
      setModality("jiu");
    }
  }, [studentData, isTeacherOrAdmin]);

  const startEditing = () => {
    if (!user) return;
    setEditName(user.name ?? "");
    setEditUnit((user.unit as any) ?? "matriz");
    setEditPhone(user.phone ?? "");
    setEditBirth(user.birthDate ?? "");
    setEditPayDay(user.paymentDay ? String(user.paymentDay) : "");
    setEditing(true);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleSave = () => {
    if (!user) return;
    updateUserMutation.mutate(
      {
        id: user.id,
        data: {
          name: editName || undefined,
          unit: editUnit,
          phone: editPhone || undefined,
          birthDate: editBirth || undefined,
          paymentDay: editPayDay ? Number(editPayDay) : undefined,
        },
      },
      {
        onSuccess: (updated) => {
          setUser(updated);
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          setEditing(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast("Perfil atualizado!");
        },
        onError: () => showToast("Erro ao atualizar perfil"),
      }
    );
  };

  const handleBollachaToggle = (newVal: boolean) => {
    if (!user) return;
    updateStudentMutation.mutate(
      { id: user.id, data: { bollacha: newVal } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetStudentQueryKey(user.id) });
          refetchStudent();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          showToast(newVal ? "Plano atualizado: Front e Bollacha" : "Plano atualizado: Apenas Front");
        },
        onError: () => showToast("Erro ao atualizar plano"),
      }
    );
  };

  const copyPix = async () => {
    await Clipboard.setStringAsync("frontartesmarciais@gmail.com");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast("Chave PIX copiada!");
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
  };

  if (!user && !authLoading) return <Redirect href="/login" />;
  if (!user) return null;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;
  const initials = user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const isToday = isBirthdayToday(user.birthDate);
  const thaiGrade = studentData?.thaiGrade ?? (user as any).thaiGrade;
  const jiuGrade = studentData?.jiuGrade ?? (user as any).jiuGrade;
  const jiuGradeColor = studentData?.jiuGradeColor ?? (user as any).jiuGradeColor;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {toast && (
        <View style={[styles.toast, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.toastText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{toast}</Text>
        </View>
      )}

      {/* Cabeçalho com logos */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          {/* Logo Thai — sempre visível para quem tem Thai */}
          <Image
            source={logoThai}
            style={styles.logoImg}
            resizeMode="contain"
          />

          {/* Centro: título + toggle */}
          <View style={styles.headerCenter}>
            <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Meu Perfil</Text>
            {showToggle && (
              <View style={[styles.modalityToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {(["thai", "jiu"] as const).map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.modalityTab, {
                      backgroundColor: modality === m
                        ? (m === "thai" ? colors.thai + "25" : colors.jiu + "25")
                        : "transparent",
                      borderColor: modality === m
                        ? (m === "thai" ? colors.thai : colors.jiu)
                        : "transparent",
                    }]}
                    onPress={() => setModality(m)}
                  >
                    <Text style={[styles.modalityTabText, {
                      color: modality === m
                        ? (m === "thai" ? colors.thai : colors.jiu)
                        : colors.mutedForeground,
                      fontFamily: modality === m ? "Inter_700Bold" : "Inter_400Regular",
                    }]}>
                      {m === "thai" ? "Thai" : "Jiu"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Logo Jiu — só se for bollacha */}
          <View style={styles.logoSlot}>
            {showJiuLogo && (
              <Image source={logoJiu} style={styles.logoImg} resizeMode="contain" />
            )}
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: botPad + 24 }]}>
        {/* Banner aniversário */}
        {isToday && (
          <View style={[styles.birthdayBanner, { backgroundColor: "rgba(234,179,8,0.12)", borderColor: "rgba(234,179,8,0.3)" }]}>
            <Ionicons name="gift-outline" size={20} color="#fbbf24" />
            <Text style={[styles.birthdayText, { color: "#fbbf24", fontFamily: "Inter_600SemiBold" }]}>
              Feliz aniversário, {user.name.split(" ")[0]}! 🎂 A academia inteira te deseja um ótimo dia!
            </Text>
          </View>
        )}

        {/* Card de identidade */}
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
              <View style={styles.badgesRow}>
                <View style={[styles.roleBadge, {
                  backgroundColor: user.role === "admin" ? "rgba(124,58,237,0.18)" : user.role === "teacher" ? "rgba(234,179,8,0.18)" : colors.primary + "20",
                  borderColor: user.role === "admin" ? "#7c3aed" : user.role === "teacher" ? "#d97706" : colors.primary,
                }]}>
                  <Text style={[styles.roleText, {
                    color: user.role === "admin" ? "#a78bfa" : user.role === "teacher" ? "#fbbf24" : colors.primary,
                    fontFamily: "Inter_600SemiBold",
                  }]}>
                    {ROLE_LABEL[user.role] ?? user.role}
                  </Text>
                </View>
                {(hasThai || hasJiu) && (
                  <View style={styles.modBadges}>
                    {hasThai && <ModalityBadge modality="thai" />}
                    {hasJiu && <ModalityBadge modality="jiu" />}
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Plano — apenas alunos com Jiu */}
        {!isTeacherOrAdmin && hasJiu && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              MEU PLANO
            </Text>
            <Text style={[styles.planDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Escolha se você treina na Front com o kimono (Bollacha Wrestling) ou apenas na Front.
            </Text>
            <View style={styles.planOptions}>
              <TouchableOpacity
                style={[styles.planOption, {
                  backgroundColor: !isBollacha ? colors.primary + "15" : "transparent",
                  borderColor: !isBollacha ? colors.primary + "70" : colors.border,
                }]}
                onPress={() => !isBollacha ? null : handleBollachaToggle(false)}
                disabled={updateStudentMutation.isPending}
              >
                <View style={[styles.planRadio, {
                  borderColor: !isBollacha ? colors.primary : colors.mutedForeground,
                  backgroundColor: !isBollacha ? colors.primary : "transparent",
                }]}>
                  {!isBollacha && <View style={styles.planRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.planTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                    Apenas Front
                  </Text>
                  <Text style={[styles.planSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Treino sem kimono (No-Gi)
                  </Text>
                </View>
                <Image source={logoThai} style={styles.planLogo} resizeMode="contain" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.planOption, {
                  backgroundColor: isBollacha ? colors.jiu + "12" : "transparent",
                  borderColor: isBollacha ? colors.jiu + "60" : colors.border,
                }]}
                onPress={() => isBollacha ? null : handleBollachaToggle(true)}
                disabled={updateStudentMutation.isPending}
              >
                <View style={[styles.planRadio, {
                  borderColor: isBollacha ? colors.jiu : colors.mutedForeground,
                  backgroundColor: isBollacha ? colors.jiu : "transparent",
                }]}>
                  {isBollacha && <View style={styles.planRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.planTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                    Front e Bollacha
                  </Text>
                  <Text style={[styles.planSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Front + Bollacha Wrestling BJJ
                  </Text>
                </View>
                <Image source={logoJiu} style={styles.planLogo} resizeMode="contain" />
              </TouchableOpacity>
            </View>
            {updateStudentMutation.isPending && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </View>
        )}

        {/* Informações / Edição */}
        {editing ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              EDITAR PERFIL
            </Text>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Nome</Text>
              <View style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <TextInput
                  style={[styles.inputText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Seu nome"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Unidade</Text>
              {UNIT_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.unitOption, {
                    backgroundColor: editUnit === opt.value ? colors.primary + "15" : "transparent",
                    borderColor: editUnit === opt.value ? colors.primary + "80" : colors.border,
                  }]}
                  onPress={() => setEditUnit(opt.value)}
                >
                  <View style={[styles.radio, {
                    borderColor: editUnit === opt.value ? colors.primary : colors.mutedForeground,
                    backgroundColor: editUnit === opt.value ? colors.primary : "transparent",
                  }]}>
                    {editUnit === opt.value && <View style={styles.radioDot} />}
                  </View>
                  <View>
                    <Text style={[styles.unitLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{opt.label}</Text>
                    <Text style={[styles.unitAddress, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{opt.address}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Telefone</Text>
              <View style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <TextInput
                  style={[styles.inputText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="(11) 99999-0000"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Data de Nascimento</Text>
              <View style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <TextInput
                  style={[styles.inputText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                  value={editBirth}
                  onChangeText={setEditBirth}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Dia de Pagamento</Text>
              <View style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <TextInput
                  style={[styles.inputText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                  value={editPayDay}
                  onChangeText={setEditPayDay}
                  placeholder="Ex: 10"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={styles.editBtns}>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={updateUserMutation.isPending}
              >
                {updateUserMutation.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <>
                    <Ionicons name="checkmark-outline" size={16} color="#fff" />
                    <Text style={[styles.saveBtnText, { fontFamily: "Inter_700Bold" }]}>Salvar</Text>
                  </>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setEditing(false)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.infoHeader}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                INFORMAÇÕES
              </Text>
              <TouchableOpacity
                style={[styles.editBtn, { borderColor: colors.border }]}
                onPress={startEditing}
              >
                <Ionicons name="pencil-outline" size={14} color={colors.mutedForeground} />
                <Text style={[styles.editBtnText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Editar</Text>
              </TouchableOpacity>
            </View>

            <InfoRow icon="person-outline" label="Nome" value={user.name} colors={colors} />
            <InfoRow icon="mail-outline" label="Email" value={user.email} colors={colors} />
            {user.phone && <InfoRow icon="call-outline" label="Telefone" value={user.phone} colors={colors} />}
            {user.birthDate && (
              <InfoRow
                icon="calendar-outline"
                label="Aniversário"
                value={new Date(user.birthDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
                colors={colors}
              />
            )}
            {user.paymentDay && <InfoRow icon="card-outline" label="Dia de pagamento" value={`Dia ${user.paymentDay}`} colors={colors} />}
            {user.unit && (
              <InfoRow
                icon="location-outline"
                label="Unidade"
                value={UNIT_OPTIONS.find(u => u.value === user.unit)?.label ?? user.unit}
                colors={colors}
              />
            )}

            {modality === "thai" && thaiGrade && (
              <View style={styles.gradeRow}>
                <Ionicons name="ribbon-outline" size={16} color={colors.thai} />
                <Text style={[styles.infoLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Grau Thai</Text>
                <View style={styles.gradeRight}>
                  <Text style={[styles.infoValue, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{thaiGrade}</Text>
                  <PrajiedStripe grade={thaiGrade} />
                </View>
              </View>
            )}
            {modality === "jiu" && jiuGrade && (
              <View style={styles.gradeRow}>
                <Ionicons name="ribbon-outline" size={16} color={colors.jiu} />
                <Text style={[styles.infoLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Faixa Jiu</Text>
                <View style={styles.gradeRight}>
                  <Text style={[styles.infoValue, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{jiuGrade}</Text>
                  {jiuGradeColor && <JiuBeltStripe color={jiuGradeColor} />}
                </View>
              </View>
            )}
          </View>
        )}

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
      <Text style={[styles.infoValue, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toast: {
    position: "absolute", top: 60, left: 16, right: 16, zIndex: 99,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  toastText: { fontSize: 13, textAlign: "center" },

  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerCenter: { flex: 1, alignItems: "center", gap: 8 },
  title: { fontSize: 22, letterSpacing: 0.5 },
  modalityToggle: { flexDirection: "row", borderRadius: 10, borderWidth: 1, padding: 2, gap: 2 },
  modalityTab: { borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 5 },
  modalityTabText: { fontSize: 12 },
  logoImg: { width: 70, height: 70 },
  logoSlot: { width: 70, height: 70 },

  content: { padding: 16, gap: 14 },

  birthdayBanner: { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  birthdayText: { fontSize: 13, flex: 1, lineHeight: 18 },

  card: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 12 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 66, height: 66, borderRadius: 33 },
  initials: { fontSize: 26 },
  nameBlock: { flex: 1, gap: 4 },
  name: { fontSize: 18 },
  email: { fontSize: 12 },
  badgesRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 },
  roleBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  roleText: { fontSize: 11 },
  modBadges: { flexDirection: "row", gap: 4 },

  sectionLabel: { fontSize: 11, letterSpacing: 1, marginBottom: 2 },
  planDesc: { fontSize: 12, lineHeight: 17, marginTop: -4 },
  planOptions: { gap: 8 },
  planOption: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 12, gap: 12 },
  planRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  planRadioDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#fff" },
  planTitle: { fontSize: 14 },
  planSub: { fontSize: 11, marginTop: 2 },
  planLogo: { width: 38, height: 38 },

  infoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  editBtnText: { fontSize: 12 },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoLabel: { fontSize: 13, flex: 1 },
  infoValue: { fontSize: 13, maxWidth: 180 },
  gradeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  gradeRight: { flexDirection: "row", alignItems: "center", gap: 8 },

  field: { gap: 6 },
  fieldLabel: { fontSize: 13 },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11 },
  inputText: { fontSize: 14 },
  unitOption: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 6 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  unitLabel: { fontSize: 13 },
  unitAddress: { fontSize: 11, marginTop: 1 },
  editBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  saveBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, padding: 14 },
  saveBtnText: { color: "#fff", fontSize: 14 },
  cancelBtn: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 14, alignItems: "center" },
  cancelBtnText: { fontSize: 14 },

  logoutBtn: { borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
  logoutText: { fontSize: 15 },
});

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
  useListAttendance,
  useGetStudent,
  useListPayments,
  getListAttendanceQueryKey,
  getListUsersQueryKey,
  getGetStudentQueryKey,
  getListPaymentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { ModalityBadge } from "@/components/ModalityBadge";

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

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
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
    <View style={[jiuBeltStyles.belt, { backgroundColor: bg, borderColor: color === "white" ? "#ccc" : "rgba(255,255,255,0.2)" }]}>
      <View style={jiuBeltStyles.tip} />
    </View>
  );
}
const jiuBeltStyles = StyleSheet.create({
  belt: { height: 12, width: 64, borderRadius: 3, borderWidth: 1, overflow: "hidden", flexDirection: "row" },
  tip: { width: 16, backgroundColor: "rgba(0,0,0,0.8)" },
});

function PrajiedStripe({ grade }: { grade: string }) {
  const colorMap: Record<string, string> = {
    "branco": "#f5f5f5",
    "vermelha": "#dc2626",
    "amarela": "#facc15",
    "verde": "#16a34a",
    "azul": "#2563eb",
    "preta": "#1f2937",
  };
  const primary = grade.split(" ")[0]?.toLowerCase() ?? "branco";
  const bg = colorMap[primary] ?? "#555";
  return <View style={[prajiedStyles.stripe, { backgroundColor: bg, borderColor: primary === "branco" ? "#ccc" : "rgba(255,255,255,0.2)" }]} />;
}
const prajiedStyles = StyleSheet.create({
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

  const updateMutation = useUpdateUser();

  const { data: studentData } = useGetStudent(user?.id ?? 0, {
    query: { enabled: !!user?.id && user?.role === "student", queryKey: getGetStudentQueryKey(user?.id ?? 0) },
  });

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  const hasThai = isTeacherOrAdmin ? (user?.modalityThai ?? false) : (studentData?.modalityThai ?? false);
  const hasJiu = isTeacherOrAdmin ? (user?.modalityJiu ?? false) : (studentData?.modalityJiu ?? false);
  const showToggle = hasThai && hasJiu;

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: payments } = useListPayments(
    { month, year },
    { query: { enabled: !!user?.id && user?.role === "student", queryKey: getListPaymentsQueryKey({ month, year }) } }
  );
  const myPayment = payments?.find(p => p.studentId === user?.id);
  const paid = myPayment?.paid ?? false;
  const paidDate = myPayment?.paidAt
    ? new Date(myPayment.paidAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })
    : null;

  useEffect(() => {
    if (!isTeacherOrAdmin && studentData && !studentData.modalityThai && studentData.modalityJiu) {
      setModality("jiu");
    }
  }, [studentData, isTeacherOrAdmin]);

  const startEditing = () => {
    if (!user) return;
    setEditName(user.name ?? "");
    setEditUnit(user.unit ?? "matriz");
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
    updateMutation.mutate(
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

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
  };

  const copyPix = async () => {
    await Clipboard.setStringAsync("frontartesmarciais@gmail.com");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast("Chave PIX copiada!");
  };

  if (!user && !authLoading) return <Redirect href="/login" />;
  if (!user) return null;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;
  const initials = user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const isToday = isBirthdayToday(user.birthDate);

  const thaiGrade = studentData?.thaiGrade ?? user.thaiGrade;
  const jiuGrade = studentData?.jiuGrade ?? user.jiuGrade;
  const jiuGradeColor = studentData?.jiuGradeColor ?? user.jiuGradeColor;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {toast && (
        <View style={[styles.toast, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.toastText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{toast}</Text>
        </View>
      )}

      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Meu Perfil</Text>
          {!editing && (
            <TouchableOpacity
              style={[styles.editBtn, { borderColor: colors.border }]}
              onPress={startEditing}
            >
              <Ionicons name="pencil-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.editBtnText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Editar</Text>
            </TouchableOpacity>
          )}
        </View>
        {showToggle && (
          <View style={styles.modalityToggle}>
            {(["thai", "jiu"] as const).map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.modalityTab, {
                  backgroundColor: modality === m ? (m === "thai" ? colors.thai + "25" : colors.jiu + "25") : "transparent",
                  borderColor: modality === m ? (m === "thai" ? colors.thai : colors.jiu) : "transparent",
                }]}
                onPress={() => setModality(m)}
              >
                <Text style={[styles.modalityTabText, {
                  color: modality === m ? (m === "thai" ? colors.thai : colors.jiu) : colors.mutedForeground,
                  fontFamily: modality === m ? "Inter_700Bold" : "Inter_400Regular",
                }]}>
                  {m === "thai" ? "Muay Thai" : "Jiu-Jitsu"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
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

        {/* Card principal */}
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

        {/* Modo edição */}
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
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending
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
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              INFORMAÇÕES
            </Text>
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

            {/* Graus */}
            {(modality === "thai" && thaiGrade) && (
              <View style={styles.gradeRow}>
                <Ionicons name="ribbon-outline" size={16} color={colors.thai} />
                <Text style={[styles.gradeLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Grau Thai</Text>
                <View style={styles.gradeRight}>
                  <Text style={[styles.gradeValue, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{thaiGrade}</Text>
                  <PrajiedStripe grade={thaiGrade} />
                </View>
              </View>
            )}
            {(modality === "jiu" && jiuGrade) && (
              <View style={styles.gradeRow}>
                <Ionicons name="ribbon-outline" size={16} color={colors.jiu} />
                <Text style={[styles.gradeLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Faixa Jiu</Text>
                <View style={styles.gradeRight}>
                  <Text style={[styles.gradeValue, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{jiuGrade}</Text>
                  {jiuGradeColor && <JiuBeltStripe color={jiuGradeColor} />}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Card de mensalidade — só para alunos */}
        {!isTeacherOrAdmin && user.role === "student" && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.payHeader}>
              <Ionicons name="card-outline" size={18} color={colors.primary} />
              <Text style={[styles.payTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Mensalidade</Text>
              <Text style={[styles.payMonth, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {MONTHS[month - 1]} {year}
              </Text>
            </View>

            <View style={[styles.payStatus, {
              backgroundColor: paid ? "rgba(34,197,94,0.1)" : colors.primary + "15",
              borderColor: paid ? "rgba(34,197,94,0.3)" : colors.primary + "40",
            }]}>
              <Ionicons
                name={paid ? "checkmark-circle" : "time-outline"}
                size={22}
                color={paid ? "#4ade80" : colors.primary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.payStatusTitle, { color: paid ? "#4ade80" : colors.primary, fontFamily: "Inter_700Bold" }]}>
                  {paid ? "Mensalidade paga!" : "Pagamento pendente"}
                </Text>
                <Text style={[styles.payStatusSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {paid
                    ? `Confirmado em ${paidDate}`
                    : user.paymentDay
                      ? `Vence dia ${user.paymentDay} de cada mês`
                      : "Consulte o professor para informar sua data"
                  }
                </Text>
              </View>
            </View>

            {!paid && (
              <>
                <View style={[styles.pixInfo, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <View style={styles.pixRow}>
                    <Text style={[styles.pixRowLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Valor</Text>
                    <Text style={[styles.pixRowValue, { color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 17 }]}>R$ 80,00</Text>
                  </View>
                  <View style={styles.pixRow}>
                    <Text style={[styles.pixRowLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Banco</Text>
                    <Text style={[styles.pixRowValue, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>Caixa Econômica Federal</Text>
                  </View>
                  <View style={styles.pixRow}>
                    <Text style={[styles.pixRowLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Recebedor</Text>
                    <Text style={[styles.pixRowValue, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>Ewerton Tadeu da Silva</Text>
                  </View>
                </View>

                <View style={[styles.pixKeyRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pixKeyLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Chave PIX (e-mail)</Text>
                    <Text style={[styles.pixKey, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
                      frontartesmarciais@gmail.com
                    </Text>
                  </View>
                  <TouchableOpacity style={[styles.copyBtn, { borderColor: colors.border }]} onPress={copyPix}>
                    <Ionicons name="copy-outline" size={14} color={colors.mutedForeground} />
                    <Text style={[styles.copyBtnText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Copiar</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.pixNote, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Após efetuar o pagamento, envie o comprovante no privado para o professor confirmar.
                </Text>
              </>
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
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 26, letterSpacing: 0.5 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  editBtnText: { fontSize: 13 },
  modalityToggle: { flexDirection: "row", gap: 4 },
  modalityTab: { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 7 },
  modalityTabText: { fontSize: 13 },
  content: { padding: 16, gap: 14 },

  birthdayBanner: { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  birthdayText: { fontSize: 13, flex: 1, lineHeight: 18 },

  card: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 14 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  initials: { fontSize: 28 },
  nameBlock: { flex: 1, gap: 4 },
  name: { fontSize: 20 },
  email: { fontSize: 13 },
  badgesRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 },
  roleBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  roleText: { fontSize: 11 },
  modBadges: { flexDirection: "row", gap: 4 },

  sectionLabel: { fontSize: 11, letterSpacing: 1, marginBottom: 2 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoLabel: { fontSize: 13, flex: 1 },
  infoValue: { fontSize: 13, maxWidth: 180 },

  gradeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  gradeLabel: { fontSize: 13, flex: 1 },
  gradeRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  gradeValue: { fontSize: 13 },

  // Edit fields
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

  // Payment card
  payHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  payTitle: { fontSize: 17, flex: 1 },
  payMonth: { fontSize: 12 },
  payStatus: { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  payStatusTitle: { fontSize: 15, marginBottom: 2 },
  payStatusSub: { fontSize: 12, lineHeight: 17 },
  pixInfo: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 8 },
  pixRow: { flexDirection: "row", alignItems: "center" },
  pixRowLabel: { flex: 1, fontSize: 13 },
  pixRowValue: { fontSize: 13 },
  pixKeyRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, padding: 12 },
  pixKeyLabel: { fontSize: 11, marginBottom: 2 },
  pixKey: { fontSize: 13 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  copyBtnText: { fontSize: 12 },
  pixNote: { fontSize: 11, lineHeight: 16 },

  logoutBtn: { borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
  logoutText: { fontSize: 15 },
});

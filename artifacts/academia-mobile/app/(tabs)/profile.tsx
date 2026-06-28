// Tela de perfil do usuário. Mostra identidade, plano (Bollacha), informações
// editáveis e a graduação (faixas) em Muay Thai e Jiu-Jitsu. Permite trocar a
// foto de perfil / cadastrar o rosto e, para mestres, editar a própria
// graduação. Também concentra os componentes visuais de faixa/prajied.
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Redirect } from "expo-router";
import React, { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
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
  registerProfilePhoto,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { MenuButton } from "@/components/MenuButton";
import { ModalityBadge } from "@/components/ModalityBadge";
import { uploadImageToStorage } from "@/lib/uploadImage";
import { AuthImage } from "@/components/AuthImage";
import { FaceEnrollModal } from "@/components/FaceEnrollModal";

const logoThai = require("@/assets/images/logo-thai.png");
const logoJiu = require("@/assets/images/logo-jiu.png");

// Rótulos em pt-BR para o papel (role) do usuário.
const ROLE_LABEL: Record<string, string> = {
  student: "Aluno",
  teacher: "Professor",
  admin: "Administrador",
};

// Unidades (academias) disponíveis na edição do perfil.
const UNIT_OPTIONS = [
  { value: "matriz" as const, label: "Front Matriz", address: "Endereço atual" },
  { value: "panobianco" as const, label: "Front Panobianco", address: "R. Benjamin Pereira, 548" },
  { value: "upfitness" as const, label: "Front Up Fitness", address: "Av. Gustavo Adolfo, 588" },
];

// Verifica se a data de nascimento (YYYY-MM-DD) cai no dia de hoje (dia/mês).
function isBirthdayToday(birthDate: string | null | undefined): boolean {
  if (!birthDate) return false;
  const today = new Date();
  const [, month, day] = birthDate.split("-");
  return (
    parseInt(month, 10) === today.getMonth() + 1 &&
    parseInt(day, 10) === today.getDate()
  );
}

// Graus de prajied (faixas do Muay Thai), com cor principal e ponta opcional.
const PRAJIED_GRADES = [
  { value: "branco",                 label: "Branco",                 primary: "#f5f5f5", secondary: null },
  { value: "branco-ponta-vermelha",  label: "Branco ponta vermelha",  primary: "#f5f5f5", secondary: "#dc2626" },
  { value: "vermelha",               label: "Vermelha",               primary: "#dc2626", secondary: null },
  { value: "vermelha-ponta-amarela", label: "Vermelha ponta amarela", primary: "#dc2626", secondary: "#facc15" },
  { value: "amarela",                label: "Amarela",                primary: "#facc15", secondary: null },
  { value: "amarela-ponta-verde",    label: "Amarela ponta verde",    primary: "#facc15", secondary: "#16a34a" },
  { value: "verde",                  label: "Verde",                  primary: "#16a34a", secondary: null },
  { value: "verde-ponta-azul",       label: "Verde ponta azul",       primary: "#16a34a", secondary: "#2563eb" },
  { value: "azul",                   label: "Azul",                   primary: "#2563eb", secondary: null },
  { value: "azul-ponta-preta",       label: "Azul ponta preta",       primary: "#2563eb", secondary: "#111827" },
  { value: "preta",                  label: "Preta",                  primary: "#111827", secondary: null },
];

// Cores das faixas de Jiu-Jitsu (chave interna, rótulo pt-BR e hex).
const JIU_COLORS = [
  { value: "white",  label: "Branca",  hex: "#f5f5f5" },
  { value: "blue",   label: "Azul",    hex: "#2563eb" },
  { value: "purple", label: "Roxa",    hex: "#7c3aed" },
  { value: "brown",  label: "Marrom",  hex: "#92400e" },
  { value: "black",  label: "Preta",   hex: "#111827" },
];

// Ordem das faixas de Jiu-Jitsu (usada no seletor de graduação).
const JIU_GRADES = ["Branca", "Azul", "Roxa", "Marrom", "Preta"];

// Componente visual: desenha a faixa de Muay Thai (prajied) com a cor do grau.
function PrajiedStripe({ grade }: { grade: string }) {
  const entry = PRAJIED_GRADES.find(p => p.label === grade || p.value === grade);
  if (!entry) return null;
  return (
    <View style={prajStyles.body0}>
      <View style={[prajStyles.body, { backgroundColor: entry.primary, borderColor: entry.primary === "#f5f5f5" ? "#ccc" : "rgba(255,255,255,0.2)" }]}>
        {entry.secondary && (
          <View style={[prajStyles.tip, { backgroundColor: entry.secondary }]} />
        )}
      </View>
    </View>
  );
}
const prajStyles = StyleSheet.create({
  body0: { flexDirection: "row" },
  body: { height: 14, width: 80, borderRadius: 7, borderWidth: 1, overflow: "hidden", flexDirection: "row" },
  tip: { width: 22, position: "absolute", right: 0, top: 0, bottom: 0 },
});

// Componente visual: desenha a faixa de Jiu-Jitsu com a cor e os graus (graus =
// traços na ponta preta, limitados de 0 a 4).
function JiuBeltStripe({ color, degree }: { color: string; degree?: number | null }) {
  const hex = JIU_COLORS.find(c => c.value === color)?.hex ?? "#555";
  const stripes = Math.min(Math.max(degree ?? 0, 0), 4);
  const isWhite = color === "white";
  return (
    <View style={[beltStyles.belt, { backgroundColor: hex, borderColor: isWhite ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.15)" }]}>
      <View style={beltStyles.tip}>
        {Array.from({ length: stripes }).map((_, i) => (
          <View key={i} style={beltStyles.stripe} />
        ))}
      </View>
    </View>
  );
}
const beltStyles = StyleSheet.create({
  belt: { height: 20, width: 112, borderRadius: 4, borderWidth: 1, overflow: "hidden", flexDirection: "row" },
  tip: { width: 30, backgroundColor: "#111827", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2, position: "absolute", right: 0, top: 0, bottom: 0 },
  stripe: { width: 2, height: 14, backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 1 },
});

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, setUser, logout, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // Estados de UI: modo edição, modalidade exibida, toast, foto e modais.
  const [editing, setEditing] = useState(false);
  const [modality, setModality] = useState<"thai" | "jiu">("thai");
  const [toast, setToast] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  // Refs auxiliares: fonte de foto pendente (iOS) e instante de abertura do viewer.
  const pendingPhotoSource = useRef<"camera" | "gallery" | null>(null);
  const viewerOpenedAt = useRef(0);

  // Campos do formulário de edição de perfil.
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState<"matriz" | "panobianco" | "upfitness">("matriz");
  const [editPhone, setEditPhone] = useState("");
  const [editBirth, setEditBirth] = useState("");
  const [editPayDay, setEditPayDay] = useState("");

  // Seletores de graduação do próprio mestre (prajied/faixa e rascunho do grau).
  const [thaiPickerOpen, setThaiPickerOpen] = useState(false);
  const [jiuGradePickerOpen, setJiuGradePickerOpen] = useState(false);
  const [jiuDegreeDraft, setJiuDegreeDraft] = useState(0);

  // Mutações para atualizar dados do usuário e do aluno (plano Bollacha).
  const updateUserMutation = useUpdateUser();
  const updateStudentMutation = useUpdateStudent();

  // Professores/admins têm permissões e exibição diferentes dos alunos.
  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  // Busca dados do aluno (faixas/plano) — só habilitada para usuários "student".
  const { data: studentData, refetch: refetchStudent } = useGetStudent(user?.id ?? 0, {
    query: { enabled: !!user?.id && user?.role === "student", queryKey: getGetStudentQueryKey(user?.id ?? 0) },
  });

  // Flags derivadas: modalidades do usuário, se mostra o toggle Thai/Jiu, plano
  // Bollacha e se exibe o logo de Jiu.
  const hasThai = studentData?.modalityThai ?? (user?.modalityThai ?? false);
  const hasJiu = studentData?.modalityJiu ?? (user?.modalityJiu ?? false);
  const showToggle = hasThai && hasJiu;
  const isBollacha = !isTeacherOrAdmin && (studentData?.bollacha === true);
  const showJiuLogo = hasJiu && isBollacha;

  // Se o aluno só treina Jiu, já mostra a modalidade Jiu por padrão.
  useEffect(() => {
    if (!isTeacherOrAdmin && studentData && !studentData.modalityThai && studentData.modalityJiu) {
      setModality("jiu");
    }
  }, [studentData, isTeacherOrAdmin]);

  // Preenche os campos do formulário com os dados atuais e entra no modo edição.
  const startEditing = () => {
    if (!user) return;
    setEditName(user.name ?? "");
    setEditUnit((user.unit as any) ?? "matriz");
    setEditPhone(user.phone ?? "");
    setEditBirth(user.birthDate ?? "");
    setEditPayDay(user.paymentDay ? String(user.paymentDay) : "");
    setEditing(true);
  };

  // Exibe um toast temporário (some sozinho após 2,5s).
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Guarda a fonte escolhida (câmera/galeria) e dispara o seletor de imagem.
  const selectPhotoSource = (source: "camera" | "gallery") => {
    if (pendingPhotoSource.current || photoBusy) return;
    pendingPhotoSource.current = source;
    setPhotoSheetOpen(false);
    // On iOS the image picker cannot be presented while the sheet Modal is
    // still dismissing, so we defer the launch to the Modal's onDismiss.
    // Other platforms have no such restriction, so launch right away.
    if (Platform.OS !== "ios") {
      const s = pendingPhotoSource.current;
      pendingPhotoSource.current = null;
      if (s) void runPhotoPicker(s);
    }
  };

  // Pede permissão, abre câmera/galeria, faz upload da imagem e registra como
  // foto de perfil (que também alimenta o reconhecimento facial).
  const runPhotoPicker = async (source: "camera" | "gallery") => {
    if (!user) return;
    try {
      let perm;
      if (source === "camera") {
        perm = await ImagePicker.requestCameraPermissionsAsync();
      } else {
        perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }
      if (!perm.granted) {
        showToast(
          source === "camera"
            ? "Permissão da câmera negada. Ative em Ajustes › Expo Go › Câmera."
            : "Permissão da galeria negada. Ative em Ajustes › Expo Go › Fotos.",
        );
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      };
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      setPhotoBusy(true);
      const objectPath = await uploadImageToStorage(asset.uri, {
        name: asset.fileName ?? "perfil.jpg",
        contentType: asset.mimeType ?? "image/jpeg",
        size: asset.fileSize,
      });
      const res = await registerProfilePhoto({ userId: user.id, objectPath });
      setUser({ ...user, profilePhotoUrl: res.profilePhotoUrl });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(
        res.faceDetected
          ? "Foto de perfil atualizada! Rosto cadastrado."
          : "Foto salva, mas nenhum rosto foi detectado. Use uma foto nítida do seu rosto.",
      );
    } catch {
      showToast("Erro ao enviar a foto");
    } finally {
      setPhotoBusy(false);
    }
  };

  // Salva as edições do perfil via API e atualiza o usuário no contexto/cache.
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

  // Alterna o plano do aluno entre "Apenas Front" e "Front e Bollacha".
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

  // Atualiza a graduação do próprio mestre (faixa de Thai e/ou Jiu) via API.
  const handleMasterGrade = (data: { thaiGrade?: string; thaiGradeColor?: string; jiuGrade?: string; jiuGradeColor?: string; jiuDegree?: number }) => {
    if (!user) return;
    updateUserMutation.mutate(
      { id: user.id, data },
      {
        onSuccess: (updated) => {
          setUser(updated);
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast("Graduação atualizada!");
        },
        onError: () => showToast("Erro ao atualizar graduação"),
      }
    );
  };

  // Copia a chave PIX (e-mail) para a área de transferência.
  const copyPix = async () => {
    await Clipboard.setStringAsync("frontartesmarciais@gmail.com");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast("Chave PIX copiada!");
  };

  // Encerra a sessão (com feedback háptico) via AuthContext.
  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
  };

  // Guarda de autenticação: sem usuário logado, redireciona; enquanto carrega, nada.
  if (!user && !authLoading) return <Redirect href="/login" />;
  if (!user) return null;

  // Valores derivados para a renderização: paddings, iniciais do avatar, banner
  // de aniversário e graduações (do mestre via user, do aluno via studentData).
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;
  const initials = user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const isToday = isBirthdayToday(user.birthDate);
  const thaiGrade = isTeacherOrAdmin ? (user as any).thaiGrade : studentData?.thaiGrade;
  const jiuGrade = isTeacherOrAdmin ? (user as any).jiuGrade : studentData?.jiuGrade;
  const jiuGradeColor = isTeacherOrAdmin ? (user as any).jiuGradeColor : studentData?.jiuGradeColor;
  const jiuDegree = isTeacherOrAdmin ? (user as any).jiuDegree : studentData?.jiuDegree;
  const currentThaiEntry = PRAJIED_GRADES.find(p => p.label === thaiGrade || p.value === thaiGrade);
  const showGraduation = isTeacherOrAdmin || hasThai || hasJiu;

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
          <MenuButton />
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
            <View style={styles.avatarWrap}>
              <Pressable
                onPress={() => {
                  if (user.profilePhotoUrl) {
                    viewerOpenedAt.current = Date.now();
                    setViewerOpen(true);
                  } else {
                    setPhotoSheetOpen(true);
                  }
                }}
                disabled={photoBusy}
              >
                {user.profilePhotoUrl ? (
                  <AuthImage path={user.profilePhotoUrl} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }]}>
                    <Text style={[styles.initials, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>{initials}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                onPress={() => setPhotoSheetOpen(true)}
                disabled={photoBusy}
                hitSlop={8}
                accessibilityLabel="Alterar foto de perfil"
                style={[styles.avatarBadge, { backgroundColor: colors.primary, borderColor: colors.card }]}
              >
                {photoBusy
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="camera" size={14} color="#fff" />}
              </Pressable>
            </View>
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

          </View>
        )}

        {/* Minha Graduação — visível para todos (alunos e mestres) */}
        {showGraduation && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.gradHeader}>
              <Ionicons name="shield-outline" size={18} color={colors.primary} />
              <Text style={[styles.gradTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Minha Graduação</Text>
            </View>

            <View style={styles.gradGrid}>
              {(isTeacherOrAdmin || hasThai) && (
                <View style={[styles.gradBox, { backgroundColor: colors.background, borderColor: colors.thai + "40" }]}>
                  <Text style={[styles.gradModality, { color: colors.thai, fontFamily: "Inter_700Bold" }]}>MUAY THAI</Text>
                  {thaiGrade ? (
                    <>
                      <PrajiedStripe grade={thaiGrade} />
                      <Text style={[styles.gradValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                        {currentThaiEntry?.label ?? thaiGrade}
                      </Text>
                      <Text style={[styles.gradSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Prajied</Text>
                    </>
                  ) : (
                    <Text style={[styles.gradSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Não atribuído</Text>
                  )}
                  {isTeacherOrAdmin && (
                    <TouchableOpacity
                      style={[styles.gradEditBtn, { borderColor: colors.thai + "60" }]}
                      onPress={() => setThaiPickerOpen(true)}
                      disabled={updateUserMutation.isPending}
                    >
                      <Ionicons name="pencil-outline" size={12} color={colors.thai} />
                      <Text style={[styles.gradEditText, { color: colors.thai, fontFamily: "Inter_500Medium" }]}>Alterar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {(isTeacherOrAdmin || hasJiu) && (
                <View style={[styles.gradBox, { backgroundColor: colors.background, borderColor: colors.jiu + "40" }]}>
                  <Text style={[styles.gradModality, { color: colors.jiu, fontFamily: "Inter_700Bold" }]}>JIU-JITSU</Text>
                  {jiuGrade ? (
                    <>
                      {jiuGradeColor && <JiuBeltStripe color={jiuGradeColor} degree={jiuDegree} />}
                      <Text style={[styles.gradValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                        Faixa {jiuGrade}
                      </Text>
                      {(jiuDegree ?? 0) > 0 ? (
                        <Text style={[styles.gradSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{jiuDegree}º grau</Text>
                      ) : (
                        <Text style={[styles.gradSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Faixa</Text>
                      )}
                    </>
                  ) : (
                    <Text style={[styles.gradSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Não atribuída</Text>
                  )}
                  {isTeacherOrAdmin && (
                    <TouchableOpacity
                      style={[styles.gradEditBtn, { borderColor: colors.jiu + "60" }]}
                      onPress={() => { setJiuDegreeDraft(jiuDegree ?? 0); setJiuGradePickerOpen(true); }}
                      disabled={updateUserMutation.isPending}
                    >
                      <Ionicons name="pencil-outline" size={12} color={colors.jiu} />
                      <Text style={[styles.gradEditText, { color: colors.jiu, fontFamily: "Inter_500Medium" }]}>Alterar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
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

      {/* Picker prajied (Muay Thai) — mestre */}
      <Modal visible={thaiPickerOpen} transparent animationType="slide" onRequestClose={() => setThaiPickerOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setThaiPickerOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: botPad + 16 }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Prajied — Muay Thai</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {PRAJIED_GRADES.map((g) => {
                const selected = g.label === thaiGrade || g.value === thaiGrade;
                return (
                  <TouchableOpacity
                    key={g.value}
                    style={[styles.sheetRow, { borderColor: selected ? colors.thai : colors.border, backgroundColor: selected ? colors.thai + "15" : "transparent" }]}
                    onPress={() => {
                      handleMasterGrade({ thaiGrade: g.label, thaiGradeColor: g.primary });
                      setThaiPickerOpen(false);
                    }}
                  >
                    <PrajiedStripe grade={g.value} />
                    <Text style={[styles.sheetRowText, { color: colors.foreground, fontFamily: selected ? "Inter_700Bold" : "Inter_400Regular" }]}>{g.label}</Text>
                    {selected && <Ionicons name="checkmark-circle" size={18} color={colors.thai} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Picker faixa (Jiu-Jitsu) — mestre */}
      <Modal visible={jiuGradePickerOpen} transparent animationType="slide" onRequestClose={() => setJiuGradePickerOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setJiuGradePickerOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: botPad + 16 }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Faixa — Jiu-Jitsu</Text>
            <View style={styles.degreeRow}>
              <Text style={[styles.degreeLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Graus</Text>
              {[0, 1, 2, 3, 4].map((n) => {
                const sel = jiuDegreeDraft === n;
                return (
                  <TouchableOpacity
                    key={n}
                    style={[styles.degreeBtn, { borderColor: sel ? colors.jiu : colors.border, backgroundColor: sel ? colors.jiu + "20" : "transparent" }]}
                    onPress={() => setJiuDegreeDraft(n)}
                  >
                    <Text style={[styles.degreeBtnText, { color: sel ? colors.jiu : colors.mutedForeground, fontFamily: sel ? "Inter_700Bold" : "Inter_500Medium" }]}>{n}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {JIU_GRADES.map((label) => {
              const colorEntry = JIU_COLORS.find(c => c.label === label);
              const selected = label === jiuGrade;
              return (
                <TouchableOpacity
                  key={label}
                  style={[styles.sheetRow, { borderColor: selected ? colors.jiu : colors.border, backgroundColor: selected ? colors.jiu + "15" : "transparent" }]}
                  onPress={() => {
                    handleMasterGrade({ jiuGrade: label, jiuGradeColor: colorEntry?.value ?? "", jiuDegree: jiuDegreeDraft });
                    setJiuGradePickerOpen(false);
                  }}
                >
                  {colorEntry && <JiuBeltStripe color={colorEntry.value} degree={jiuDegreeDraft} />}
                  <Text style={[styles.sheetRowText, { color: colors.foreground, fontFamily: selected ? "Inter_700Bold" : "Inter_400Regular" }]}>{label}</Text>
                  {selected && <Ionicons name="checkmark-circle" size={18} color={colors.jiu} />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sheet de foto de perfil */}
      <Modal
        visible={photoSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPhotoSheetOpen(false)}
        onDismiss={() => {
          const s = pendingPhotoSource.current;
          pendingPhotoSource.current = null;
          if (s) void runPhotoPicker(s);
        }}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setPhotoSheetOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: botPad + 16 }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Foto de perfil</Text>
            <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Use uma foto nítida do seu rosto — ela é usada no reconhecimento facial da presença.
            </Text>
            <TouchableOpacity
              style={[styles.sheetRow, { borderColor: colors.border }]}
              onPress={() => {
                setPhotoSheetOpen(false);
                setEnrollOpen(true);
              }}
            >
              <Ionicons name="scan-outline" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetRowText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>Cadastrar rosto (vários ângulos)</Text>
                <Text style={[styles.sheetRowSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Recomendado — melhora o reconhecimento na presença</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetRow, { borderColor: colors.border }]}
              onPress={() => selectPhotoSource("camera")}
            >
              <Ionicons name="camera-outline" size={20} color={colors.primary} />
              <Text style={[styles.sheetRowText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>Tirar foto</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Cadastro facial guiado (vários ângulos) */}
      <FaceEnrollModal
        visible={enrollOpen}
        userId={user.id}
        title="Cadastrar meu rosto"
        onClose={() => setEnrollOpen(false)}
        onDone={(res) => {
          if (res.profilePhotoUrl) setUser({ ...user, profilePhotoUrl: res.profilePhotoUrl });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          showToast(res.message);
        }}
      />

      {/* Visualizador da foto de perfil em tela cheia */}
      <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <Pressable
          style={styles.viewerBackdrop}
          onPress={() => {
            if (Date.now() - viewerOpenedAt.current < 350) return;
            setViewerOpen(false);
          }}
        >
          {user.profilePhotoUrl && (
            <AuthImage path={user.profilePhotoUrl} style={styles.viewerImage} resizeMode="contain" />
          )}
          <Pressable
            style={[styles.viewerClose, { top: topPad + 12 }]}
            onPress={() => setViewerOpen(false)}
            hitSlop={10}
            accessibilityLabel="Fechar"
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// Linha simples de informação (ícone + rótulo + valor) usada no card de dados.
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
  viewerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "100%" },
  viewerClose: {
    position: "absolute", right: 16,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
  },
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
  avatarWrap: { position: "relative" },
  avatar: { width: 66, height: 66, borderRadius: 33 },
  avatarBadge: {
    position: "absolute", right: -2, bottom: -2,
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
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
  gradHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  gradTitle: { fontSize: 16, letterSpacing: 0.3 },
  gradGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gradBox: { flex: 1, minWidth: 140, borderRadius: 12, borderWidth: 1, padding: 14, gap: 8, alignItems: "flex-start" },
  gradModality: { fontSize: 11, letterSpacing: 1 },
  gradValue: { fontSize: 14 },
  gradSub: { fontSize: 11 },
  gradEditBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, marginTop: 2 },
  gradEditText: { fontSize: 12 },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 18, gap: 8 },
  sheetTitle: { fontSize: 16, marginBottom: 6 },
  sheetSubtitle: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 6 },
  sheetRowText: { fontSize: 14, flex: 1 },
  sheetRowSub: { fontSize: 11, marginTop: 2 },
  degreeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, marginTop: 2 },
  degreeLabel: { fontSize: 12 },
  degreeBtn: { width: 36, height: 36, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  degreeBtnText: { fontSize: 14 },

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

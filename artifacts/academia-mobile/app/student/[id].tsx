import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetStudent,
  useUpdateStudent,
  useListAttendance,
  getGetStudentQueryKey,
  getListStudentsQueryKey,
  getListAttendanceQueryKey,
  registerProfilePhoto,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { ModalityBadge } from "@/components/ModalityBadge";
import { uploadImageToStorage } from "@/lib/uploadImage";
import { AuthImage } from "@/components/AuthImage";

const logoThai = require("@/assets/images/logo-thai.png");
const logoJiu = require("@/assets/images/logo-jiu.png");

/* ─── Grade data ─────────────────────────────────────────────────────── */
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

const JIU_COLORS = [
  { value: "white",  label: "Branca",  hex: "#f5f5f5" },
  { value: "blue",   label: "Azul",    hex: "#2563eb" },
  { value: "purple", label: "Roxa",    hex: "#7c3aed" },
  { value: "brown",  label: "Marrom",  hex: "#92400e" },
  { value: "black",  label: "Preta",   hex: "#111827" },
];

const JIU_GRADES = ["Branca", "Azul", "Roxa", "Marrom", "Preta"];

/* ─── Visual components ──────────────────────────────────────────────── */
function PrajiedStripe({ thaiGrade }: { thaiGrade: string }) {
  const entry = PRAJIED_GRADES.find(
    p => p.label === thaiGrade || p.value === thaiGrade
  );
  if (!entry) return null;
  return (
    <View style={stripStyles.wrap}>
      <View style={[stripStyles.body, { backgroundColor: entry.primary, borderColor: entry.primary === "#f5f5f5" ? "#ccc" : "rgba(255,255,255,0.2)" }]}>
        {entry.secondary && (
          <View style={[stripStyles.tip, { backgroundColor: entry.secondary }]} />
        )}
      </View>
    </View>
  );
}
const stripStyles = StyleSheet.create({
  wrap: { flexDirection: "row" },
  body: { height: 14, width: 80, borderRadius: 7, borderWidth: 1, overflow: "hidden", flexDirection: "row" },
  tip: { width: 22, position: "absolute", right: 0, top: 0, bottom: 0 },
});

function BeltStripe({ color, degree }: { color: string; degree?: number | null }) {
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

/* ─── Main screen ────────────────────────────────────────────────────── */
export default function StudentDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const studentId = Number(id);
  const queryClient = useQueryClient();
  const isMaster = user?.role === "teacher" || user?.role === "admin";

  const [activeModality, setActiveModality] = useState<"thai" | "jiu">("thai");
  const [thaiPickerOpen, setThaiPickerOpen] = useState(false);
  const [jiuGradePickerOpen, setJiuGradePickerOpen] = useState(false);
  const [jiuColorPickerOpen, setJiuColorPickerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [faceUploading, setFaceUploading] = useState(false);

  const { data: student, isLoading } = useGetStudent(studentId, {
    query: { enabled: !!studentId, queryKey: getGetStudentQueryKey(studentId) },
  });

  const { data: attendance } = useListAttendance(
    { studentId, modality: activeModality },
    { query: { enabled: !!studentId, queryKey: getListAttendanceQueryKey({ studentId, modality: activeModality }) } }
  );

  const updateMutation = useUpdateStudent();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handlePickFace = async (source: "camera" | "gallery") => {
    try {
      const perm = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showToast("Permissão negada para câmera/galeria");
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      };
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      setFaceUploading(true);
      const objectPath = await uploadImageToStorage(asset.uri, {
        name: asset.fileName ?? "rosto.jpg",
        contentType: asset.mimeType ?? "image/jpeg",
        size: asset.fileSize,
      });
      const res = await registerProfilePhoto({ userId: studentId, objectPath });
      queryClient.invalidateQueries({ queryKey: getGetStudentQueryKey(studentId) });
      queryClient.invalidateQueries({ queryKey: getListStudentsQueryKey() });
      if (res.faceDetected) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast("Foto e rosto cadastrados com sucesso!");
      } else {
        showToast("Foto salva, mas nenhum rosto foi detectado");
      }
    } catch {
      showToast("Erro ao enviar a foto");
    } finally {
      setFaceUploading(false);
    }
  };

  const handleGradeUpdate = (field: string, value: string | number | null) => {
    updateMutation.mutate(
      { id: studentId, data: { [field]: value } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetStudentQueryKey(studentId) });
          queryClient.invalidateQueries({ queryKey: getListStudentsQueryKey() });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast("Graduação atualizada!");
        },
        onError: () => showToast("Erro ao atualizar graduação"),
      }
    );
  };

  const handleThaiPrajied = (grade: typeof PRAJIED_GRADES[number]) => {
    updateMutation.mutate(
      { id: studentId, data: { thaiGrade: grade.label, thaiGradeColor: grade.primary } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetStudentQueryKey(studentId) });
          queryClient.invalidateQueries({ queryKey: getListStudentsQueryKey() });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setThaiPickerOpen(false);
          showToast("Prajied atualizado!");
        },
        onError: () => showToast("Erro ao atualizar prajied"),
      }
    );
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Perfil do Aluno</Text>
          <View style={{ width: 24 }} />
        </View>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (!student) return null;

  const initials = student.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const showToggle = student.modalityThai && student.modalityJiu;
  const isBollacha = student.bollacha === true;
  const showJiuLogo = student.modalityJiu && isBollacha;
  const currentThaiGrade = PRAJIED_GRADES.find(p => p.label === student.thaiGrade || p.value === student.thaiGrade);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {toast && (
        <View style={[styles.toast, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.toastText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{toast}</Text>
        </View>
      )}

      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Perfil do Aluno</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: botPad + 24 }]}>
        {/* Avatar + identidade */}
        <View style={styles.avatarBlock}>
          {student.profilePhotoUrl ? (
            <AuthImage path={student.profilePhotoUrl} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }]}>
              <Text style={[styles.initials, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>{initials}</Text>
            </View>
          )}
          <Text style={[styles.name, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{student.name}</Text>
          <Text style={[styles.email, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{student.email}</Text>
          <View style={styles.badges}>
            {student.modalityThai && <ModalityBadge modality="thai" />}
            {student.modalityJiu && <ModalityBadge modality="jiu" />}
          </View>
          {/* Logos */}
          <View style={styles.logosRow}>
            {(student.modalityThai || student.modalityJiu) && (
              <Image source={logoThai} style={styles.logo} resizeMode="contain" />
            )}
            {showJiuLogo && (
              <Image source={logoJiu} style={styles.logo} resizeMode="contain" />
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {student.modalityThai && (
            <View style={[styles.statBox, { backgroundColor: "#3b0a0a", borderColor: colors.thai }]}>
              <Text style={[styles.statNum, { color: colors.thai, fontFamily: "Inter_700Bold" }]}>{student.totalAttendanceThai}</Text>
              <Text style={[styles.statLbl, { color: colors.thai, fontFamily: "Inter_400Regular" }]}>presenças Thai</Text>
            </View>
          )}
          {student.modalityJiu && (
            <View style={[styles.statBox, { backgroundColor: "#0a1a3b", borderColor: colors.jiu }]}>
              <Text style={[styles.statNum, { color: colors.jiu, fontFamily: "Inter_700Bold" }]}>{student.totalAttendanceJiu}</Text>
              <Text style={[styles.statLbl, { color: colors.jiu, fontFamily: "Inter_400Regular" }]}>presenças Jiu</Text>
            </View>
          )}
        </View>

        {/* Toggle modalidade */}
        {showToggle && (
          <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {(["thai", "jiu"] as const).map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.toggleTab, {
                  backgroundColor: activeModality === m
                    ? (m === "thai" ? colors.thai + "25" : colors.jiu + "25")
                    : "transparent",
                  borderColor: activeModality === m
                    ? (m === "thai" ? colors.thai : colors.jiu)
                    : "transparent",
                }]}
                onPress={() => setActiveModality(m)}
              >
                <Text style={[styles.toggleTabText, {
                  color: activeModality === m ? (m === "thai" ? colors.thai : colors.jiu) : colors.mutedForeground,
                  fontFamily: activeModality === m ? "Inter_700Bold" : "Inter_400Regular",
                }]}>
                  {m === "thai" ? "Muay Thai" : "Jiu-Jitsu"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ─── GRADUAÇÃO ─────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="shield-outline" size={18} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Graduação</Text>
          </View>

          {/* ── Muay Thai ── */}
          {(activeModality === "thai" || !showToggle) && student.modalityThai && (
            <View style={styles.gradeSection}>
              <Text style={[styles.gradeSectionLabel, { color: colors.thai, fontFamily: "Inter_700Bold" }]}>
                MUAY THAI — PRAJIED
              </Text>
              {currentThaiGrade && (
                <View style={styles.gradeVisualRow}>
                  <PrajiedStripe thaiGrade={student.thaiGrade ?? ""} />
                  <Text style={[styles.gradeCurrentText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    {student.thaiGrade}
                  </Text>
                </View>
              )}

              {isMaster ? (
                <TouchableOpacity
                  style={[styles.gradePickerBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={() => setThaiPickerOpen(true)}
                >
                  <Text style={[styles.gradePickerText, { color: student.thaiGrade ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {student.thaiGrade ?? "Selecionar prajied..."}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : (
                !student.thaiGrade && (
                  <Text style={[styles.noGrade, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Sem prajied registrado
                  </Text>
                )
              )}
            </View>
          )}

          {/* ── Jiu-Jitsu ── */}
          {(activeModality === "jiu" || !showToggle) && student.modalityJiu && (
            <View style={styles.gradeSection}>
              <Text style={[styles.gradeSectionLabel, { color: colors.jiu, fontFamily: "Inter_700Bold" }]}>
                JIU-JITSU — FAIXA
              </Text>
              {student.jiuGradeColor && (
                <View style={styles.gradeVisualRow}>
                  <BeltStripe color={student.jiuGradeColor} degree={student.jiuDegree} />
                  <Text style={[styles.gradeCurrentText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    {student.jiuGrade}{student.jiuDegree ? ` · ${student.jiuDegree}º grau` : ""}
                  </Text>
                </View>
              )}

              {isMaster ? (
                <View style={styles.jiuControls}>
                  {/* Faixa (nome) */}
                  <View style={styles.jiuControlField}>
                    <Text style={[styles.jiuControlLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Faixa</Text>
                    <TouchableOpacity
                      style={[styles.gradePickerBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                      onPress={() => setJiuGradePickerOpen(true)}
                    >
                      <Text style={[styles.gradePickerText, { color: student.jiuGrade ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        {student.jiuGrade ?? "Selecionar..."}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>

                  {/* Cor */}
                  <View style={styles.jiuControlField}>
                    <Text style={[styles.jiuControlLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Cor</Text>
                    <TouchableOpacity
                      style={[styles.gradePickerBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                      onPress={() => setJiuColorPickerOpen(true)}
                    >
                      {student.jiuGradeColor && (
                        <View style={[styles.colorDot, { backgroundColor: JIU_COLORS.find(c => c.value === student.jiuGradeColor)?.hex ?? "#555" }]} />
                      )}
                      <Text style={[styles.gradePickerText, { color: student.jiuGradeColor ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        {JIU_COLORS.find(c => c.value === student.jiuGradeColor)?.label ?? "Cor..."}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>

                  {/* Grau 0–4 */}
                  <View style={styles.jiuControlField}>
                    <Text style={[styles.jiuControlLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Grau</Text>
                    <View style={styles.degreeRow}>
                      {[0, 1, 2, 3, 4].map(grau => (
                        <TouchableOpacity
                          key={grau}
                          style={[styles.degreeBtn, {
                            backgroundColor: (student.jiuDegree ?? 0) === grau ? colors.jiu : colors.background,
                            borderColor: (student.jiuDegree ?? 0) === grau ? colors.jiu : colors.border,
                          }]}
                          onPress={() => handleGradeUpdate("jiuDegree", grau === 0 ? null : grau)}
                        >
                          <Text style={[styles.degreeBtnText, {
                            color: (student.jiuDegree ?? 0) === grau ? "#fff" : colors.mutedForeground,
                            fontFamily: "Inter_700Bold",
                          }]}>
                            {grau === 0 ? "—" : String(grau)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              ) : (
                !student.jiuGrade && (
                  <Text style={[styles.noGrade, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Sem faixa registrada
                  </Text>
                )
              )}

              {!isMaster && student.jiuGrade && !student.jiuGradeColor && (
                <Text style={[styles.gradeCurrentText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {student.jiuGrade}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* ─── HISTÓRICO DE PRESENÇAS ────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Histórico de Presenças
            </Text>
            {showToggle && (
              <View style={[styles.modalityTag, { backgroundColor: activeModality === "thai" ? colors.thai + "20" : colors.jiu + "20" }]}>
                <Text style={[styles.modalityTagText, { color: activeModality === "thai" ? colors.thai : colors.jiu, fontFamily: "Inter_700Bold" }]}>
                  {activeModality === "thai" ? "Thai" : "Jiu"}
                </Text>
              </View>
            )}
          </View>
          {attendance && attendance.length > 0 ? (
            attendance.map(rec => (
              <View key={rec.id} style={[styles.attendRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.attendDot, { backgroundColor: rec.faceRecognized ? colors.success : colors.border }]} />
                <Text style={[styles.attendDate, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  {new Date(rec.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </Text>
                {rec.faceRecognized && (
                  <Text style={[styles.attendRecog, { color: colors.success, fontFamily: "Inter_400Regular" }]}>Reconhecido</Text>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyAttend}>
              <Ionicons name="calendar-outline" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyAttendText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Nenhuma presença registrada
              </Text>
            </View>
          )}
        </View>

        {/* ─── ROSTO ────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="scan-outline" size={18} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Reconhecimento Facial
            </Text>
          </View>

          <View style={styles.faceRow}>
            <Ionicons
              name={student.hasFaceDescriptor ? "checkmark-circle" : "close-circle"}
              size={20}
              color={student.hasFaceDescriptor ? colors.success : colors.mutedForeground}
            />
            <Text style={[styles.faceText, { color: student.hasFaceDescriptor ? colors.success : colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {student.hasFaceDescriptor ? "Rosto cadastrado" : "Rosto não cadastrado"}
            </Text>
          </View>

          {isMaster && (
            faceUploading ? (
              <View style={[styles.faceBtn, {
                backgroundColor: colors.primary + "15",
                borderColor: colors.primary + "40",
                opacity: 0.7,
              }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.faceBtnText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                  Enviando...
                </Text>
              </View>
            ) : (
              <View style={styles.faceBtnRow}>
                <TouchableOpacity
                  style={[styles.faceBtn, {
                    backgroundColor: colors.primary + "15",
                    borderColor: colors.primary + "40",
                    flex: 1,
                  }]}
                  onPress={() => handlePickFace("camera")}
                >
                  <Ionicons name="camera-outline" size={16} color={colors.primary} />
                  <Text style={[styles.faceBtnText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                    Câmera
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.faceBtn, {
                    backgroundColor: colors.primary + "15",
                    borderColor: colors.primary + "40",
                    flex: 1,
                  }]}
                  onPress={() => handlePickFace("gallery")}
                >
                  <Ionicons name="images-outline" size={16} color={colors.primary} />
                  <Text style={[styles.faceBtnText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                    {student.hasFaceDescriptor ? "Atualizar" : "Galeria"}
                  </Text>
                </TouchableOpacity>
              </View>
            )
          )}

          {!isMaster && !student.hasFaceDescriptor && (
            <Text style={[styles.faceHint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Solicite ao professor o cadastro do seu rosto para usar o reconhecimento facial na presença.
            </Text>
          )}
        </View>
      </ScrollView>

      {/* ─── Modal: Prajied Thai ─────────────────────────── */}
      <Modal visible={thaiPickerOpen} transparent animationType="slide" onRequestClose={() => setThaiPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setThaiPickerOpen(false)} />
        <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: botPad + 16 }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Selecionar Prajied</Text>
          <ScrollView style={{ maxHeight: 400 }}>
            {PRAJIED_GRADES.map((grade, i) => {
              const selected = student.thaiGrade === grade.label || student.thaiGrade === grade.value;
              return (
                <TouchableOpacity
                  key={grade.value}
                  style={[styles.gradeItem, {
                    backgroundColor: selected ? colors.thai + "20" : "transparent",
                    borderBottomColor: colors.border,
                  }]}
                  onPress={() => handleThaiPrajied(grade)}
                  disabled={updateMutation.isPending}
                >
                  <Text style={[styles.gradeItemNum, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{i + 1}.</Text>
                  <View style={[styles.gradeItemSwatch, { backgroundColor: grade.primary, borderColor: grade.primary === "#f5f5f5" ? "#ccc" : "rgba(255,255,255,0.2)" }]}>
                    {grade.secondary && (
                      <View style={[styles.gradeItemSecondary, { backgroundColor: grade.secondary }]} />
                    )}
                  </View>
                  <Text style={[styles.gradeItemLabel, { color: selected ? colors.thai : colors.foreground, fontFamily: selected ? "Inter_700Bold" : "Inter_400Regular" }]}>
                    {grade.label}
                  </Text>
                  {selected && <Ionicons name="checkmark-circle" size={18} color={colors.thai} />}
                  {updateMutation.isPending && selected && <ActivityIndicator size="small" color={colors.thai} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Modal: Faixa Jiu ─────────────────────────────── */}
      <Modal visible={jiuGradePickerOpen} transparent animationType="slide" onRequestClose={() => setJiuGradePickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setJiuGradePickerOpen(false)} />
        <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: botPad + 16 }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Selecionar Faixa</Text>
          {JIU_GRADES.map(g => {
            const selected = student.jiuGrade === g;
            return (
              <TouchableOpacity
                key={g}
                style={[styles.gradeItem, {
                  backgroundColor: selected ? colors.jiu + "20" : "transparent",
                  borderBottomColor: colors.border,
                }]}
                onPress={() => { handleGradeUpdate("jiuGrade", g); setJiuGradePickerOpen(false); }}
              >
                <Text style={[styles.gradeItemLabel, { color: selected ? colors.jiu : colors.foreground, fontFamily: selected ? "Inter_700Bold" : "Inter_400Regular" }]}>
                  {g}
                </Text>
                {selected && <Ionicons name="checkmark-circle" size={18} color={colors.jiu} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>

      {/* ─── Modal: Cor da Faixa ──────────────────────────── */}
      <Modal visible={jiuColorPickerOpen} transparent animationType="slide" onRequestClose={() => setJiuColorPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setJiuColorPickerOpen(false)} />
        <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: botPad + 16 }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Cor da Faixa</Text>
          {JIU_COLORS.map(c => {
            const selected = student.jiuGradeColor === c.value;
            return (
              <TouchableOpacity
                key={c.value}
                style={[styles.gradeItem, {
                  backgroundColor: selected ? colors.jiu + "20" : "transparent",
                  borderBottomColor: colors.border,
                }]}
                onPress={() => { handleGradeUpdate("jiuGradeColor", c.value); setJiuColorPickerOpen(false); }}
              >
                <View style={[styles.colorDot, { backgroundColor: c.hex, borderColor: c.value === "white" ? "#ccc" : "rgba(255,255,255,0.2)" }]} />
                <Text style={[styles.gradeItemLabel, { color: selected ? colors.jiu : colors.foreground, fontFamily: selected ? "Inter_700Bold" : "Inter_400Regular" }]}>
                  {c.label}
                </Text>
                {selected && <Ionicons name="checkmark-circle" size={18} color={colors.jiu} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>
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
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17 },
  content: { padding: 20, gap: 16 },

  avatarBlock: { alignItems: "center", gap: 10 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  initials: { fontSize: 36 },
  name: { fontSize: 22 },
  email: { fontSize: 14 },
  badges: { flexDirection: "row", gap: 8 },
  logosRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  logo: { width: 80, height: 80 },

  statsRow: { flexDirection: "row", gap: 12 },
  statBox: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 16, alignItems: "center", gap: 4 },
  statNum: { fontSize: 32 },
  statLbl: { fontSize: 12 },

  toggleRow: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 3, gap: 2 },
  toggleTab: { flex: 1, borderRadius: 9, borderWidth: 1.5, paddingVertical: 8, alignItems: "center" },
  toggleTabText: { fontSize: 14 },

  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 14 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 16, flex: 1 },
  modalityTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  modalityTagText: { fontSize: 11 },

  gradeSection: { gap: 10, paddingTop: 4, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  gradeSectionLabel: { fontSize: 11, letterSpacing: 1 },
  gradeVisualRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  gradeCurrentText: { fontSize: 14 },
  noGrade: { fontSize: 13 },

  gradePickerBtn: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, padding: 12, gap: 8 },
  gradePickerText: { flex: 1, fontSize: 14 },

  jiuControls: { gap: 12 },
  jiuControlField: { gap: 4 },
  jiuControlLabel: { fontSize: 12 },
  colorDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1 },

  degreeRow: { flexDirection: "row", gap: 8 },
  degreeBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  degreeBtnText: { fontSize: 16 },

  attendRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1 },
  attendDot: { width: 8, height: 8, borderRadius: 4 },
  attendDate: { flex: 1, fontSize: 13 },
  attendRecog: { fontSize: 11 },
  emptyAttend: { alignItems: "center", gap: 10, paddingVertical: 24 },
  emptyAttendText: { fontSize: 13 },

  faceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  faceText: { fontSize: 14 },
  faceHint: { fontSize: 12, lineHeight: 17 },
  faceBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 10, borderWidth: 1, padding: 12,
  },
  faceBtnText: { fontSize: 14 },
  faceBtnRow: { flexDirection: "row", gap: 8 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 4 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#555", alignSelf: "center", marginBottom: 12 },
  modalTitle: { fontSize: 18, marginBottom: 8 },
  gradeItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1 },
  gradeItemNum: { fontSize: 12, width: 20 },
  gradeItemSwatch: { width: 32, height: 14, borderRadius: 7, borderWidth: 1, overflow: "hidden", flexDirection: "row" },
  gradeItemSecondary: { width: 10, position: "absolute", right: 0, top: 0, bottom: 0 },
  gradeItemLabel: { flex: 1, fontSize: 14 },
});

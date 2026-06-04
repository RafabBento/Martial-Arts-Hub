import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useListSessions,
  useListStudents,
  useListAttendance,
  useCreateAttendance,
  useCreateSession,
  useListUsers,
  getListAttendanceQueryKey,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";

type ModelStatus = "idle" | "loading" | "ready" | "error";
type ScanStatus = "idle" | "scanning" | "upscaling" | "detecting" | "found" | "notfound";
type AttendMode = "face" | "gallery" | "manual";

interface IdentifyMatch {
  studentId: number;
  name: string;
  profilePhotoUrl: string | null;
  distance: number;
  matched: boolean;
}

const MODEL_BASE = "https://vladmandic.github.io/face-api/model";

function apiBaseUrl() {
  return process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
}

async function loadFaceApi() {
  const faceapi = await import("face-api.js");
  if (!faceapi.nets.ssdMobilenetv1.isLoaded) {
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_BASE);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_BASE);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_BASE);
  }
  return faceapi;
}

// Divide o canvas em tiles cols×rows com sobreposição e detecta rostos em cada
// tile independentemente, melhorando a detecção de rostos pequenos no fundo.
async function detectInTiles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  faceapi: any,
  canvas: HTMLCanvasElement,
  onProgress: (tile: number, total: number) => void,
  opts: { cols?: number; rows?: number; overlap?: number; minConfidence?: number } = {}
): Promise<Array<{ descriptor: Float32Array }>> {
  const { cols = 2, rows = 2, overlap = 0.15, minConfidence = 0.3 } = opts;
  const W = canvas.width;
  const H = canvas.height;
  const tileW = Math.ceil(W / cols);
  const tileH = Math.ceil(H / rows);
  const overlapPx_x = Math.ceil(tileW * overlap);
  const overlapPx_y = Math.ceil(tileH * overlap);
  const allDescriptors: Array<{ descriptor: Float32Array }> = [];
  const total = cols * rows;
  let idx = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = Math.max(0, col * tileW - overlapPx_x);
      const sy = Math.max(0, row * tileH - overlapPx_y);
      const sw = Math.min(W - sx, tileW + overlapPx_x * 2);
      const sh = Math.min(H - sy, tileH + overlapPx_y * 2);
      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = sw;
      tileCanvas.height = sh;
      tileCanvas.getContext("2d")!.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      const detections = await faceapi
        .detectAllFaces(tileCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence }))
        .withFaceLandmarks()
        .withFaceDescriptors();
      allDescriptors.push(...detections);
      idx++;
      onProgress(idx, total);
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  return allDescriptors;
}

// Remove descritores muito próximos entre si (mesmo rosto detectado em dois tiles).
function deduplicateDescriptors(
  descriptors: Array<{ descriptor: Float32Array }>,
  threshold = 0.35
): Float32Array[] {
  const kept: Float32Array[] = [];
  for (const { descriptor } of descriptors) {
    const isDup = kept.some((k) => {
      let sum = 0;
      for (let i = 0; i < k.length; i++) sum += (k[i] - descriptor[i]) ** 2;
      return Math.sqrt(sum) < threshold;
    });
    if (!isDup) kept.push(descriptor);
  }
  return kept;
}

const WEEKLY_SCHEDULE = [
  { days: [1, 2, 3, 4, 5], hour: 19, minute: 0, modality: "jiu" as const, instructorKey: "Ewerton" },
  { days: [1, 3, 5], hour: 20, minute: 30, modality: "thai" as const, instructorKey: "Ewerton" },
  { days: [2, 4], hour: 20, minute: 30, modality: "thai" as const, instructorKey: "Luis" },
  { days: [6], hour: 10, minute: 30, modality: "thai" as const, instructorKey: "Nilberto" },
];

function detectCurrentClass(now = new Date()) {
  const day = now.getDay();
  const total = now.getHours() * 60 + now.getMinutes();
  for (const entry of WEEKLY_SCHEDULE) {
    if (entry.days.includes(day)) {
      const start = entry.hour * 60 + entry.minute;
      if (total >= start - 30 && total <= start + 90) return entry;
    }
  }
  return null;
}

function isToday(date: Date) {
  const t = new Date();
  return (
    date.getFullYear() === t.getFullYear() &&
    date.getMonth() === t.getMonth() &&
    date.getDate() === t.getDate()
  );
}

function fmtTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export default function AttendanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [autoCreating, setAutoCreating] = useState(false);
  const [confirmedIds, setConfirmedIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const isWeb = Platform.OS === "web";
  const [mode, setMode] = useState<AttendMode>(isWeb ? "gallery" : "manual");
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [cameraOn, setCameraOn] = useState(false);
  const [matches, setMatches] = useState<IdentifyMatch[]>([]);
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [galleryScanning, setGalleryScanning] = useState(false);
  const [galleryPreviewUrl, setGalleryPreviewUrl] = useState<string | null>(null);
  const [tileProgress, setTileProgress] = useState<{ current: number; total: number } | null>(null);
  const [registeringAll, setRegisteringAll] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videoRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faceApiRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const galleryInputRef = useRef<any>(null);

  const isMaster = user?.role === "teacher" || user?.role === "admin";

  const { data: sessions, isLoading: sessionsLoading, refetch: refetchSessions } = useListSessions({});
  const { data: students } = useListStudents({});
  const { data: teachers } = useListUsers({ role: "teacher" });
  const { data: attendance, refetch: refetchAttendance } = useListAttendance(
    { sessionId: selectedSessionId ?? undefined },
    { query: { enabled: !!selectedSessionId, queryKey: getListAttendanceQueryKey({ sessionId: selectedSessionId ?? undefined }) } }
  );

  const createAttMutation = useCreateAttendance();
  const createSessionMutation = useCreateSession();

  const currentClass = detectCurrentClass();
  const currentTeacher = currentClass && teachers
    ? teachers.find(t => t.name.toLowerCase().includes(currentClass.instructorKey.toLowerCase()))
    : null;
  const todaySession = currentClass && sessions
    ? sessions.find(s => s.modality === currentClass.modality && isToday(new Date(s.sessionDate)))
    : null;

  const selectedSession = sessions?.find(s => s.id === selectedSessionId);
  const attendedIds = useMemo(() => new Set(attendance?.map(a => a.studentId) ?? []), [attendance]);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleAutoSession = async () => {
    if (!currentClass) return;
    if (todaySession) {
      setSelectedSessionId(todaySession.id);
      showToast("Sessão de hoje selecionada!");
      return;
    }
    if (!currentTeacher) {
      showToast("Instrutor não encontrado no sistema.", "err");
      return;
    }
    setAutoCreating(true);
    const now = new Date();
    const sessionDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), currentClass.hour, currentClass.minute, 0);
    createSessionMutation.mutate(
      { data: { modality: currentClass.modality, sessionDate: sessionDate.toISOString(), teacherId: currentTeacher.id } },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          refetchSessions();
          setSelectedSessionId(created.id);
          showToast("Sessão criada e selecionada!");
          setAutoCreating(false);
        },
        onError: () => { showToast("Erro ao criar sessão", "err"); setAutoCreating(false); },
      }
    );
  };

  const confirmAttendance = (studentId: number, faceRecognized = false) => {
    if (!selectedSessionId) { showToast("Selecione uma sessão primeiro", "err"); return; }
    if (attendedIds.has(studentId) || confirmedIds.has(studentId)) {
      showToast("Presença já registrada"); return;
    }
    createAttMutation.mutate(
      { data: { sessionId: selectedSessionId, studentId, faceRecognized } },
      {
        onSuccess: () => {
          setConfirmedIds(prev => new Set([...prev, studentId]));
          queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey({ sessionId: selectedSessionId }) });
          refetchAttendance();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast("Presença confirmada!");
          setStudentPickerOpen(false);
          if (faceRecognized && mode === "face" && cameraOn) {
            setMatches([]);
            setScanStatus("idle");
            startContinuousScan();
          }
        },
        onError: () => showToast("Erro ao registrar presença", "err"),
      }
    );
  };

  // ---------------- Reconhecimento facial (somente web) ----------------
  const loadModels = useCallback(async () => {
    if (modelStatus === "ready" || modelStatus === "loading") return;
    setModelStatus("loading");
    try {
      faceApiRef.current = await loadFaceApi();
      setModelStatus("ready");
    } catch {
      setModelStatus("error");
      showToast("Erro ao carregar modelos de rosto", "err");
    }
  }, [modelStatus]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setScanStatus("idle");
    setMatches([]);
  }, []);

  const startCamera = useCallback(async () => {
    await loadModels();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      showToast("Não foi possível acessar a câmera", "err");
    }
  }, [loadModels]);

  const scanFaces = useCallback(async () => {
    const faceapi = faceApiRef.current;
    if (!faceapi || !videoRef.current) return;
    if (scanStatus === "scanning") return;
    setScanStatus("scanning");
    try {
      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
      if (detections.length === 0) { setScanStatus("idle"); return; }
      const descriptors = detections.map((d: { descriptor: Float32Array }) => Array.from(d.descriptor));
      const resp = await fetch(`${apiBaseUrl()}/api/face/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ descriptors }),
      });
      if (!resp.ok) throw new Error("Identify failed");
      const result: IdentifyMatch[] = await resp.json();
      const found = result.filter((r) => r.matched);
      if (found.length > 0) {
        setMatches(found);
        setScanStatus("found");
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      } else {
        setScanStatus("notfound");
        setTimeout(() => setScanStatus("idle"), 2000);
      }
    } catch {
      setScanStatus("idle");
    }
  }, [scanStatus]);

  const startContinuousScan = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(scanFaces, 3000);
  }, [scanFaces]);

  const stopContinuousScan = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setScanStatus("idle");
    setMatches([]);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleGalleryScan = async (e: any) => {
    const file: File | undefined = e.target.files?.[0];
    if (!file) return;
    if (!selectedSessionId) { showToast("Selecione uma sessão primeiro", "err"); return; }
    setGalleryScanning(true);
    setMatches([]);
    setUnmatchedCount(0);
    setScanStatus("scanning");
    const previewUrl = URL.createObjectURL(file);
    setGalleryPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return previewUrl; });
    try {
      if (!faceApiRef.current) faceApiRef.current = await loadFaceApi();
      const faceapi = faceApiRef.current;
      const img = await createImageBitmap(file);
      setScanStatus("upscaling");
      const MAX_SIDE = 6400;
      const SCALE = 2;
      const scaledW = Math.min(img.width * SCALE, MAX_SIDE);
      const scaledH = Math.round(img.height * (scaledW / img.width));
      const canvas = document.createElement("canvas");
      canvas.width = scaledW;
      canvas.height = scaledH;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, scaledW, scaledH);
      await new Promise((r) => setTimeout(r, 50));
      setScanStatus("detecting");
      setTileProgress({ current: 0, total: 4 });
      const rawDetections = await detectInTiles(faceapi, canvas, (current, total) => {
        setTileProgress({ current, total });
      }, { cols: 2, rows: 2, overlap: 0.15, minConfidence: 0.3 });
      const uniqueDescriptors = deduplicateDescriptors(rawDetections, 0.35);
      setTileProgress(null);
      if (uniqueDescriptors.length === 0) {
        setScanStatus("notfound");
        showToast("Nenhum rosto detectado na foto", "err");
        setTimeout(() => setScanStatus("idle"), 2000);
        return;
      }
      const descriptors = uniqueDescriptors.map((d) => Array.from(d));
      const resp = await fetch(`${apiBaseUrl()}/api/face/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ descriptors }),
      });
      if (!resp.ok) throw new Error("Identify failed");
      const result: IdentifyMatch[] = await resp.json();
      const matchMap = new Map<number, IdentifyMatch>();
      for (const r of result) {
        if (!r.matched) continue;
        const existing = matchMap.get(r.studentId);
        if (!existing || r.distance < existing.distance) matchMap.set(r.studentId, r);
      }
      const found = Array.from(matchMap.values());
      const unmatched = descriptors.length - result.filter((r) => r.matched).length;
      setUnmatchedCount(Math.max(0, unmatched));
      if (found.length > 0) {
        setMatches(found);
        setScanStatus("found");
      } else {
        setScanStatus("notfound");
        showToast("Nenhum aluno identificado na foto", "err");
        setTimeout(() => setScanStatus("idle"), 2000);
      }
    } catch {
      setScanStatus("idle");
      showToast("Erro ao processar a foto", "err");
    } finally {
      setGalleryScanning(false);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const handleRegisterAll = async () => {
    if (!selectedSessionId) return;
    const toRegister = matches.filter((m) => !attendedIds.has(m.studentId) && !confirmedIds.has(m.studentId));
    if (toRegister.length === 0) { showToast("Todos já estão registrados!"); return; }
    setRegisteringAll(true);
    let count = 0;
    for (const m of toRegister) {
      await new Promise<void>((resolve) => {
        createAttMutation.mutate(
          { data: { sessionId: selectedSessionId, studentId: m.studentId, faceRecognized: true } },
          {
            onSuccess: () => { setConfirmedIds((prev) => new Set([...prev, m.studentId])); count++; resolve(); },
            onError: () => resolve(),
          }
        );
      });
    }
    await queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey({ sessionId: selectedSessionId }) });
    refetchAttendance();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast(`${count} presença${count !== 1 ? "s" : ""} registrada${count !== 1 ? "s" : ""}!`);
    setRegisteringAll(false);
  };

  const switchMode = (next: AttendMode) => {
    if (next === mode) return;
    stopCamera();
    setMatches([]);
    setScanStatus("idle");
    setMode(next);
  };

  const galleryPreviewRef = useRef<string | null>(null);
  useEffect(() => { galleryPreviewRef.current = galleryPreviewUrl; }, [galleryPreviewUrl]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (galleryPreviewRef.current) URL.revokeObjectURL(galleryPreviewRef.current);
    };
  }, [stopCamera]);

  const filteredStudents = useMemo(() => {
    if (!students) return [];
    return students.filter(s =>
      !attendedIds.has(s.userId) && !confirmedIds.has(s.userId) &&
      (studentSearch === "" || s.name.toLowerCase().includes(studentSearch.toLowerCase()))
    );
  }, [students, attendedIds, confirmedIds, studentSearch]);

  if (!user && !authLoading) return <Redirect href="/login" />;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (!isMaster) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Presença</Text>
        </View>
        <View style={styles.restricted}>
          <View style={[styles.restrictedIcon, { backgroundColor: colors.primary + "18" }]}>
            <Ionicons name="shield-outline" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.restrictedTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Acesso Restrito
          </Text>
          <Text style={[styles.restrictedSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            O controle de presenças é exclusivo para professores e administradores.
          </Text>
          <TouchableOpacity
            style={[styles.backBtn2, { borderColor: colors.border }]}
            onPress={() => router.push("/(tabs)")}
          >
            <Text style={[styles.backBtn2Text, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              Voltar ao Painel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Toast */}
      {toast && (
        <View style={[styles.toastWrap, { backgroundColor: toast.type === "ok" ? "#166534" : "#7f1d1d" }]}>
          <Ionicons name={toast.type === "ok" ? "checkmark-circle" : "alert-circle"} size={16} color="#fff" />
          <Text style={[styles.toastText, { fontFamily: "Inter_500Medium" }]}>{toast.msg}</Text>
        </View>
      )}

      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Presença</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Controle de presenças
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: botPad + 24 }]}
        refreshControl={<RefreshControl refreshing={sessionsLoading} onRefresh={refetchSessions} tintColor={colors.primary} />}
      >
        {/* Banner inteligente */}
        {currentClass ? (
          <View style={[styles.banner, {
            backgroundColor: todaySession ? "rgba(34,197,94,0.1)" : colors.primary + "18",
            borderColor: todaySession ? "rgba(34,197,94,0.3)" : colors.primary + "50",
          }]}>
            <View style={[styles.bannerIcon, {
              backgroundColor: todaySession ? "rgba(34,197,94,0.2)" : colors.primary + "30",
            }]}>
              <Ionicons
                name={todaySession ? "calendar-outline" : "time-outline"}
                size={20}
                color={todaySession ? "#4ade80" : colors.primary}
              />
            </View>
            <View style={styles.bannerInfo}>
              <Text style={[styles.bannerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {currentClass.modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"} — {fmtTime(currentClass.hour, currentClass.minute)}
              </Text>
              <Text style={[styles.bannerSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {currentTeacher ? currentTeacher.name : `Instrutor: ${currentClass.instructorKey}`}
                {todaySession ? " · Sessão aberta" : " · Nenhuma sessão hoje"}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.bannerBtn, { backgroundColor: todaySession ? "transparent" : colors.primary, borderColor: todaySession ? colors.border : colors.primary }]}
              onPress={handleAutoSession}
              disabled={autoCreating}
            >
              {autoCreating
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[styles.bannerBtnText, { color: todaySession ? colors.mutedForeground : "#fff", fontFamily: "Inter_600SemiBold" }]}>
                    {todaySession ? "Selecionar" : "Abrir aula"}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.noBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
            <Text style={[styles.noBannerText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Nenhuma aula no cronograma para este horário
            </Text>
          </View>
        )}

        {/* Seletor de sessão */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            SESSÃO DE TREINO
          </Text>
          <TouchableOpacity
            style={[styles.sessionPicker, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => setSessionPickerOpen(true)}
          >
            <Ionicons name="barbell-outline" size={18} color={colors.mutedForeground} />
            <Text
              style={[styles.sessionPickerText, { color: selectedSession ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
              numberOfLines={1}
            >
              {selectedSession
                ? `${selectedSession.modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"} — ${new Date(selectedSession.sessionDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · Prof. ${selectedSession.teacherName}`
                : "Selecionar sessão de treino..."
              }
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Seletor de modo */}
        <View style={styles.modeRow}>
          {isWeb && (
            <TouchableOpacity
              style={[styles.modeBtn, { borderColor: mode === "face" ? colors.primary : colors.border, backgroundColor: mode === "face" ? colors.primary : "transparent" }]}
              onPress={() => switchMode("face")}
            >
              <Ionicons name="scan-outline" size={16} color={mode === "face" ? "#fff" : colors.mutedForeground} />
              <Text style={[styles.modeBtnText, { color: mode === "face" ? "#fff" : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>Câmera</Text>
            </TouchableOpacity>
          )}
          {isWeb && (
            <TouchableOpacity
              style={[styles.modeBtn, { borderColor: mode === "gallery" ? colors.primary : colors.border, backgroundColor: mode === "gallery" ? colors.primary : "transparent" }]}
              onPress={() => switchMode("gallery")}
            >
              <Ionicons name="images-outline" size={16} color={mode === "gallery" ? "#fff" : colors.mutedForeground} />
              <Text style={[styles.modeBtnText, { color: mode === "gallery" ? "#fff" : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>Galeria</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.modeBtn, { borderColor: mode === "manual" ? colors.primary : colors.border, backgroundColor: mode === "manual" ? colors.primary : "transparent" }]}
            onPress={() => switchMode("manual")}
          >
            <Ionicons name="people-outline" size={16} color={mode === "manual" ? "#fff" : colors.mutedForeground} />
            <Text style={[styles.modeBtnText, { color: mode === "manual" ? "#fff" : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>Manual</Text>
          </TouchableOpacity>
        </View>

        {/* Aviso nativo: reconhecimento só na web */}
        {!isWeb && (
          <View style={[styles.noBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.mutedForeground} />
            <Text style={[styles.noBannerText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular", flex: 1 }]}>
              O reconhecimento facial (câmera e foto) está disponível na versão web. Aqui use o registro manual.
            </Text>
          </View>
        )}

        {/* Modo CÂMERA (web) */}
        {isWeb && mode === "face" && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: "hidden" }]}>
            <View style={styles.cameraBox}>
              <video
                ref={videoRef}
                muted
                playsInline
                style={{ width: "100%", height: "100%", objectFit: "cover", display: cameraOn ? "block" : "none" }}
              />
              <canvas ref={canvasRef} style={{ display: "none" }} />
              {!cameraOn && (
                <View style={styles.cameraOff}>
                  <Ionicons name="camera-outline" size={44} color={colors.mutedForeground} />
                  <Text style={[styles.cameraOffText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Câmera desligada</Text>
                </View>
              )}
              {cameraOn && (
                <View
                  pointerEvents="none"
                  style={[styles.cameraBorder, {
                    borderColor: scanStatus === "found" ? "#4ade80"
                      : scanStatus === "notfound" ? "rgba(239,68,68,0.6)"
                      : scanStatus === "scanning" ? colors.primary + "99"
                      : "transparent",
                  }]}
                />
              )}
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              {modelStatus === "loading" && (
                <View style={styles.inlineRow}>
                  <ActivityIndicator size="small" color={colors.mutedForeground} />
                  <Text style={[styles.inlineText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Carregando modelos de reconhecimento...</Text>
                </View>
              )}
              {modelStatus === "error" && (
                <View style={styles.inlineRow}>
                  <Ionicons name="close-circle" size={14} color={colors.primary} />
                  <Text style={[styles.inlineText, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>Falha ao carregar modelos</Text>
                </View>
              )}
              <View style={styles.cameraBtns}>
                {!cameraOn ? (
                  <TouchableOpacity
                    style={[styles.addStudentBtn, { backgroundColor: colors.primary, flex: 1 }]}
                    onPress={startCamera}
                    disabled={modelStatus === "loading"}
                  >
                    {modelStatus === "loading"
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <><Ionicons name="camera-outline" size={18} color="#fff" /><Text style={[styles.addStudentText, { fontFamily: "Inter_600SemiBold" }]}>Ligar Câmera</Text></>}
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.outlineBtn, { borderColor: colors.border }]}
                      onPress={stopCamera}
                    >
                      <Text style={[styles.outlineBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Desligar</Text>
                    </TouchableOpacity>
                    {!intervalRef.current ? (
                      <TouchableOpacity
                        style={[styles.addStudentBtn, { backgroundColor: colors.primary, flex: 1 }]}
                        onPress={() => { startContinuousScan(); scanFaces(); }}
                        disabled={!selectedSessionId}
                      >
                        <Ionicons name="flash-outline" size={18} color="#fff" />
                        <Text style={[styles.addStudentText, { fontFamily: "Inter_600SemiBold" }]}>Iniciar Varredura</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.outlineBtn, { borderColor: colors.border, flex: 1 }]}
                        onPress={stopContinuousScan}
                      >
                        <Text style={[styles.outlineBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Parar Varredura</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
              {scanStatus === "scanning" && (
                <View style={styles.inlineRow}>
                  <ActivityIndicator size="small" color={colors.mutedForeground} />
                  <Text style={[styles.inlineText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Analisando rosto...</Text>
                </View>
              )}
              {scanStatus === "notfound" && (
                <View style={styles.inlineRow}>
                  <Ionicons name="close-circle" size={14} color="#f87171" />
                  <Text style={[styles.inlineText, { color: "#f87171", fontFamily: "Inter_400Regular" }]}>Rosto não identificado na base</Text>
                </View>
              )}
              {!selectedSessionId && (
                <Text style={[styles.warnText, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>⚠ Selecione uma sessão antes de escanear</Text>
              )}
            </View>
          </View>
        )}

        {/* Modo GALERIA (web) */}
        {isWeb && mode === "gallery" && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: "hidden" }]}>
            {galleryPreviewUrl && (
              <View style={styles.galleryPreviewWrap}>
                <Image source={{ uri: galleryPreviewUrl }} style={styles.galleryPreview} resizeMode="cover" />
                {galleryScanning && (
                  <View style={styles.galleryOverlay}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.galleryOverlayText, { fontFamily: "Inter_600SemiBold" }]}>
                      {scanStatus === "upscaling"
                        ? "Ampliando imagem…"
                        : scanStatus === "detecting" && tileProgress
                        ? `Varrendo região ${tileProgress.current} de ${tileProgress.total}…`
                        : "Analisando…"}
                    </Text>
                  </View>
                )}
                {matches.length > 0 && !galleryScanning && (
                  <View style={styles.galleryBadge}>
                    <Ionicons name="checkmark-circle" size={13} color="#4ade80" />
                    <Text style={[styles.galleryBadgeText, { fontFamily: "Inter_600SemiBold" }]}>
                      {matches.length} identificado{matches.length !== 1 ? "s" : ""}{unmatchedCount > 0 ? ` · ${unmatchedCount} não reconh.` : ""}
                    </Text>
                  </View>
                )}
              </View>
            )}
            <View style={{ padding: 16, gap: 12 }}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>FOTO PÓS-TREINO</Text>
              <Text style={[styles.galleryHint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Envie a foto do grupo para registrar as presenças automaticamente.
              </Text>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={handleGalleryScan}
              />
              <TouchableOpacity
                style={[styles.addStudentBtn, { backgroundColor: colors.primary, opacity: galleryScanning || !selectedSessionId ? 0.6 : 1 }]}
                onPress={() => galleryInputRef.current?.click()}
                disabled={galleryScanning || !selectedSessionId}
              >
                {galleryScanning
                  ? <><ActivityIndicator size="small" color="#fff" /><Text style={[styles.addStudentText, { fontFamily: "Inter_600SemiBold" }]}>Analisando foto...</Text></>
                  : <><Ionicons name="image-outline" size={18} color="#fff" /><Text style={[styles.addStudentText, { fontFamily: "Inter_600SemiBold" }]}>{galleryPreviewUrl ? "Trocar foto" : "Enviar foto do grupo"}</Text></>}
              </TouchableOpacity>
              {!selectedSessionId && (
                <Text style={[styles.warnText, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>⚠ Selecione uma sessão antes de enviar a foto</Text>
              )}
              {scanStatus === "notfound" && !galleryScanning && (
                <View style={styles.inlineRow}>
                  <Ionicons name="close-circle" size={14} color="#f87171" />
                  <Text style={[styles.inlineText, { color: "#f87171", fontFamily: "Inter_400Regular", flex: 1 }]}>Nenhum aluno identificado — verifique se os rostos estão cadastrados.</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Rostos identificados (câmera/galeria) */}
        {isWeb && mode !== "manual" && matches.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.inlineRow}>
              <Ionicons name="checkmark-circle" size={16} color="#4ade80" />
              <Text style={[styles.cardLabel, { color: "#4ade80", fontFamily: "Inter_700Bold" }]}>
                {matches.length} ROSTO{matches.length !== 1 ? "S" : ""} IDENTIFICADO{matches.length !== 1 ? "S" : ""}
              </Text>
            </View>
            {matches.some(m => !attendedIds.has(m.studentId) && !confirmedIds.has(m.studentId)) && (
              <TouchableOpacity
                style={[styles.addStudentBtn, { backgroundColor: colors.primary, opacity: registeringAll ? 0.6 : 1 }]}
                onPress={handleRegisterAll}
                disabled={registeringAll}
              >
                {registeringAll
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Ionicons name="checkmark-done-outline" size={18} color="#fff" /><Text style={[styles.addStudentText, { fontFamily: "Inter_600SemiBold" }]}>
                      Registrar {matches.filter(m => !attendedIds.has(m.studentId) && !confirmedIds.has(m.studentId)).length} presença{matches.filter(m => !attendedIds.has(m.studentId) && !confirmedIds.has(m.studentId)).length !== 1 ? "s" : ""}
                    </Text></>}
              </TouchableOpacity>
            )}
            {matches.map((m) => {
              const alreadyIn = attendedIds.has(m.studentId) || confirmedIds.has(m.studentId);
              const initials = m.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
              return (
                <View key={m.studentId} style={[styles.attendRow, { borderBottomColor: colors.border }]}>
                  {m.profilePhotoUrl
                    ? <Image source={{ uri: m.profilePhotoUrl }} style={styles.attendAvatar} />
                    : <View style={[styles.attendAvatar, { backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }]}>
                        <Text style={[styles.attendInitials, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>{initials}</Text>
                      </View>}
                  <View style={styles.attendInfo}>
                    <Text style={[styles.attendName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{m.name}</Text>
                    <Text style={[styles.attendTime, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      Confiança: {((1 - m.distance) * 100).toFixed(0)}%
                    </Text>
                  </View>
                  {alreadyIn ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  ) : (
                    <TouchableOpacity
                      style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                      onPress={() => confirmAttendance(m.studentId, true)}
                      disabled={createAttMutation.isPending}
                    >
                      <Ionicons name="person-add-outline" size={14} color="#fff" />
                      <Text style={[styles.confirmBtnText, { fontFamily: "Inter_600SemiBold" }]}>Confirmar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Registrar presença manual */}
        {selectedSessionId && mode === "manual" && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              REGISTRAR PRESENÇA
            </Text>
            <TouchableOpacity
              style={[styles.addStudentBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setStudentSearch(""); setStudentPickerOpen(true); }}
              activeOpacity={0.85}
            >
              <Ionicons name="person-add-outline" size={18} color="#fff" />
              <Text style={[styles.addStudentText, { fontFamily: "Inter_600SemiBold" }]}>
                Adicionar Aluno Manualmente
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Lista de presentes */}
        {selectedSessionId && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.attendListHeader}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                PRESENTES NA SESSÃO
              </Text>
              <View style={[styles.countBadge, { backgroundColor: colors.primary + "22" }]}>
                <Text style={[styles.countText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                  {(attendance?.length ?? 0)}
                </Text>
              </View>
            </View>
            {attendance && attendance.length > 0 ? (
              attendance.map((att) => {
                const student = students?.find(s => s.userId === att.studentId);
                const initials = (student?.name ?? att.studentName ?? "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
                return (
                  <View
                    key={att.id}
                    style={[styles.attendRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={[styles.attendAvatar, { backgroundColor: colors.primary + "22" }]}>
                      <Text style={[styles.attendInitials, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                        {initials}
                      </Text>
                    </View>
                    <View style={styles.attendInfo}>
                      <Text style={[styles.attendName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                        {student?.name ?? att.studentName ?? "Aluno"}
                      </Text>
                      <Text style={[styles.attendTime, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        {att.faceRecognized ? "Reconhecimento facial" : "Registro manual"}
                        {att.createdAt ? ` · ${new Date(att.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                      </Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyAttend}>
                <Ionicons name="people-outline" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyAttendText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Nenhuma presença registrada
                </Text>
              </View>
            )}
          </View>
        )}

        {!selectedSessionId && (
          <View style={styles.noSessionHint}>
            <Ionicons name="finger-print-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.noSessionText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Selecione ou crie uma sessão para registrar presenças
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Modal: seletor de sessão */}
      <Modal visible={sessionPickerOpen} transparent animationType="slide" onRequestClose={() => setSessionPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSessionPickerOpen(false)} />
        <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: botPad + 16 }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Selecionar Sessão
          </Text>
          <ScrollView style={{ maxHeight: 400 }}>
            {sessions?.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.sessionItem, {
                  backgroundColor: selectedSessionId === s.id ? colors.primary + "20" : "transparent",
                  borderColor: selectedSessionId === s.id ? colors.primary + "60" : colors.border,
                }]}
                onPress={() => { setSelectedSessionId(s.id); setSessionPickerOpen(false); }}
              >
                <View style={[styles.sessionItemBadge, { backgroundColor: s.modality === "thai" ? "#7f1d1d" : "#1a2744" }]}>
                  <Text style={[styles.sessionItemBadgeText, { fontFamily: "Inter_700Bold", color: s.modality === "thai" ? colors.thai : colors.jiu }]}>
                    {s.modality === "thai" ? "MT" : "JJ"}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.sessionItemName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    {s.modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"}
                  </Text>
                  <Text style={[styles.sessionItemSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {new Date(s.sessionDate).toLocaleString("pt-BR")} · Prof. {s.teacherName}
                  </Text>
                </View>
                <View style={styles.sessionItemCount}>
                  <Ionicons name="people-outline" size={13} color={colors.mutedForeground} />
                  <Text style={[{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }]}>{s.attendanceCount}</Text>
                </View>
                {selectedSessionId === s.id && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Modal: adicionar aluno */}
      <Modal visible={studentPickerOpen} transparent animationType="slide" onRequestClose={() => setStudentPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setStudentPickerOpen(false)} />
        <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: botPad + 16 }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Adicionar Aluno
          </Text>
          <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              placeholder="Buscar aluno..."
              placeholderTextColor={colors.mutedForeground}
              value={studentSearch}
              onChangeText={setStudentSearch}
              autoFocus
            />
          </View>
          <FlatList
            data={filteredStudents}
            keyExtractor={item => String(item.userId)}
            style={{ maxHeight: 350 }}
            renderItem={({ item }) => {
              const initials = item.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
              return (
                <TouchableOpacity
                  style={[styles.studentItem, { borderBottomColor: colors.border }]}
                  onPress={() => confirmAttendance(item.userId)}
                >
                  <View style={[styles.attendAvatar, { backgroundColor: colors.primary + "22" }]}>
                    <Text style={[styles.attendInitials, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                      {initials}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.attendName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{item.name}</Text>
                    <Text style={[styles.attendTime, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{item.email}</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyAttend}>
                <Text style={[styles.emptyAttendText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {studentSearch ? "Nenhum aluno encontrado" : "Todos os alunos já estão presentes"}
                </Text>
              </View>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 26, letterSpacing: 0.5 },
  subtitle: { fontSize: 13, marginTop: 2 },
  content: { padding: 16, gap: 14 },

  toastWrap: {
    position: "absolute", top: 60, left: 16, right: 16, zIndex: 99,
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 10,
  },
  toastText: { color: "#fff", fontSize: 13, flex: 1 },

  banner: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  bannerIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  bannerInfo: { flex: 1 },
  bannerTitle: { fontSize: 14 },
  bannerSub: { fontSize: 12, marginTop: 2 },
  bannerBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  bannerBtnText: { fontSize: 12 },

  noBanner: { borderRadius: 12, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  noBannerText: { fontSize: 13 },

  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  cardLabel: { fontSize: 11, letterSpacing: 1 },

  sessionPicker: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, padding: 12 },
  sessionPickerText: { flex: 1, fontSize: 13 },

  addStudentBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, padding: 14 },
  addStudentText: { color: "#fff", fontSize: 14 },

  modeRow: { flexDirection: "row", gap: 8 },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, borderWidth: 1, paddingVertical: 10 },
  modeBtnText: { fontSize: 13 },

  cameraBox: { width: "100%", aspectRatio: 16 / 10, backgroundColor: "#000", alignItems: "center", justifyContent: "center", position: "relative" },
  cameraOff: { alignItems: "center", gap: 8 },
  cameraOffText: { fontSize: 13 },
  cameraBorder: { ...StyleSheet.absoluteFillObject, borderWidth: 4 },
  cameraBtns: { flexDirection: "row", gap: 8 },
  outlineBtn: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  outlineBtnText: { fontSize: 14 },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  inlineText: { fontSize: 13 },
  warnText: { fontSize: 12, textAlign: "center" },

  galleryPreviewWrap: { position: "relative", width: "100%" },
  galleryPreview: { width: "100%", height: 220 },
  galleryOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
  galleryOverlayText: { color: "#fff", fontSize: 13, textAlign: "center" },
  galleryBadge: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  galleryBadgeText: { color: "#fff", fontSize: 11 },
  galleryHint: { fontSize: 12, lineHeight: 17 },

  confirmBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  confirmBtnText: { color: "#fff", fontSize: 12 },

  attendListHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  countBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  countText: { fontSize: 13 },

  attendRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  attendAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  attendInitials: { fontSize: 14 },
  attendInfo: { flex: 1 },
  attendName: { fontSize: 14 },
  attendTime: { fontSize: 11, marginTop: 2 },

  emptyAttend: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyAttendText: { fontSize: 13 },

  noSessionHint: { alignItems: "center", paddingVertical: 48, gap: 12 },
  noSessionText: { fontSize: 14, textAlign: "center", maxWidth: 240 },

  restricted: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  restrictedIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  restrictedTitle: { fontSize: 20, letterSpacing: 0.5 },
  restrictedSub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  backBtn2: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  backBtn2Text: { fontSize: 14 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#555", alignSelf: "center", marginBottom: 4 },
  modalTitle: { fontSize: 18 },

  searchWrap: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 14 },

  sessionItem: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8, gap: 10 },
  sessionItemBadge: { width: 38, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sessionItemBadgeText: { fontSize: 11 },
  sessionItemName: { fontSize: 14 },
  sessionItemSub: { fontSize: 12, marginTop: 2 },
  sessionItemCount: { flexDirection: "row", alignItems: "center", gap: 3 },

  studentItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, gap: 12 },
});

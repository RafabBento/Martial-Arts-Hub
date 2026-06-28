import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions, type CameraCapturedPicture } from "expo-camera";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { enrollFace, type EnrollFaceResult } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { uploadImageToStorage } from "@/lib/uploadImage";

type StepKey = "front" | "left" | "right" | "up" | "down";

const STEPS: { key: StepKey; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "front", label: "Olhe para frente", hint: "Centralize seu rosto no círculo", icon: "happy-outline" },
  { key: "left", label: "Vire o rosto para a esquerda", hint: "Devagar, mantendo o rosto visível", icon: "arrow-back-outline" },
  { key: "right", label: "Vire o rosto para a direita", hint: "Devagar, mantendo o rosto visível", icon: "arrow-forward-outline" },
  { key: "up", label: "Incline o rosto para cima", hint: "Levante o queixo levemente", icon: "arrow-up-outline" },
  { key: "down", label: "Incline o rosto para baixo", hint: "Abaixe o queixo levemente", icon: "arrow-down-outline" },
];

const FRAMES_PER_STEP = 3;
const FRAME_INTERVAL_MS = 450;
const STEP_SETTLE_MS = 900;

type Phase = "intro" | "capturing" | "uploading" | "done" | "error";

export function FaceEnrollModal({
  visible,
  userId,
  title = "Cadastro facial",
  onClose,
  onDone,
}: {
  visible: boolean;
  userId: number;
  title?: string;
  onClose: () => void;
  onDone?: (result: EnrollFaceResult) => void;
}) {
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const cancelled = useRef(false);

  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<EnrollFaceResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset everything whenever the modal is (re)opened.
  useEffect(() => {
    if (visible) {
      cancelled.current = false;
      setPhase("intro");
      setStepIndex(0);
      setUploadProgress(0);
      setResult(null);
      setErrorMsg(null);
    } else {
      cancelled.current = true;
    }
  }, [visible]);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const runCapture = async () => {
    const granted = permission?.granted ? true : (await requestPermission()).granted;
    if (!granted) {
      setErrorMsg("Permissão da câmera negada. Ative em Ajustes › Expo Go › Câmera.");
      setPhase("error");
      return;
    }

    setPhase("capturing");
    const frames: CameraCapturedPicture[] = [];

    for (let i = 0; i < STEPS.length; i++) {
      if (cancelled.current) return;
      setStepIndex(i);
      await sleep(STEP_SETTLE_MS);
      for (let f = 0; f < FRAMES_PER_STEP; f++) {
        if (cancelled.current) return;
        try {
          const pic = await cameraRef.current?.takePictureAsync({
            quality: 0.6,
            skipProcessing: Platform.OS === "android",
          });
          if (pic?.uri) {
            frames.push(pic);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        } catch {
          // Ignore a single failed frame; the burst has redundancy.
        }
        await sleep(FRAME_INTERVAL_MS);
      }
    }

    if (cancelled.current) return;
    if (frames.length === 0) {
      setErrorMsg("Não foi possível capturar fotos. Tente novamente.");
      setPhase("error");
      return;
    }

    setPhase("uploading");
    const objectPaths: string[] = [];
    for (let i = 0; i < frames.length; i++) {
      if (cancelled.current) return;
      try {
        const path = await uploadImageToStorage(frames[i].uri, {
          name: `cadastro-${i}.jpg`,
          contentType: "image/jpeg",
        });
        objectPaths.push(path);
      } catch {
        // Skip a failed upload; keep the rest.
      }
      setUploadProgress(Math.round(((i + 1) / frames.length) * 100));
    }

    if (cancelled.current) return;
    if (objectPaths.length === 0) {
      setErrorMsg("Falha ao enviar as fotos. Verifique sua conexão e tente novamente.");
      setPhase("error");
      return;
    }

    try {
      const res = await enrollFace({ userId, objectPaths });
      if (cancelled.current) return;
      setResult(res);
      setPhase("done");
      if (res.anglesStored > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onDone?.(res);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch {
      if (cancelled.current) return;
      setErrorMsg("Não foi possível concluir o cadastro. Tente novamente.");
      setPhase("error");
    }
  };

  const handleClose = () => {
    cancelled.current = true;
    onClose();
  };

  const step = STEPS[stepIndex];
  const stepProgress = phase === "capturing" ? Math.round(((stepIndex + 1) / STEPS.length) * 100) : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{title}</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={10} accessibilityLabel="Fechar">
            <Ionicons name="close" size={26} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {phase === "intro" && (
          <View style={styles.body}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + "22" }]}>
              <Ionicons name="scan-outline" size={56} color={colors.primary} />
            </View>
            <Text style={[styles.bodyTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Cadastre seu rosto em vários ângulos
            </Text>
            <Text style={[styles.bodyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Mantenha o celular na altura dos olhos, em local bem iluminado. Vamos pedir para você olhar para
              frente e virar o rosto devagar para os lados, cima e baixo. As fotos são tiradas automaticamente.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={runCapture}
            >
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>Começar</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === "capturing" && (
          <View style={styles.cameraWrap}>
            <CameraView ref={cameraRef} style={styles.camera} facing="front" />
            <View style={styles.overlay} pointerEvents="none">
              <View style={[styles.faceRing, { borderColor: colors.primary }]} />
            </View>
            <View style={[styles.stepCard, { backgroundColor: "rgba(0,0,0,0.7)" }]} pointerEvents="none">
              <View style={styles.stepRow}>
                <Ionicons name={step.icon} size={26} color="#fff" />
                <Text style={[styles.stepLabel, { fontFamily: "Inter_700Bold" }]}>{step.label}</Text>
              </View>
              <Text style={[styles.stepHint, { fontFamily: "Inter_400Regular" }]}>{step.hint}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${stepProgress}%`, backgroundColor: colors.primary }]} />
              </View>
              <Text style={[styles.stepCount, { fontFamily: "Inter_500Medium" }]}>
                Etapa {stepIndex + 1} de {STEPS.length}
              </Text>
            </View>
          </View>
        )}

        {phase === "uploading" && (
          <View style={styles.body}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.bodyTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Processando seu rosto…
            </Text>
            <Text style={[styles.bodyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Enviando as fotos ({uploadProgress}%). Isso leva alguns segundos.
            </Text>
          </View>
        )}

        {phase === "done" && result && (
          <View style={styles.body}>
            <View style={[styles.iconCircle, { backgroundColor: (result.anglesStored > 0 ? colors.success : colors.warning) + "22" }]}>
              <Ionicons
                name={result.anglesStored > 0 ? "checkmark-circle-outline" : "alert-circle-outline"}
                size={56}
                color={result.anglesStored > 0 ? colors.success : colors.warning}
              />
            </View>
            <Text style={[styles.bodyTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {result.anglesStored > 0 ? "Cadastro concluído!" : "Nenhum rosto detectado"}
            </Text>
            <Text style={[styles.bodyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {result.message}
            </Text>
            {result.anglesStored === 0 ? (
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={runCapture}>
                <Ionicons name="refresh" size={20} color="#fff" />
                <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>Tentar de novo</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleClose}>
                <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>Concluir</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {phase === "error" && (
          <View style={styles.body}>
            <View style={[styles.iconCircle, { backgroundColor: colors.destructive + "22" }]}>
              <Ionicons name="close-circle-outline" size={56} color={colors.destructive} />
            </View>
            <Text style={[styles.bodyTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Ops!</Text>
            <Text style={[styles.bodyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {errorMsg}
            </Text>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={runCapture}>
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "web" ? 20 : 56,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 18 },
  iconCircle: { width: 110, height: 110, borderRadius: 55, alignItems: "center", justifyContent: "center" },
  bodyTitle: { fontSize: 20, textAlign: "center" },
  bodyText: { fontSize: 14, textAlign: "center", lineHeight: 21 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 16 },

  cameraWrap: { flex: 1, position: "relative" },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  faceRing: {
    width: 240,
    height: 300,
    borderRadius: 150,
    borderWidth: 3,
    borderStyle: "dashed",
    marginBottom: 80,
  },
  stepCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 36,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepLabel: { color: "#fff", fontSize: 18, flex: 1 },
  stepHint: { color: "#d4d4d4", fontSize: 13 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.2)", overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  stepCount: { color: "#fff", fontSize: 12 },
});

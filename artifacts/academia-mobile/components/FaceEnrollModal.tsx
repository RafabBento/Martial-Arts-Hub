// Modal de cadastro facial guiado (mobile). Conduz o usuário por vários ângulos
// (frente, esquerda, direita, cima, baixo), captura várias fotos por ângulo,
// envia tudo ao object storage e chama o endpoint enrollFace para extrair os
// descritores faciais no servidor. Todo o reconhecimento roda 100% server-side.
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

// Sequência de etapas (ângulos) que o usuário deve seguir durante a captura.
// Cada etapa tem rótulo, dica de instrução e ícone direcional.
const STEPS: { key: StepKey; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "front", label: "Olhe para frente", hint: "Centralize seu rosto no círculo", icon: "happy-outline" },
  { key: "left", label: "Vire o rosto para a esquerda", hint: "Devagar, mantendo o rosto visível", icon: "arrow-back-outline" },
  { key: "right", label: "Vire o rosto para a direita", hint: "Devagar, mantendo o rosto visível", icon: "arrow-forward-outline" },
  { key: "up", label: "Incline o rosto para cima", hint: "Levante o queixo levemente", icon: "arrow-up-outline" },
  { key: "down", label: "Incline o rosto para baixo", hint: "Abaixe o queixo levemente", icon: "arrow-down-outline" },
];

// Parâmetros da captura em rajada: quantas fotos por etapa, o intervalo entre
// cada foto e o tempo de "acomodação" antes de começar a fotografar a etapa
// (dá tempo do usuário posicionar o rosto no novo ângulo).
const FRAMES_PER_STEP = 3;
const FRAME_INTERVAL_MS = 450;
const STEP_SETTLE_MS = 900;

// Fases da máquina de estados do modal: introdução, capturando, enviando,
// concluído e erro.
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
  // Permissão da câmera (e função para solicitá-la quando ainda não concedida).
  const [permission, requestPermission] = useCameraPermissions();
  // Referência à CameraView para tirar fotos programaticamente.
  const cameraRef = useRef<CameraView>(null);
  // Flag (via ref, para ser lida dentro de loops assíncronos) que indica que o
  // usuário fechou o modal, abortando a captura/envio em andamento.
  const cancelled = useRef(false);

  // Estado da máquina: fase atual, etapa atual, progresso do upload, resultado
  // do servidor e mensagem de erro a exibir.
  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<EnrollFaceResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reseta tudo sempre que o modal é (re)aberto; ao fechar, marca cancelado.
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

  // Pequeno utilitário de espera assíncrona usado entre fotos/etapas.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Fluxo principal: garante permissão, captura as fotos por ângulo, envia ao
  // storage e dispara o processamento facial no servidor.
  const runCapture = async () => {
    // Garante permissão de câmera (solicita se ainda não foi concedida).
    const granted = permission?.granted ? true : (await requestPermission()).granted;
    if (!granted) {
      setErrorMsg("Permissão da câmera negada. Ative em Ajustes › Expo Go › Câmera.");
      setPhase("error");
      return;
    }

    setPhase("capturing");
    const frames: CameraCapturedPicture[] = [];

    // Percorre cada etapa/ângulo, aguardando o usuário se posicionar e então
    // tirando uma rajada de fotos.
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
            // Feedback tátil leve a cada foto capturada.
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        } catch {
          // Ignora uma foto que falhou; a rajada tem redundância suficiente.
        }
        await sleep(FRAME_INTERVAL_MS);
      }
    }

    // Aborta se o usuário fechou o modal durante a captura.
    if (cancelled.current) return;
    if (frames.length === 0) {
      setErrorMsg("Não foi possível capturar fotos. Tente novamente.");
      setPhase("error");
      return;
    }

    // Envia cada foto ao object storage, acumulando os caminhos e atualizando
    // a barra de progresso.
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
        // Pula um upload que falhou; mantém os demais.
      }
      setUploadProgress(Math.round(((i + 1) / frames.length) * 100));
    }

    if (cancelled.current) return;
    if (objectPaths.length === 0) {
      setErrorMsg("Falha ao enviar as fotos. Verifique sua conexão e tente novamente.");
      setPhase("error");
      return;
    }

    // Chama o endpoint que extrai os descritores faciais no servidor. Se ao
    // menos um ângulo foi armazenado, dá sucesso; caso contrário, avisa que
    // nenhum rosto foi detectado.
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

  // Fecha o modal e cancela qualquer captura/envio em andamento.
  const handleClose = () => {
    cancelled.current = true;
    onClose();
  };

  // Etapa atual e progresso geral (em %) das etapas concluídas.
  const step = STEPS[stepIndex];
  const stepProgress = phase === "capturing" ? Math.round(((stepIndex + 1) / STEPS.length) * 100) : 0;

  // A interface é renderizada conforme a fase atual (intro/capturing/uploading/
  // done/error), cada uma exibindo um conteúdo diferente dentro do mesmo modal.
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {/* Cabeçalho fixo com título e botão de fechar. */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{title}</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={10} accessibilityLabel="Fechar">
            <Ionicons name="close" size={26} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Fase de introdução: explica o processo e oferece o botão "Começar". */}
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

        {/* Fase de captura: câmera frontal com anel-guia e card de instruções. */}
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

        {/* Fase de envio: indicador de progresso enquanto sobe as fotos. */}
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

        {/* Fase concluída: mostra sucesso ou aviso de "nenhum rosto detectado". */}
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

        {/* Fase de erro: mensagem amigável e botão para tentar de novo. */}
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

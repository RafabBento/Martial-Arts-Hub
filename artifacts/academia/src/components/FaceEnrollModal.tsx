// Modal de cadastro facial guiado (multiângulo).
// Conduz o usuário por uma sequência de poses (frente, esquerda, direita, cima,
// baixo), captura vários quadros automaticamente pela webcam, envia as imagens
// para o object storage (upload presigned) e chama o endpoint de cadastro facial
// (enrollFace), que processa os descritores faciais 100% no servidor.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScanFace,
  Smile,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Camera,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  X,
  type LucideIcon,
} from "lucide-react";
import { enrollFace, type EnrollFaceResult } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { uploadImageToStorage } from "@/lib/uploadImage";

// Chaves das poses/etapas do cadastro facial guiado.
type StepKey = "front" | "left" | "right" | "up" | "down";

// Definição de cada etapa exibida ao usuário: rótulo, dica e ícone de orientação.
const STEPS: { key: StepKey; label: string; hint: string; Icon: LucideIcon }[] = [
  { key: "front", label: "Olhe para frente", hint: "Centralize seu rosto no círculo", Icon: Smile },
  { key: "left", label: "Vire o rosto para a esquerda", hint: "Devagar, mantendo o rosto visível", Icon: ArrowLeft },
  { key: "right", label: "Vire o rosto para a direita", hint: "Devagar, mantendo o rosto visível", Icon: ArrowRight },
  { key: "up", label: "Incline o rosto para cima", hint: "Levante o queixo levemente", Icon: ArrowUp },
  { key: "down", label: "Incline o rosto para baixo", hint: "Abaixe o queixo levemente", Icon: ArrowDown },
];

// Parâmetros de captura: quantos quadros por etapa, intervalo entre quadros e
// tempo de "acomodação" no início de cada etapa para o usuário se posicionar.
const FRAMES_PER_STEP = 3;
const FRAME_INTERVAL_MS = 450;
const STEP_SETTLE_MS = 900;

// Fases do fluxo do modal, do convite inicial até concluído/erro.
type Phase = "intro" | "capturing" | "uploading" | "done" | "error";

// Utilitário simples de espera assíncrona (usado entre quadros/etapas).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function FaceEnrollModal({
  open,
  userId,
  title = "Cadastro facial",
  onClose,
  onDone,
}: {
  open: boolean;
  userId: number;
  title?: string;
  onClose: () => void;
  onDone?: (result: EnrollFaceResult) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Token de sessão monotônico: cada abrir/fechar/reabrir incrementa o valor
  // para que uma cadeia assíncrona de captura de uma sessão anterior perceba
  // que está obsoleta e aborte, em vez de mexer no estado ou anexar um stream
  // "fantasma".
  const sessionRef = useRef(0);

  // Estado do fluxo: fase atual, índice da etapa, progresso de upload,
  // resultado do cadastro e mensagem de erro.
  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<EnrollFaceResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Encerra o stream da câmera e limpa o elemento de vídeo.
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Reinicia o estado sempre que (re)aberto; para a câmera ao fechar/desmontar.
  // Incrementar o token de sessão invalida qualquer captura ainda em execução.
  useEffect(() => {
    sessionRef.current += 1;
    if (open) {
      setPhase("intro");
      setStepIndex(0);
      setUploadProgress(0);
      setResult(null);
      setErrorMsg(null);
    } else {
      stopStream();
    }
    return () => {
      sessionRef.current += 1;
      stopStream();
    };
  }, [open, stopStream]);

  // Inicia o stream da câmera frontal. Recebe o token de sessão "my" para
  // descartar resultados obsoletos. Retorna true se conseguiu iniciar; em caso
  // de erro, define a mensagem apropriada e muda para a fase de erro.
  const startStream = async (my: number): Promise<boolean> => {
    stopStream();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new DOMException("unsupported", "NotSupportedError");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      // Stale: modal closed/reopened while we awaited getUserMedia.
      if (my !== sessionRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      return true;
    } catch (err) {
      if (my !== sessionRef.current) return false;
      const name = err instanceof DOMException ? err.name : "";
      const blockedInFrame = window.self !== window.top;
      if (name === "NotFoundError" || name === "OverconstrainedError") {
        setErrorMsg("Nenhuma câmera foi encontrada neste dispositivo.");
      } else if (blockedInFrame) {
        setErrorMsg(
          "A câmera está bloqueada na pré-visualização incorporada. Abra o app em uma nova aba do navegador e permita o acesso à câmera.",
        );
      } else {
        setErrorMsg(
          "Não foi possível acessar a câmera. Permita o acesso nas configurações do navegador.",
        );
      }
      setPhase("error");
      return false;
    }
  };

  // Captura um único quadro do vídeo em um <canvas> e o devolve como arquivo
  // JPEG (qualidade 0.7 para reduzir o tamanho do upload). Espelha a imagem por
  // ser câmera frontal, casando com a pré-visualização. Resolve null se o vídeo
  // ainda não tem dimensões válidas ou se o canvas não pôde ser criado.
  const captureFrame = (): Promise<File | null> =>
    new Promise((resolve) => {
      const video = videoRef.current;
      const w = video?.videoWidth ?? 0;
      const h = video?.videoHeight ?? 0;
      if (!video || !w || !h) {
        resolve(null);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      // Mirror the front camera so the saved photo matches the live preview.
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          resolve(new File([blob], `cadastro-${Date.now()}.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.7,
      );
    });

  // Orquestra todo o fluxo de captura: liga a câmera, percorre cada etapa/pose
  // capturando vários quadros, envia tudo ao storage e chama o cadastro facial.
  // A função "stale" verifica, em cada ponto de await, se a sessão ainda é a
  // atual — abortando silenciosamente se o modal foi fechado/reaberto.
  const runCapture = async () => {
    const my = sessionRef.current;
    const stale = () => my !== sessionRef.current;

    setErrorMsg(null);
    setResult(null);
    setStepIndex(0);
    setPhase("capturing");
    // Deixa o React montar o elemento <video> antes de anexar o stream.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const started = await startStream(my);
    if (!started || stale()) return;
    // Dá um momento para a câmera entregar quadros reais (não pretos/vazios).
    await sleep(500);

    // Para cada etapa: aguarda a acomodação e captura FRAMES_PER_STEP quadros.
    const frames: File[] = [];
    for (let i = 0; i < STEPS.length; i++) {
      if (stale()) return;
      setStepIndex(i);
      await sleep(STEP_SETTLE_MS);
      for (let f = 0; f < FRAMES_PER_STEP; f++) {
        if (stale()) return;
        const file = await captureFrame();
        if (file) frames.push(file);
        await sleep(FRAME_INTERVAL_MS);
      }
    }

    if (stale()) return;
    stopStream();
    // Nenhum quadro capturado: aborta com erro.
    if (frames.length === 0) {
      setErrorMsg("Não foi possível capturar fotos. Tente novamente.");
      setPhase("error");
      return;
    }

    // Fase de upload: envia cada quadro ao storage acumulando os caminhos.
    setPhase("uploading");
    setUploadProgress(0);
    const objectPaths: string[] = [];
    for (let i = 0; i < frames.length; i++) {
      if (stale()) return;
      try {
        const path = await uploadImageToStorage(frames[i]);
        objectPaths.push(path);
      } catch {
        // Ignora um upload que falhou; mantém os demais.
      }
      setUploadProgress(Math.round(((i + 1) / frames.length) * 100));
    }

    if (stale()) return;
    // Se nenhum upload deu certo, não há o que cadastrar.
    if (objectPaths.length === 0) {
      setErrorMsg("Falha ao enviar as fotos. Verifique sua conexão e tente novamente.");
      setPhase("error");
      return;
    }

    // Chama o cadastro facial no servidor com os caminhos enviados. O servidor
    // extrai os descritores; anglesStored indica quantos ângulos foram aceitos.
    try {
      const res = await enrollFace({ userId, objectPaths });
      if (stale()) return;
      setResult(res);
      setPhase("done");
      if (res.anglesStored > 0) onDone?.(res);
    } catch {
      if (stale()) return;
      setErrorMsg("Não foi possível concluir o cadastro. Tente novamente.");
      setPhase("error");
    }
  };

  // Fecha o modal: invalida a sessão (aborta capturas) e para a câmera.
  const handleClose = () => {
    sessionRef.current += 1;
    stopStream();
    onClose();
  };

  // Modal fechado: não renderiza nada.
  if (!open) return null;

  // Dados derivados para a UI: etapa atual, seu ícone, progresso geral das
  // etapas e se estamos rodando dentro de um iframe (câmera pode ser bloqueada).
  const step = STEPS[stepIndex];
  const StepIcon = step.Icon;
  const stepProgress = phase === "capturing" ? Math.round(((stepIndex + 1) / STEPS.length) * 100) : 0;
  const isFrameBlocked = window.self !== window.top;

  // UI do modal: o conteúdo central muda conforme a "phase" — intro (convite),
  // capturing (vídeo + guia de pose), uploading (progresso), done (sucesso/aviso)
  // e error (mensagem + tentar de novo).
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-bold uppercase tracking-wide text-sm">{title}</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {phase === "intro" && (
          <div className="flex flex-col items-center text-center gap-4 p-7">
            <div className="w-24 h-24 rounded-full bg-primary/15 flex items-center justify-center">
              <ScanFace size={48} className="text-primary" />
            </div>
            <h3 className="text-lg font-bold">Cadastre o rosto em vários ângulos</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Fique em um local bem iluminado, com o rosto na altura da câmera. Vamos pedir para olhar
              para frente e virar o rosto devagar para os lados, cima e baixo. As fotos são tiradas
              automaticamente.
            </p>
            <Button className="w-full gap-2" onClick={runCapture}>
              <Camera size={18} /> Começar
            </Button>
          </div>
        )}

        {phase === "capturing" && (
          <div className="relative aspect-square bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-44 h-56 rounded-[50%] border-[3px] border-dashed border-primary -mt-10" />
            </div>
            <div className="absolute inset-x-3 bottom-3 rounded-xl bg-black/70 p-4 space-y-2">
              <div className="flex items-center gap-2 text-white">
                <StepIcon size={22} className="text-primary shrink-0" />
                <span className="font-bold text-base">{step.label}</span>
              </div>
              <p className="text-xs text-neutral-300">{step.hint}</p>
              <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${stepProgress}%` }} />
              </div>
              <p className="text-[11px] text-neutral-300">
                Etapa {stepIndex + 1} de {STEPS.length}
              </p>
            </div>
          </div>
        )}

        {phase === "uploading" && (
          <div className="flex flex-col items-center text-center gap-4 p-9">
            <Loader2 size={40} className="animate-spin text-primary" />
            <h3 className="text-lg font-bold">Processando o rosto…</h3>
            <p className="text-sm text-muted-foreground">
              Enviando as fotos ({uploadProgress}%). Isso leva alguns segundos.
            </p>
          </div>
        )}

        {phase === "done" && result && (
          <div className="flex flex-col items-center text-center gap-4 p-7">
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center ${
                result.anglesStored > 0 ? "bg-green-500/15" : "bg-yellow-500/15"
              }`}
            >
              {result.anglesStored > 0 ? (
                <CheckCircle2 size={48} className="text-green-400" />
              ) : (
                <AlertTriangle size={48} className="text-yellow-400" />
              )}
            </div>
            <h3 className="text-lg font-bold">
              {result.anglesStored > 0 ? "Cadastro concluído!" : "Nenhum rosto detectado"}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{result.message}</p>
            {result.anglesStored > 0 ? (
              <Button className="w-full" onClick={handleClose}>
                Concluir
              </Button>
            ) : (
              <Button className="w-full gap-2" onClick={runCapture}>
                <RefreshCw size={16} /> Tentar de novo
              </Button>
            )}
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center text-center gap-4 p-7">
            <div className="w-24 h-24 rounded-full bg-destructive/15 flex items-center justify-center">
              <XCircle size={48} className="text-destructive" />
            </div>
            <h3 className="text-lg font-bold">Ops!</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{errorMsg}</p>
            {isFrameBlocked && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open(window.location.href, "_blank", "noopener")}
              >
                Abrir em nova aba
              </Button>
            )}
            <Button className="w-full gap-2" onClick={runCapture}>
              <RefreshCw size={16} /> Tentar de novo
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

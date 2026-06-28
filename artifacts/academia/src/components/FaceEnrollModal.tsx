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

type StepKey = "front" | "left" | "right" | "up" | "down";

const STEPS: { key: StepKey; label: string; hint: string; Icon: LucideIcon }[] = [
  { key: "front", label: "Olhe para frente", hint: "Centralize seu rosto no círculo", Icon: Smile },
  { key: "left", label: "Vire o rosto para a esquerda", hint: "Devagar, mantendo o rosto visível", Icon: ArrowLeft },
  { key: "right", label: "Vire o rosto para a direita", hint: "Devagar, mantendo o rosto visível", Icon: ArrowRight },
  { key: "up", label: "Incline o rosto para cima", hint: "Levante o queixo levemente", Icon: ArrowUp },
  { key: "down", label: "Incline o rosto para baixo", hint: "Abaixe o queixo levemente", Icon: ArrowDown },
];

const FRAMES_PER_STEP = 2;
const FRAME_INTERVAL_MS = 450;
const STEP_SETTLE_MS = 900;

type Phase = "intro" | "capturing" | "uploading" | "done" | "error";

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
  // Monotonic session token: every open/close/reopen bumps it so a long async
  // capture chain from a previous session can detect it is stale and bail out
  // instead of mutating state or attaching a ghost stream.
  const sessionRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<EnrollFaceResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Reset whenever (re)opened; stop the camera when closed/unmounted. Bumping
  // the session token invalidates any capture chain still running.
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

  const runCapture = async () => {
    const my = sessionRef.current;
    const stale = () => my !== sessionRef.current;

    setErrorMsg(null);
    setResult(null);
    setStepIndex(0);
    setPhase("capturing");
    // Let React mount the <video> element before attaching the stream.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const started = await startStream(my);
    if (!started || stale()) return;
    // Give the camera a moment to deliver real frames.
    await sleep(500);

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
    if (frames.length === 0) {
      setErrorMsg("Não foi possível capturar fotos. Tente novamente.");
      setPhase("error");
      return;
    }

    setPhase("uploading");
    setUploadProgress(0);
    const objectPaths: string[] = [];
    for (let i = 0; i < frames.length; i++) {
      if (stale()) return;
      try {
        const path = await uploadImageToStorage(frames[i]);
        objectPaths.push(path);
      } catch {
        // Skip a failed upload; keep the rest.
      }
      setUploadProgress(Math.round(((i + 1) / frames.length) * 100));
    }

    if (stale()) return;
    if (objectPaths.length === 0) {
      setErrorMsg("Falha ao enviar as fotos. Verifique sua conexão e tente novamente.");
      setPhase("error");
      return;
    }

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

  const handleClose = () => {
    sessionRef.current += 1;
    stopStream();
    onClose();
  };

  if (!open) return null;

  const step = STEPS[stepIndex];
  const StepIcon = step.Icon;
  const stepProgress = phase === "capturing" ? Math.round(((stepIndex + 1) / STEPS.length) * 100) : 0;
  const isFrameBlocked = window.self !== window.top;

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

// Modal de captura de foto pela webcam (getUserMedia).
// Usado em fluxos como foto de perfil. Mostra o vídeo ao vivo, permite trocar
// entre câmera frontal/traseira e captura um quadro como arquivo JPEG, que é
// devolvido ao chamador via onCapture. Trata erros comuns de permissão/iframe.
import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, RefreshCw, X, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CameraCaptureModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the captured photo as a File once the user confirms. */
  onCapture: (file: File) => void;
  /** "user" = front (selfie) camera, "environment" = rear camera. */
  facing?: "user" | "environment";
  title?: string;
}

/**
 * Live webcam capture using getUserMedia. Works on desktop and mobile browsers
 * (unlike <input capture> which only opens a camera on mobile). The captured
 * frame is returned as a JPEG File so callers can upload it like any other
 * image.
 */
export function CameraCaptureModal({
  open,
  onClose,
  onCapture,
  facing = "user",
  title = "Tirar foto",
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Token monotônico: cada início/parada incrementa o valor para que uma
  // promise de getUserMedia que resolve atrasada (após fechar/desmontar ou uma
  // troca mais nova) perceba que está obsoleta e pare suas próprias tracks em
  // vez de anexar um stream "fantasma".
  const requestIdRef = useRef(0);
  // Câmera atual (frontal/traseira), mensagem de erro e flag de vídeo pronto.
  const [facingMode, setFacingMode] = useState<"user" | "environment">(facing);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Para o stream atual: invalida requisições pendentes, encerra as tracks da
  // câmera e limpa o elemento de vídeo.
  const stopStream = useCallback(() => {
    requestIdRef.current += 1;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
  }, []);

  // Inicia o stream da câmera no modo escolhido (frontal/traseira).
  // Usa o token de requisição para descartar resultados obsoletos e mapeia
  // os erros de getUserMedia para mensagens amigáveis ao usuário.
  const startStream = useCallback(async (mode: "user" | "environment") => {
    setError(null);
    setReady(false);
    stopStream();
    const myRequest = requestIdRef.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new DOMException("unsupported", "NotSupportedError");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode },
        audio: false,
      });
      // Stale: modal closed/unmounted or a newer request started while we awaited.
      if (myRequest !== requestIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);
    } catch (err) {
      if (myRequest !== requestIdRef.current) return;
      const name = err instanceof DOMException ? err.name : "";
      // When the app runs inside Replit's embedded preview iframe, the browser
      // blocks camera access (Permissions Policy). Opening in a real tab fixes it.
      const blockedInFrame = window.self !== window.top;
      if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError("Nenhuma câmera foi encontrada neste dispositivo. Use a opção de enviar um arquivo.");
      } else if (blockedInFrame) {
        setError(
          "A câmera está bloqueada na pré-visualização incorporada. Abra o app em uma nova aba do navegador (botão abaixo) e permita o acesso à câmera — ou envie um arquivo.",
        );
      } else {
        setError(
          "Não foi possível acessar a câmera. Permita o acesso nas configurações do navegador ou use a opção de enviar um arquivo.",
        );
      }
    }
  }, [stopStream]);

  // Liga a câmera ao abrir o modal e ao trocar de câmera; desliga ao fechar.
  // O cleanup garante que o stream pare ao desmontar o componente.
  useEffect(() => {
    if (open) {
      void startStream(facingMode);
    } else {
      stopStream();
    }
    return () => stopStream();
  }, [open, facingMode, startStream, stopStream]);

  // Alterna entre câmera frontal (selfie) e traseira.
  const flipCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  // Captura o quadro atual do vídeo em um <canvas> e gera um arquivo JPEG.
  // Espelha horizontalmente quando é a câmera frontal para que a foto salva
  // corresponda ao que o usuário vê na tela.
  const handleShoot = () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror the front camera so the saved photo matches what the user sees.
    if (facingMode === "user") {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
        stopStream();
        onCapture(file);
      },
      "image/jpeg",
      0.9,
    );
  };

  // Modal fechado: não renderiza nada.
  if (!open) return null;

  // UI: cabeçalho com título e botão fechar; área de vídeo (ou mensagem de erro)
  // e os controles de trocar câmera/capturar na base.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-bold uppercase tracking-wide text-sm">{title}</h2>
          <button
            type="button"
            onClick={() => {
              stopStream();
              onClose();
            }}
            aria-label="Fechar"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative aspect-square bg-black flex items-center justify-center">
          {error ? (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <AlertTriangle size={32} className="text-red-400" />
              <p className="text-sm text-muted-foreground">{error}</p>
              {window.self !== window.top && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => window.open(window.location.href, "_blank", "noopener")}
                >
                  Abrir em nova aba
                </Button>
              )}
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: facingMode === "user" ? "scaleX(-1)" : undefined }}
              />
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 size={32} className="animate-spin text-primary" />
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 p-4">
          {!error && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={flipCamera}
              aria-label="Trocar câmera"
              title="Trocar câmera"
            >
              <RefreshCw size={18} />
            </Button>
          )}
          <Button
            type="button"
            size="lg"
            className="flex-1 gap-2"
            onClick={handleShoot}
            disabled={!ready || !!error}
          >
            <Camera size={18} /> Capturar
          </Button>
        </div>
      </div>
    </div>
  );
}

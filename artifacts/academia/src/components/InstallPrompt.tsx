// Banner que incentiva o usuário a instalar o app como PWA.
// No Android/Chromium aproveita o evento beforeinstallprompt para oferecer um
// botão "instalar"; no iOS (que não tem esse evento) exibe instruções manuais
// específicas (Safari vs. outros navegadores). Aparece só em celulares, fora do
// modo standalone e respeita a escolha de dispensar (salva em localStorage).
import { useEffect, useState } from "react";
import { X, Share, Plus, Download, MoreVertical, Compass } from "lucide-react";

// Chave em localStorage para lembrar que o usuário dispensou o banner.
const DISMISS_KEY = "pwa-install-dismissed";

// Tipagem do evento beforeinstallprompt (não padronizado no lib DOM padrão).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Lê se o banner já foi dispensado (protegido contra modo privado/sandbox).
function getDismissed(): boolean {
  try {
    return !!localStorage.getItem(DISMISS_KEY);
  } catch {
    return false;
  }
}

// Marca o banner como dispensado (protegido contra modo privado/sandbox).
function setDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore (private mode / sandboxed iframe) */
  }
}

// Detecta se o app já está rodando instalado (standalone) — nesse caso o banner
// não deve aparecer. Cobre tanto a media query quanto a flag do iOS Safari.
function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// Modos de exibição do banner conforme a plataforma/navegador detectado.
type Mode = "ios-safari" | "ios-other" | "android";

export function InstallPrompt() {
  // Evento de instalação adiado (Android), visibilidade do banner e modo atual.
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);

  // Decide, na montagem, se e como mostrar o banner conforme a plataforma.
  useEffect(() => {
    if (isStandalone()) return;
    if (getDismissed()) return;

    // Detecta a plataforma pelo user agent.
    const ua = window.navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    const android = /android/i.test(ua);
    if (!ios && !android) return; // só em navegadores de celular

    if (ios) {
      // No iOS distinguimos Safari (tem o fluxo "Adicionar à Tela de Início")
      // de outros navegadores (que precisam abrir no Safari para instalar).
      const otherBrowser = /crios|fxios|edgios|opios|mercury|brave/i.test(ua);
      const safari = /safari/i.test(ua) && !otherBrowser;
      setMode(safari ? "ios-safari" : "ios-other");
      setVisible(true);
      return; // iOS não tem beforeinstallprompt
    }

    // Android / Chromium: aguarda o evento beforeinstallprompt do navegador.
    setMode("android");
    let captured = false;
    // Captura e adia o prompt nativo para dispará-lo quando o usuário clicar.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
      captured = true;
    };
    // Quando o app for instalado, esconde o banner e marca como dispensado.
    const onInstalled = () => {
      setVisible(false);
      setDismissed();
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // Se o navegador não disparar o evento, mostramos instruções manuais.
    const timer = window.setTimeout(() => {
      if (!captured) setVisible(true);
    }, 1500);

    // Cleanup: remove os listeners e cancela o timer ao desmontar.
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(timer);
    };
  }, []);

  // Nada a mostrar enquanto invisível ou sem modo definido.
  if (!visible || !mode) return null;

  // Fecha o banner por escolha do usuário e lembra para não exibir de novo.
  const dismiss = () => {
    setVisible(false);
    setDismissed();
  };

  // Dispara o prompt de instalação nativo (Android) e trata a escolha do usuário.
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
      setDismissed();
    }
    setDeferred(null);
  };

  // Ícone do app exibido no banner (respeita o BASE_URL do build/PWA).
  const iconSrc = `${import.meta.env.BASE_URL}pwa-192x192.png`;

  // UI: cartão fixo na base com ícone, texto/instruções conforme o modo
  // (iOS Safari, iOS outros, Android) e botões de instalar/dispensar.
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] p-3 dark pointer-events-none"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-border bg-card/95 backdrop-blur shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <img
            src={iconSrc}
            alt="Front Artes Marciais"
            className="w-12 h-12 rounded-xl border border-border shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-foreground">
              Instalar Front Artes Marciais
            </div>

            {mode === "ios-safari" && (
              <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                <li className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">1.</span> Toque em
                  <Share size={14} className="text-primary" />
                  <span>(Compartilhar), na barra do Safari.</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">2.</span> Escolha
                  <Plus size={14} className="text-primary" />
                  <span className="font-medium text-foreground">“Adicionar à Tela de Início”.</span>
                </li>
              </ol>
            )}

            {mode === "ios-other" && (
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Para instalar no iPhone, abra este site no{" "}
                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                  <Compass size={13} className="text-primary" /> Safari
                </span>
                , toque em <Share size={13} className="inline -mt-0.5 text-primary" /> e depois em
                <span className="font-medium text-foreground"> “Adicionar à Tela de Início”</span>.
              </p>
            )}

            {mode === "android" && deferred && (
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Adicione o app à sua tela inicial para abrir com um toque, em tela cheia.
              </p>
            )}

            {mode === "android" && !deferred && (
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Abra o menu{" "}
                <MoreVertical size={13} className="inline -mt-0.5 text-primary" /> do navegador e
                toque em
                <span className="font-medium text-foreground"> “Adicionar à tela inicial”</span>.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Fechar"
            data-testid="button-dismiss-install"
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors -mt-1 -mr-1 p-1"
          >
            <X size={18} />
          </button>
        </div>

        {mode === "android" && deferred && (
          <button
            type="button"
            onClick={install}
            data-testid="button-install-pwa"
            className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-white font-semibold py-2.5 text-sm hover:bg-primary/90 transition-colors"
          >
            <Download size={16} /> Adicionar à tela inicial
          </button>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { X, Share, Plus, Download, MoreVertical, Compass } from "lucide-react";

const DISMISS_KEY = "pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function getDismissed(): boolean {
  try {
    return !!localStorage.getItem(DISMISS_KEY);
  } catch {
    return false;
  }
}

function setDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore (private mode / sandboxed iframe) */
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

type Mode = "ios-safari" | "ios-other" | "android";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    if (getDismissed()) return;

    const ua = window.navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    const android = /android/i.test(ua);
    if (!ios && !android) return; // só em navegadores de celular

    if (ios) {
      const otherBrowser = /crios|fxios|edgios|opios|mercury|brave/i.test(ua);
      const safari = /safari/i.test(ua) && !otherBrowser;
      setMode(safari ? "ios-safari" : "ios-other");
      setVisible(true);
      return; // iOS não tem beforeinstallprompt
    }

    // Android / Chromium
    setMode("android");
    let captured = false;
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
      captured = true;
    };
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

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(timer);
    };
  }, []);

  if (!visible || !mode) return null;

  const dismiss = () => {
    setVisible(false);
    setDismissed();
  };

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

  const iconSrc = `${import.meta.env.BASE_URL}pwa-192x192.png`;

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

import { useEffect, useState } from "react";
import { X, Share, Plus, Download, MoreVertical } from "lucide-react";

const DISMISS_KEY = "pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

type Platform = "ios" | "android";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const ua = window.navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    const android = /android/i.test(ua);
    if (!ios && !android) return; // só em navegadores de celular

    setPlatform(ios ? "ios" : "android");

    if (ios) {
      setVisible(true);
      return; // iOS não tem beforeinstallprompt
    }

    let captured = false;
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
      captured = true;
    };
    const onInstalled = () => {
      setVisible(false);
      localStorage.setItem(DISMISS_KEY, "1");
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

  if (!visible || !platform) return null;

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
      localStorage.setItem(DISMISS_KEY, "1");
    }
    setDeferred(null);
  };

  const iconSrc = `${import.meta.env.BASE_URL}pwa-192x192.png`;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 dark pointer-events-none">
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
            {platform === "ios" ? (
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Toque em{" "}
                <Share size={13} className="inline -mt-0.5 text-primary" /> e depois em
                <span className="font-medium text-foreground"> “Adicionar à Tela de Início”</span>{" "}
                <Plus size={13} className="inline -mt-0.5 text-primary" /> para usar como app.
              </p>
            ) : deferred ? (
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Adicione o app à sua tela inicial para abrir com um toque, em tela cheia.
              </p>
            ) : (
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
        {platform === "android" && deferred && (
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

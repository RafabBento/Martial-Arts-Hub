// Avisa quando há uma versão nova do app disponível (service worker atualizado)
// e deixa o usuário escolher a hora de recarregar — nunca recarrega sozinho,
// pra não perder um formulário/captura de foto em andamento. Também dispara
// checagens periódicas em segundo plano: sem isso, uma aba fica presa na
// versão antiga até o navegador decidir checar por conta própria (só costuma
// acontecer numa navegação nova), o que pode levar horas com a aba aberta.
import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Intervalo de checagem por atualização enquanto o app está aberto.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {});
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[70] p-3 dark pointer-events-none"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-primary/40 bg-card/95 backdrop-blur shadow-2xl p-4 flex items-center gap-3">
        <RefreshCw size={18} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-foreground">Nova versão disponível</div>
          <div className="text-xs text-muted-foreground">Atualize quando estiver com um momento livre.</div>
        </div>
        <Button size="sm" onClick={() => updateServiceWorker(true)}>Atualizar</Button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="Dispensar"
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

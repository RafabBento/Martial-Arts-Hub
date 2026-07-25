// Banner persistente lembrando o usuário de confirmar o e-mail. Soft-gate: só
// avisa, nunca bloqueia nenhuma funcionalidade — some sozinho quando
// user.emailVerified vira true (login seguinte, ou na hora via /verify-email).
import { useState } from "react";
import { MailWarning, X } from "lucide-react";
import { useResendVerification } from "@workspace/api-client-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export function EmailVerifyBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const resendMutation = useResendVerification();
  const [dismissed, setDismissed] = useState(false);

  if (!user || user.emailVerified || dismissed) return null;

  const handleResend = () => {
    resendMutation.mutate(undefined, {
      onSuccess: () => toast({ title: "E-mail de confirmação reenviado!" }),
      onError: () => toast({ title: "Erro ao reenviar e-mail", variant: "destructive" }),
    });
  };

  return (
    <div className="bg-primary/10 border-b border-primary/30 px-4 py-2.5 flex items-center gap-3 text-sm">
      <MailWarning size={16} className="text-primary shrink-0" />
      <span className="flex-1 min-w-0">
        Confirme seu e-mail para garantir o acesso à sua conta.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 h-7 text-xs"
        disabled={resendMutation.isPending}
        onClick={handleResend}
      >
        {resendMutation.isPending ? "Enviando..." : "Reenviar e-mail"}
      </Button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dispensar"
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
}

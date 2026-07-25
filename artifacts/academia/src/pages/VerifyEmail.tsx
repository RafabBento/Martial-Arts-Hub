// Página de confirmação de e-mail. Lê o token da URL (?token=...) e chama a
// verificação assim que monta — funciona tanto logado quanto deslogado, por
// isso não usa ProtectedRoute/PublicRoute nem o Layout (igual Login.tsx).
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useVerifyEmail } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

type Status = "verifying" | "success" | "error";

export default function VerifyEmail() {
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const verifyMutation = useVerifyEmail();
  const queryClient = useQueryClient();
  // StrictMode/HMR monta o efeito duas vezes em dev; evita chamar a API duas vezes.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatus("error");
      setErrorMsg("Link inválido — token de confirmação ausente.");
      return;
    }

    verifyMutation.mutate(
      { data: { token } },
      {
        onSuccess: () => {
          setStatus("success");
          // Se o usuário está logado neste mesmo navegador, refaz o /me para
          // que o banner de "confirme seu e-mail" suma sem precisar recarregar.
          queryClient.invalidateQueries({ queryKey: ["me"] });
        },
        onError: (err: any) => {
          setStatus("error");
          setErrorMsg(err?.data?.error ?? "Link inválido ou expirado. Solicite um novo e-mail de confirmação.");
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background dark text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-4">
        {status === "verifying" && (
          <>
            <Loader2 size={48} className="animate-spin text-primary mx-auto" />
            <h1 className="text-xl font-black uppercase">Confirmando seu e-mail…</h1>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 size={48} className="text-green-400 mx-auto" />
            <h1 className="text-xl font-black uppercase">E-mail confirmado!</h1>
            <p className="text-sm text-muted-foreground">Seu cadastro está confirmado.</p>
            <Link href="/dashboard">
              <Button className="w-full mt-2">Ir para o painel</Button>
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle size={48} className="text-destructive mx-auto" />
            <h1 className="text-xl font-black uppercase">Não foi possível confirmar</h1>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Link href="/dashboard">
              <Button variant="outline" className="w-full mt-2">Voltar ao painel</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

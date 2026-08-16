// Página de redefinição de senha. Lê o token da URL (?token=...) e deixa o
// usuário escolher uma nova senha — rota "crua" (funciona logado ou
// deslogado), mesmo padrão de VerifyEmail.tsx.
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { XCircle, CheckCircle2 } from "lucide-react";
import { useResetPassword } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/hooks/use-toast";

const resetPasswordSchema = z.object({
  password: z.string().min(6, "Mínimo de 6 caracteres"),
});

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const resetMutation = useResetPassword();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "" },
  });

  const onSubmit = (values: ResetPasswordValues) => {
    if (!token) return;
    resetMutation.mutate(
      { data: { token, password: values.password } },
      {
        onSuccess: () => {
          toast({ title: "Senha redefinida com sucesso!" });
          setLocation("/login");
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Não foi possível redefinir a senha",
            description: err?.data?.error ?? "Link inválido ou expirado. Solicite um novo.",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background dark text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        {!token ? (
          <div className="text-center space-y-4">
            <XCircle size={48} className="text-destructive mx-auto" />
            <h1 className="text-xl font-black uppercase">Link inválido</h1>
            <p className="text-sm text-muted-foreground">Token de redefinição ausente.</p>
            <Link href="/forgot-password">
              <Button variant="outline" className="w-full">Solicitar novo link</Button>
            </Link>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter">Nova senha</h1>
              <p className="text-sm text-muted-foreground mt-2">Escolha uma nova senha para sua conta.</p>
            </div>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Nova senha</FormLabel>
                      <FormControl>
                        <PasswordInput placeholder="••••••••" autoComplete="new-password" className="h-12 bg-card/50 border-border focus-visible:ring-primary" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full h-12 text-lg font-bold uppercase tracking-wide" disabled={resetMutation.isPending}>
                  {resetMutation.isPending
                    ? "Salvando..."
                    : <span className="flex items-center justify-center gap-2"><CheckCircle2 size={18} /> Redefinir senha</span>
                  }
                </Button>
              </form>
            </Form>
          </>
        )}
      </div>
    </div>
  );
}

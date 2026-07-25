// Página "Esqueci minha senha": pede o e-mail e dispara o link de redefinição.
// Sempre mostra a mesma mensagem de sucesso (exista o e-mail ou não), igual o
// backend faz — evita revelar quais e-mails têm conta.
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useForgotPassword } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const forgotPasswordSchema = z.object({
  email: z.string().email("E-mail inválido"),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const forgotMutation = useForgotPassword();

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = (values: ForgotPasswordValues) => {
    forgotMutation.mutate({ data: values }, { onSuccess: () => setSent(true) });
  };

  return (
    <div className="min-h-screen bg-background dark text-foreground flex items-center justify-center p-6 relative">
      <div className="absolute top-4 left-4 z-20">
        <Link href="/login">
          <Button variant="ghost" size="icon" className="text-white/70 hover:text-white hover:bg-white/10">
            <ArrowLeft size={20} />
          </Button>
        </Link>
      </div>

      <div className="w-full max-w-sm space-y-6">
        {sent ? (
          <div className="text-center space-y-4">
            <MailCheck size={48} className="text-primary mx-auto" />
            <h1 className="text-xl font-black uppercase">Verifique seu e-mail</h1>
            <p className="text-sm text-muted-foreground">
              Se <strong>{form.getValues("email")}</strong> estiver cadastrado, enviamos um link para redefinir sua senha.
            </p>
            <Link href="/login">
              <Button variant="outline" className="w-full">Voltar ao login</Button>
            </Link>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter">Esqueci minha senha</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Digite o e-mail da sua conta — vamos enviar um link para você redefinir a senha.
              </p>
            </div>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider font-bold text-muted-foreground">E-mail</FormLabel>
                      <FormControl>
                        <Input placeholder="lutador@academia.com" className="h-12 bg-card/50 border-border focus-visible:ring-primary" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full h-12 text-lg font-bold uppercase tracking-wide" disabled={forgotMutation.isPending}>
                  {forgotMutation.isPending ? "Enviando..." : "Enviar link de redefinição"}
                </Button>
              </form>
            </Form>
          </>
        )}
      </div>
    </div>
  );
}

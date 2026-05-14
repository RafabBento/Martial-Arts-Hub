import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "../contexts/AuthContext";
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
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();
  const { toast } = useToast();
  const loginMutation = useLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          setUser(data.user);
          setLocation("/dashboard");
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Falha no login",
            description: error.message || "Credenciais inválidas. Tente novamente.",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background dark text-foreground flex relative overflow-hidden">
      {/* Marca d'água em tela cheia */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <img src="/logo-thai.png" alt="" aria-hidden className="w-[70vmin] h-[70vmin] object-contain opacity-[0.06]" />
      </div>

      {/* Lado esquerdo — imagem */}
      <div className="hidden lg:flex flex-1 relative bg-zinc-900 overflow-hidden z-10">
        <div className="absolute inset-0 bg-[url('/bg-login-v2.png')] bg-cover bg-center opacity-80"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-background to-transparent"></div>
        <div className="relative z-10 flex flex-col justify-end p-12 w-full">
          <h2 className="text-5xl font-black uppercase tracking-tighter leading-tight text-white">
            Entre <br /> Na Arena
          </h2>
          <p className="mt-4 text-zinc-400 text-lg max-w-md">
            Acesse sua conta para acompanhar seu progresso, ver seu ranking e gerenciar seus treinos.
          </p>
        </div>
      </div>

      {/* Lado direito — formulário */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24 relative z-10">
        <div className="w-full max-w-sm mx-auto space-y-8">
          <div className="lg:hidden">
            <h1 className="text-3xl font-black uppercase tracking-tighter">Bem-vindo de volta</h1>
          </div>

          <h1 className="text-3xl font-black uppercase tracking-tighter hidden lg:block">Entrar</h1>

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
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Senha</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" className="h-12 bg-card/50 border-border focus-visible:ring-primary" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full h-12 text-lg font-bold uppercase tracking-wide" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? "Autenticando..." : "Entrar"}
              </Button>
            </form>
          </Form>

          <p className="text-center text-sm text-muted-foreground">
            Não tem uma conta?{" "}
            <Link href="/register" className="text-primary font-bold hover:underline">
              Cadastre-se
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { useRegister } from "@workspace/api-client-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const registerSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  role: z.enum(["student", "teacher"]),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  paymentDay: z.coerce.number().min(1).max(31).optional(),
  modalityThai: z.boolean().optional(),
  modalityJiu: z.boolean().optional(),
  bollacha: z.boolean().optional(),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "student",
      phone: "",
      birthDate: "",
      paymentDay: undefined,
      modalityThai: false,
      modalityJiu: false,
      bollacha: false,
    },
  });

  const watchedRole = form.watch("role");

  const onSubmit = (values: RegisterFormValues) => {
    registerMutation.mutate(
      {
        data: {
          ...values,
          birthDate: values.birthDate || undefined,
          paymentDay: values.paymentDay || undefined,
          modalityThai: values.modalityThai ?? false,
          modalityJiu: values.modalityJiu ?? false,
          bollacha: values.bollacha ?? false,
        },
      },
      {
        onSuccess: (data) => {
          setUser(data.user);
          setLocation("/dashboard");
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Falha no cadastro",
            description: error.message || "Algo deu errado. Tente novamente.",
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

      {/* Botão voltar */}
      <div className="absolute top-4 left-4 z-20">
        <Link href="/">
          <Button variant="ghost" size="icon" className="text-white/70 hover:text-white hover:bg-white/10">
            <ArrowLeft size={20} />
          </Button>
        </Link>
      </div>

      {/* Lado esquerdo — formulário */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24 overflow-y-auto py-12 relative z-10">
        <div className="w-full max-w-sm mx-auto space-y-8">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Junte-se ao Clube</h1>
          <p className="text-muted-foreground">Cadastre-se para começar a acompanhar sua jornada nas artes marciais.</p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Nome Completo</FormLabel>
                    <FormControl>
                      <Input placeholder="João Silva" className="h-12 bg-card/50 border-border focus-visible:ring-primary" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider font-bold text-muted-foreground">E-mail</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="lutador@academia.com" className="h-12 bg-card/50 border-border focus-visible:ring-primary" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Telefone (Opcional)</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="(11) 99999-0000" className="h-12 bg-card/50 border-border focus-visible:ring-primary" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Data de Nascimento</FormLabel>
                    <FormControl>
                      <Input type="date" className="h-12 bg-card/50 border-border focus-visible:ring-primary" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="paymentDay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Dia de Pagamento da Mensalidade</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        placeholder="Ex: 10"
                        className="h-12 bg-card/50 border-border focus-visible:ring-primary"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                      />
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
                      <Input type="password" placeholder="••••••••" className="h-12 bg-card/50 border-border focus-visible:ring-primary" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Perfil</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 bg-card/50 border-border focus-visible:ring-primary">
                          <SelectValue placeholder="Selecione um perfil" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="student">Aluno</SelectItem>
                        <SelectItem value="teacher">Professor / Mestre</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Modalidades para professores */}
              {watchedRole === "teacher" && (
                <div className="space-y-3 rounded-lg border border-border bg-card/30 p-4">
                  <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Modalidades que leciona</p>
                  <FormField
                    control={form.control}
                    name="modalityThai"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange}
                            className="border-red-400 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600" />
                        </FormControl>
                        <FormLabel className="font-semibold cursor-pointer">Muay Thai</FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="modalityJiu"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange}
                            className="border-blue-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
                        </FormControl>
                        <FormLabel className="font-semibold cursor-pointer">Jiu-Jitsu</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Modalidades + clube Jiu para alunos */}
              {watchedRole === "student" && (
                <div className="space-y-3 rounded-lg border border-border bg-card/30 p-4">
                  <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Modalidades</p>
                  <FormField
                    control={form.control}
                    name="modalityThai"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange}
                            className="border-red-400 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600" />
                        </FormControl>
                        <FormLabel className="font-semibold cursor-pointer">Muay Thai</FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="modalityJiu"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange}
                            className="border-blue-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
                        </FormControl>
                        <FormLabel className="font-semibold cursor-pointer">Jiu-Jitsu</FormLabel>
                      </FormItem>
                    )}
                  />

                  {/* Clube de Jiu — só aparece quando Jiu está marcado */}
                  {form.watch("modalityJiu") && (
                    <div className="mt-3 pl-6 space-y-2 border-l-2 border-blue-500/30">
                      <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">Clube de Jiu-Jitsu</p>
                      <FormField
                        control={form.control}
                        name="bollacha"
                        render={({ field }) => (
                          <div className="space-y-2">
                            <label
                              className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                                !field.value ? "border-blue-500/50 bg-blue-500/10" : "border-border"
                              }`}
                              onClick={() => field.onChange(false)}
                            >
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${!field.value ? "border-blue-500 bg-blue-500" : "border-muted-foreground"}`}>
                                {!field.value && <div className="w-2 h-2 rounded-full bg-white" />}
                              </div>
                              <div>
                                <p className="text-sm font-semibold">Apenas Front Artes Marciais</p>
                                <p className="text-xs text-muted-foreground">Treina só na Front</p>
                              </div>
                            </label>
                            <label
                              className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                                field.value ? "border-blue-500/50 bg-blue-500/10" : "border-border"
                              }`}
                              onClick={() => field.onChange(true)}
                            >
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${field.value ? "border-blue-500 bg-blue-500" : "border-muted-foreground"}`}>
                                {field.value && <div className="w-2 h-2 rounded-full bg-white" />}
                              </div>
                              <div>
                                <p className="text-sm font-semibold">Front + Bollacha Wrestling BJJ</p>
                                <p className="text-xs text-muted-foreground">Membro dos dois times</p>
                              </div>
                            </label>
                          </div>
                        )}
                      />
                    </div>
                  )}
                </div>
              )}

              <Button type="submit" className="w-full h-12 text-lg font-bold uppercase tracking-wide mt-4" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Cadastrando..." : "Cadastrar"}
              </Button>
            </form>
          </Form>

          <p className="text-center text-sm text-muted-foreground">
            Já tem uma conta?{" "}
            <Link href="/login" className="text-primary font-bold hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>

      {/* Lado direito — imagem */}
      <div className="hidden lg:flex flex-1 relative bg-zinc-900 overflow-hidden z-10">
        <div className="absolute inset-0 bg-[url('/bg-register.jpg')] bg-cover bg-center opacity-80"></div>
        <div className="absolute inset-0 bg-gradient-to-l from-background to-transparent"></div>
        <div className="relative z-10 flex flex-col justify-end p-12 w-full text-right items-end">
          <h2 className="text-5xl font-black uppercase tracking-tighter leading-tight text-white text-right">
            Comprometa-se <br /> com a Grandeza
          </h2>
          <p className="mt-4 text-zinc-400 text-lg max-w-md text-right">
            Disciplina é tudo. Entre na Front Artes Marciais e acompanhe sua jornada nas artes marciais.
          </p>
        </div>
      </div>
    </div>
  );
}

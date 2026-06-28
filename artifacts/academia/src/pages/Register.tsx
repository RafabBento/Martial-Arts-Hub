// Página de cadastro de novos usuários (alunos e professores). Usa react-hook-form
// + zod para validar o formulário, exibe campos condicionais conforme o perfil e
// as modalidades escolhidas (prajied de Thai, faixa/grau de Jiu) e, ao concluir,
// autentica o usuário recém-criado e o leva ao dashboard.
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

// Graduações de Muay Thai (prajied) com cores primária/secundária da faixinha.
const PRAJIED_GRADES = [
  { value: "branco",                  label: "Branco",                  primary: "white",  secondary: null    },
  { value: "branco-ponta-vermelha",   label: "Branco ponta vermelha",   primary: "white",  secondary: "red"   },
  { value: "vermelha",                label: "Vermelha",                primary: "red",    secondary: null    },
  { value: "vermelha-ponta-amarela",  label: "Vermelha ponta amarela",  primary: "red",    secondary: "yellow"},
  { value: "amarela",                 label: "Amarela",                 primary: "yellow", secondary: null    },
  { value: "amarela-ponta-verde",     label: "Amarela ponta verde",     primary: "yellow", secondary: "green" },
  { value: "verde",                   label: "Verde",                   primary: "green",  secondary: null    },
  { value: "verde-ponta-azul",        label: "Verde ponta azul",        primary: "green",  secondary: "blue"  },
  { value: "azul",                    label: "Azul",                    primary: "blue",   secondary: null    },
  { value: "azul-ponta-preta",        label: "Azul ponta preta",        primary: "blue",   secondary: "black" },
  { value: "preta",                   label: "Preta",                   primary: "black",  secondary: null    },
];

// Mapa do prajied -> classes Tailwind (cor principal e ponta) para a faixinha.
const PRAJIED_MAP: Record<string, { primary: string; secondary?: string }> = {
  "branco":                 { primary: "bg-white" },
  "branco-ponta-vermelha":  { primary: "bg-white",     secondary: "bg-red-600"    },
  "vermelha":               { primary: "bg-red-600"    },
  "vermelha-ponta-amarela": { primary: "bg-red-600",   secondary: "bg-yellow-400" },
  "amarela":                { primary: "bg-yellow-400" },
  "amarela-ponta-verde":    { primary: "bg-yellow-400",secondary: "bg-green-600"  },
  "verde":                  { primary: "bg-green-600"  },
  "verde-ponta-azul":       { primary: "bg-green-600", secondary: "bg-blue-600"   },
  "azul":                   { primary: "bg-blue-600"   },
  "azul-ponta-preta":       { primary: "bg-blue-600",  secondary: "bg-gray-900"   },
  "preta":                  { primary: "bg-gray-900"   },
};

// Faixas de Jiu-Jitsu (cor, rótulo e classe de fundo para o seletor).
const JIU_COLORS = [
  { value: "white",  label: "Branca",  bg: "bg-white"      },
  { value: "blue",   label: "Azul",    bg: "bg-blue-600"   },
  { value: "purple", label: "Roxa",    bg: "bg-purple-600" },
  { value: "brown",  label: "Marrom",  bg: "bg-amber-800"  },
  { value: "black",  label: "Preta",   bg: "bg-gray-900"   },
];

// Unidades disponíveis para vínculo do usuário (com endereço de referência).
const UNIT_OPTIONS = [
  { value: "matriz",     label: "Front Matriz",       address: "Endereço atual" },
  { value: "panobianco", label: "Front Panobianco",   address: "R. Benjamin Pereira, 548" },
  { value: "upfitness",  label: "Front Up Fitness",   address: "Av. Gustavo Adolfo, 588" },
] as const;

// Esquema de validação (zod) do formulário de cadastro. Define obrigatórios
// (nome, e-mail, senha, perfil) e campos opcionais de contato/modalidade/graduação.
const registerSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  role: z.enum(["student", "teacher"]),
  unit: z.enum(["matriz", "panobianco", "upfitness"]).default("matriz"),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  paymentDay: z.coerce.number().min(1).max(31).optional(),
  modalityThai: z.boolean().optional(),
  modalityJiu: z.boolean().optional(),
  bollacha: z.boolean().optional(),
  thaiGrade: z.string().optional(),
  thaiGradeColor: z.string().optional(),
  jiuGrade: z.string().optional(),
  jiuGradeColor: z.string().optional(),
  jiuDegree: z.number().min(1).max(4).optional(),
});

// Tipo inferido dos valores do formulário a partir do esquema zod.
type RegisterFormValues = z.infer<typeof registerSchema>;

export default function Register() {
  const [, setLocation] = useLocation();   // navegação após o cadastro
  const { setUser } = useAuth();           // grava o usuário autenticado no contexto
  const { toast } = useToast();
  const registerMutation = useRegister();  // mutation de criação de conta

  // Inicializa o formulário com validação zod e valores padrão.
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "student",
      unit: "matriz",
      phone: "",
      birthDate: "",
      paymentDay: undefined,
      modalityThai: false,
      modalityJiu: false,
      bollacha: false,
      thaiGrade: undefined,
      thaiGradeColor: undefined,
      jiuGrade: undefined,
      jiuGradeColor: undefined,
      jiuDegree: undefined,
    },
  });

  // Observa campos que controlam a exibição condicional de seções do formulário.
  const watchedRole = form.watch("role");          // perfil escolhido (aluno/professor)
  const watchedThai = form.watch("modalityThai");  // se Muay Thai está marcado
  const watchedJiu = form.watch("modalityJiu");    // se Jiu-Jitsu está marcado
  const watchedJiuDegree = form.watch("jiuDegree");// grau de Jiu selecionado

  // Envia o cadastro normalizando os campos opcionais (string vazia -> undefined,
  // booleanos com fallback). Em caso de sucesso, autentica e vai ao dashboard;
  // em caso de erro, exibe um toast.
  const onSubmit = (values: RegisterFormValues) => {
    registerMutation.mutate(
      {
        data: {
          ...values,
          unit: values.unit ?? "matriz",
          birthDate: values.birthDate || undefined,
          paymentDay: values.paymentDay || undefined,
          modalityThai: values.modalityThai ?? false,
          modalityJiu: values.modalityJiu ?? false,
          bollacha: values.bollacha ?? false,
          thaiGrade: values.thaiGrade || undefined,
          thaiGradeColor: values.thaiGradeColor || undefined,
          jiuGrade: values.jiuGrade || undefined,
          jiuGradeColor: values.jiuGradeColor || undefined,
          jiuDegree: values.jiuDegree || undefined,
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
      {/* Logo de fundo decorativa (não interativa) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <img src="/logo-thai.png" alt="" aria-hidden className="w-[70vmin] h-[70vmin] object-contain opacity-[0.06]" />
      </div>

      <div className="absolute top-4 left-4 z-20">
        <Link href="/">
          <Button variant="ghost" size="icon" className="text-white/70 hover:text-white hover:bg-white/10">
            <ArrowLeft size={20} />
          </Button>
        </Link>
      </div>

      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24 overflow-y-auto py-12 relative z-10">
        <div className="w-full max-w-sm mx-auto space-y-8">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Junte-se ao Clube</h1>
          <p className="text-muted-foreground">Cadastre-se para começar a acompanhar sua jornada nas artes marciais.</p>

          {/* Formulário de cadastro com campos validados via react-hook-form */}
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
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Unidade</FormLabel>
                    <div className="grid grid-cols-1 gap-2">
                      {UNIT_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            field.value === opt.value
                              ? "border-primary/60 bg-primary/10"
                              : "border-border hover:border-border/80"
                          }`}
                          onClick={() => field.onChange(opt.value)}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            field.value === opt.value ? "border-primary bg-primary" : "border-muted-foreground"
                          }`}>
                            {field.value === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{opt.label}</p>
                            <p className="text-xs text-muted-foreground">{opt.address}</p>
                          </div>
                        </label>
                      ))}
                    </div>
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

              {/* Modalidades + graduação para alunos */}
              {watchedRole === "student" && (
                <div className="space-y-4 rounded-lg border border-border bg-card/30 p-4">
                  <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Modalidades</p>

                  {/* Muay Thai */}
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

                  {/* Prajied — aparece quando Muay Thai está marcado */}
                  {watchedThai && (
                    <div className="pl-6 border-l-2 border-red-500/30 space-y-2">
                      <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Prajied (opcional)</p>
                      <FormField
                        control={form.control}
                        name="thaiGrade"
                        render={({ field }) => (
                          <FormItem>
                            <Select
                              value={field.value ?? ""}
                              onValueChange={(v) => {
                                field.onChange(v);
                                const entry = PRAJIED_GRADES.find(p => p.value === v);
                                form.setValue("thaiGradeColor", entry?.primary ?? "");
                              }}
                            >
                              <FormControl>
                                <SelectTrigger className="h-10 bg-card/50 border-border focus-visible:ring-primary text-sm">
                                  <SelectValue placeholder="Selecionar prajied..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {PRAJIED_GRADES.map((p, i) => (
                                  <SelectItem key={p.value} value={p.value}>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                                      {p.secondary ? (
                                        <span className="inline-flex h-2.5 w-10 rounded-full overflow-hidden border border-white/20 shrink-0">
                                          <span className={`flex-1 ${PRAJIED_MAP[p.value]?.primary}`} />
                                          <span className={`w-3 ${PRAJIED_MAP[p.value]?.secondary}`} />
                                        </span>
                                      ) : (
                                        <span className={`inline-block h-2.5 w-10 rounded-full border border-white/20 shrink-0 ${PRAJIED_MAP[p.value]?.primary}`} />
                                      )}
                                      <span>{p.label}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* Jiu-Jitsu */}
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

                  {/* Faixa + Grau + Clube — aparece quando Jiu está marcado */}
                  {watchedJiu && (
                    <div className="pl-6 border-l-2 border-blue-500/30 space-y-3">
                      <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">Graduação Jiu-Jitsu (opcional)</p>

                      {/* Faixa */}
                      <FormField
                        control={form.control}
                        name="jiuGradeColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">Faixa</FormLabel>
                            <Select
                              value={field.value ?? ""}
                              onValueChange={(v) => {
                                field.onChange(v);
                                const entry = JIU_COLORS.find(c => c.value === v);
                                form.setValue("jiuGrade", entry?.label ?? "");
                              }}
                            >
                              <FormControl>
                                <SelectTrigger className="h-10 bg-card/50 border-border focus-visible:ring-primary text-sm">
                                  <SelectValue placeholder="Selecionar faixa..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {JIU_COLORS.map(c => (
                                  <SelectItem key={c.value} value={c.value}>
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-block h-2.5 w-10 rounded-full border border-white/20 shrink-0 ${c.bg}`} />
                                      <span>{c.label}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Grau 1-4 */}
                      <FormField
                        control={form.control}
                        name="jiuDegree"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">Grau</FormLabel>
                            <div className="flex gap-2">
                              {[1, 2, 3, 4].map((grau) => (
                                <button
                                  key={grau}
                                  type="button"
                                  onClick={() => field.onChange(field.value === grau ? undefined : grau)}
                                  className={`w-10 h-10 rounded-lg border text-sm font-bold transition-colors
                                    ${field.value === grau
                                      ? "bg-blue-600 border-blue-500 text-white"
                                      : "bg-card border-border text-muted-foreground hover:border-blue-500/50 hover:text-foreground"
                                    }`}
                                >
                                  {grau}
                                </button>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Clube de Jiu */}
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Clube</p>
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
                    </div>
                  )}
                </div>
              )}

              {/* Botão de envio: mostra estado de carregamento enquanto cadastra */}
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

      <div className="hidden lg:flex flex-1 relative bg-zinc-900 overflow-hidden z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(220,38,38,0.18),transparent_60%)]"></div>
        <div className="absolute inset-0 bg-gradient-to-l from-background to-transparent"></div>
        <div className="relative z-10 flex flex-col justify-between p-12 w-full text-right items-end">
          <div className="flex-1 flex items-center justify-center w-full">
            <img
              src="/logo-thai-clean.png"
              alt="Front Artes Marciais"
              className="w-[60%] max-w-sm object-contain drop-shadow-2xl"
            />
          </div>
          <div className="items-end">
            <h2 className="text-5xl font-black uppercase tracking-tighter leading-tight text-white text-right">
              Comprometa-se <br /> com a Grandeza
            </h2>
            <p className="mt-4 text-zinc-400 text-lg max-w-md text-right">
              Disciplina é tudo. Entre na Front Artes Marciais e acompanhe sua jornada nas artes marciais.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

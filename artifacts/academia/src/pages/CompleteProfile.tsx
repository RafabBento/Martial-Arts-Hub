// Tela de bloqueio para contas criadas antes do termo de saúde/responsabilidade
// existir. Enquanto o usuário (aluno, professor ou admin) não preencher esse
// termo, esta é a única tela que ele consegue ver — ver o gate em App.tsx
// (ProtectedRoute), que renderiza este componente no lugar de qualquer rota
// quando user.profileComplete é false.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCompleteProfile, useLogout } from "@workspace/api-client-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ShieldAlert, LogOut } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

// Calcula a idade a partir da data de nascimento (YYYY-MM-DD), na data atual.
function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// Só compara telefones se ambos estiverem preenchidos.
function samePhone(a: string, b: string): boolean {
  if (!a.trim() || !b.trim()) return false;
  const digits = (s: string) => s.replace(/\D/g, "");
  return digits(a) === digits(b);
}

// Mesmo esquema/validações do termo de saúde usado em Register.tsx.
const completeProfileSchema = z
  .object({
    phone: z.string().min(8, "Telefone é obrigatório"),
    birthDate: z.string().min(1, "Data de nascimento é obrigatória"),
    hasInjury: z.boolean().default(false),
    injuryDetails: z.string().optional(),
    hasCondition: z.boolean().default(false),
    conditionDetails: z.string().optional(),
    takesMedication: z.boolean().default(false),
    medicationDetails: z.string().optional(),
    emergencyContactName: z.string().min(2, "Informe o nome do contato de emergência"),
    emergencyContactPhone: z.string().min(8, "Informe o telefone do contato de emergência"),
    imageConsent: z.boolean().default(false),
    guardianName: z.string().optional(),
    guardianPhone: z.string().optional(),
    declarationAccepted: z.boolean().refine((v) => v === true, "É necessário aceitar a declaração para continuar"),
  })
  .superRefine((data, ctx) => {
    if (samePhone(data.emergencyContactPhone, data.phone)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["emergencyContactPhone"], message: "Não pode ser o mesmo telefone do próprio usuário" });
    }
    if (data.birthDate && calculateAge(data.birthDate) < 18) {
      if (!data.guardianName?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["guardianName"], message: "Obrigatório para menores de idade" });
      }
      if (!data.guardianPhone?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["guardianPhone"], message: "Obrigatório para menores de idade" });
      } else {
        if (samePhone(data.guardianPhone, data.phone)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["guardianPhone"], message: "Não pode ser o mesmo telefone do usuário" });
        }
        if (samePhone(data.guardianPhone, data.emergencyContactPhone)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["guardianPhone"], message: "Não pode ser o mesmo do contato de emergência" });
        }
      }
    }
  });

type CompleteProfileValues = z.infer<typeof completeProfileSchema>;

export default function CompleteProfile() {
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const completeMutation = useCompleteProfile();
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, { onSuccess: () => setUser(null) });
  };

  const form = useForm<CompleteProfileValues>({
    resolver: zodResolver(completeProfileSchema),
    defaultValues: {
      phone: user?.phone ?? "",
      birthDate: user?.birthDate ?? "",
      hasInjury: false,
      injuryDetails: "",
      hasCondition: false,
      conditionDetails: "",
      takesMedication: false,
      medicationDetails: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      imageConsent: false,
      guardianName: "",
      guardianPhone: "",
      declarationAccepted: false,
    },
  });

  const watchedBirthDate = form.watch("birthDate");
  const watchedHasInjury = form.watch("hasInjury");
  const watchedHasCondition = form.watch("hasCondition");
  const watchedTakesMedication = form.watch("takesMedication");
  const isMinor = !!watchedBirthDate && calculateAge(watchedBirthDate) < 18;

  const onSubmit = (values: CompleteProfileValues) => {
    completeMutation.mutate(
      {
        data: {
          ...values,
          injuryDetails: values.hasInjury ? values.injuryDetails || undefined : undefined,
          conditionDetails: values.hasCondition ? values.conditionDetails || undefined : undefined,
          medicationDetails: values.takesMedication ? values.medicationDetails || undefined : undefined,
          guardianName: isMinor ? values.guardianName : undefined,
          guardianPhone: isMinor ? values.guardianPhone : undefined,
        },
      },
      {
        onSuccess: (updated) => {
          setUser(updated);
          toast({ title: "Cadastro completo!", description: "Obrigado por preencher o termo de saúde." });
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Não foi possível concluir",
            description: error?.data?.error || error.message || "Algo deu errado. Tente novamente.",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background dark text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6 py-10">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={handleLogout} disabled={logoutMutation.isPending}>
            <LogOut size={14} /> Sair
          </Button>
        </div>
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldAlert size={26} className="text-primary" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tighter">Falta pouco, {user?.name?.split(" ")[0]}</h1>
          <p className="text-muted-foreground text-sm max-w-sm">
            Sua conta ainda não tem o termo de saúde e responsabilidade preenchido.
            É obrigatório preencher todas as informações abaixo para acessar a aplicação.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Telefone</FormLabel>
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

            <div className="space-y-4 rounded-lg border border-border bg-card/30 p-4">
              <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Saúde e Responsabilidade</p>

              <FormField
                control={form.control}
                name="hasInjury"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Possui alguma lesão ou limitação?</FormLabel>
                  </FormItem>
                )}
              />
              {watchedHasInjury && (
                <FormField
                  control={form.control}
                  name="injuryDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea placeholder="Descreva a lesão ou limitação" className="bg-card/50 border-border" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="hasCondition"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Possui alguma doença ou condição que deveríamos saber?</FormLabel>
                  </FormItem>
                )}
              />
              {watchedHasCondition && (
                <FormField
                  control={form.control}
                  name="conditionDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea placeholder="Descreva a doença ou condição" className="bg-card/50 border-border" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="takesMedication"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Faz uso de medicamento contínuo?</FormLabel>
                  </FormItem>
                )}
              />
              {watchedTakesMedication && (
                <FormField
                  control={form.control}
                  name="medicationDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea placeholder="Qual(is) medicamento(s)" className="bg-card/50 border-border" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="emergencyContactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Nome do contato de emergência</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome completo" className="h-11 bg-card/50 border-border" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="emergencyContactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Telefone do contato de emergência</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="(11) 99999-0000" className="h-11 bg-card/50 border-border" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Não pode ser o mesmo telefone do próprio usuário</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="imageConsent"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Autoriza o uso de imagens?</FormLabel>
                  </FormItem>
                )}
              />

              {isMinor && (
                <div className="space-y-3 pl-4 border-l-2 border-primary/30">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider">Dados do responsável (menor de idade)</p>
                  <FormField
                    control={form.control}
                    name="guardianName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Nome do responsável</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome completo" className="h-11 bg-card/50 border-border" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guardianPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Telefone do responsável</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="(11) 99999-0000" className="h-11 bg-card/50 border-border" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <FormField
                control={form.control}
                name="declarationAccepted"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-3 space-y-0 pt-2 border-t border-border">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer text-sm leading-snug">
                      {isMinor
                        ? "Li e declaro que estou deixando meu filho treinar com a Front."
                        : "Declaro que li e que as informações acima são verdadeiras."}
                    </FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" className="w-full h-12 text-lg font-bold uppercase tracking-wide" disabled={completeMutation.isPending}>
              {completeMutation.isPending ? "Enviando..." : "Concluir cadastro"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useUpdateUser, useListAttendance, useGetStudent, useListPayments, registerProfilePhoto, getListAttendanceQueryKey, getListUsersQueryKey, getGetStudentQueryKey, getListPaymentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { User, Camera, Save, Shield, Gift, CreditCard, CheckCircle2, Clock, Copy, Loader2 } from "lucide-react";
import { uploadImageToStorage } from "../lib/uploadImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

import logoThai from "/logo-thai.png";
import logoJiu from "/logo-jiu.png";

type Modality = "thai" | "jiu";

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

const PRAJIED_LABELS: Record<string, string> = {
  "Branco": "branco", "Branco ponta vermelha": "branco-ponta-vermelha",
  "Vermelha": "vermelha", "Vermelha ponta amarela": "vermelha-ponta-amarela",
  "Amarela": "amarela", "Amarela ponta verde": "amarela-ponta-verde",
  "Verde": "verde", "Verde ponta azul": "verde-ponta-azul",
  "Azul": "azul", "Azul ponta preta": "azul-ponta-preta",
  "Preta": "preta",
};

const JIU_COLOR_MAP: Record<string, string> = {
  white: "bg-white", blue: "bg-blue-600", purple: "bg-purple-600",
  brown: "bg-amber-800", black: "bg-gray-900",
};

const PRAJIED_OPTIONS = [
  "Branco", "Branco ponta vermelha", "Vermelha", "Vermelha ponta amarela",
  "Amarela", "Amarela ponta verde", "Verde", "Verde ponta azul",
  "Azul", "Azul ponta preta", "Preta",
];

const JIU_GRADE_OPTIONS: { label: string; value: string; color: string }[] = [
  { label: "Branca", value: "Branca", color: "white" },
  { label: "Azul",   value: "Azul",   color: "blue"  },
  { label: "Roxa",   value: "Roxa",   color: "purple"},
  { label: "Marrom", value: "Marrom", color: "brown" },
  { label: "Preta",  value: "Preta",  color: "black" },
];

function PrajiedStripe({ grade }: { grade: string }) {
  const key = PRAJIED_LABELS[grade] ?? grade;
  const entry = PRAJIED_MAP[key];
  if (!entry) return null;
  if (!entry.secondary) {
    return <div className={`h-3 w-24 rounded-full border border-white/20 ${entry.primary}`} />;
  }
  return (
    <div className="h-3 w-24 rounded-full border border-white/20 overflow-hidden flex">
      <div className={`flex-1 ${entry.primary}`} />
      <div className={`w-6 ${entry.secondary}`} />
    </div>
  );
}

function JiuStripe({ color }: { color: string }) {
  return <div className={`h-3 w-24 rounded-full border border-white/20 ${JIU_COLOR_MAP[color] ?? "bg-muted"}`} />;
}

/** BJJ belt: colored body + black tip with degree stripes */
function JiuBeltWithDegree({ color, degree }: { color: string | null | undefined; degree?: number | null }) {
  if (!color) return null;
  const bg = JIU_COLOR_MAP[color] ?? "bg-muted";
  const stripes = Math.min(Math.max(degree ?? 0, 0), 4);
  const isWhite = color === "white";
  return (
    <div className={`flex h-5 w-28 rounded-sm overflow-hidden border ${isWhite ? "border-gray-400/50" : "border-white/15"}`}>
      <div className={`flex-1 relative ${bg}`}>
        <div className={`absolute inset-x-0 top-1/2 -translate-y-px h-px ${isWhite ? "bg-gray-300/40" : "bg-black/20"}`} />
      </div>
      <div className="w-7 bg-gray-900 flex items-center justify-center gap-0.5 shrink-0">
        {Array.from({ length: stripes }).map((_, i) => (
          <div key={i} className="w-0.5 h-3.5 bg-white/85 rounded-[1px]" />
        ))}
      </div>
    </div>
  );
}

function isBirthdayToday(birthDate: string | null | undefined): boolean {
  if (!birthDate) return false;
  const today = new Date();
  const [, month, day] = birthDate.split("-");
  return (
    parseInt(month, 10) === today.getMonth() + 1 &&
    parseInt(day, 10) === today.getDate()
  );
}

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function StudentPaymentCard({ userId, paymentDay }: { userId: number; paymentDay?: number | null }) {
  const { toast } = useToast();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: payments } = useListPayments(
    { month, year },
    { query: { queryKey: getListPaymentsQueryKey({ month, year }) } }
  );

  const myPayment = payments?.find(p => p.studentId === userId);
  const paid = myPayment?.paid ?? false;
  const paidDate = myPayment?.paidAt
    ? new Date(myPayment.paidAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })
    : null;

  const handleCopy = () => {
    navigator.clipboard.writeText("frontartesmarciais@gmail.com");
    toast({ title: "Chave PIX copiada!" });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard size={18} className="text-primary" />
        <h2 className="font-bold text-lg uppercase tracking-wide">Mensalidade</h2>
        <span className="ml-auto text-sm text-muted-foreground">{MONTHS[month - 1]} {year}</span>
      </div>

      {/* Status */}
      <div className={`flex items-center gap-3 rounded-lg p-4 border ${paid ? "bg-green-500/10 border-green-500/30" : "bg-primary/10 border-primary/30"}`}>
        {paid
          ? <CheckCircle2 size={22} className="text-green-400 shrink-0" />
          : <Clock size={22} className="text-primary shrink-0" />
        }
        <div>
          <div className={`font-bold ${paid ? "text-green-400" : "text-primary"}`}>
            {paid ? "Mensalidade paga!" : "Pagamento pendente"}
          </div>
          <div className="text-xs text-muted-foreground">
            {paid
              ? `Confirmado em ${paidDate}`
              : paymentDay
                ? `Vence dia ${paymentDay} de cada mês`
                : "Consulte o professor para informar sua data"
            }
          </div>
        </div>
      </div>

      {/* Dados de pagamento */}
      {!paid && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground font-medium">Dados para pagamento via PIX:</p>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm border border-border">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor</span>
              <span className="font-black text-foreground text-base">R$ 80,00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Banco</span>
              <span>Caixa Econômica Federal</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Recebedor</span>
              <span>Ewerton Tadeu da Silva</span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground mb-0.5">Chave PIX (e-mail)</div>
              <div className="font-mono text-sm font-semibold truncate">frontartesmarciais@gmail.com</div>
            </div>
            <Button size="sm" variant="outline" onClick={handleCopy} className="shrink-0 gap-2">
              <Copy size={14} /> Copiar
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Após efetuar o pagamento, envie o comprovante no privado para o professor confirmar.
          </p>
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { user, setUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [unit, setUnit] = useState<"matriz" | "panobianco" | "upfitness">(user?.unit ?? "matriz");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [birthDate, setBirthDate] = useState(user?.birthDate ?? "");
  const [paymentDay, setPaymentDay] = useState<number | "">(user?.paymentDay ?? "");
  const [editThaiGrade, setEditThaiGrade] = useState(user?.thaiGrade ?? "");
  const [editThaiGradeColor, setEditThaiGradeColor] = useState(user?.thaiGradeColor ?? "");
  const [editJiuGrade, setEditJiuGrade] = useState(user?.jiuGrade ?? "");
  const [editJiuGradeColor, setEditJiuGradeColor] = useState(user?.jiuGradeColor ?? "");
  const [editJiuDegree, setEditJiuDegree] = useState<number>(user?.jiuDegree ?? 0);
  const [modality, setModality] = useState<Modality>("thai");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateMutation = useUpdateUser();

  const { data: studentData } = useGetStudent(user?.id ?? 0, {
    query: { enabled: !!user?.id && user?.role === "student", queryKey: getGetStudentQueryKey(user?.id ?? 0) },
  });

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "admin";

  const hasThai = isTeacherOrAdmin
    ? (user?.modalityThai ?? false)
    : (studentData?.modalityThai ?? false);
  const hasJiu = isTeacherOrAdmin
    ? (user?.modalityJiu ?? false)
    : (studentData?.modalityJiu ?? false);

  const showToggle  = hasThai && hasJiu;
  // Bollacha logo only for students who explicitly chose Front + Bollacha
  const isBollacha  = !isTeacherOrAdmin && (studentData?.bollacha === true);
  // Sempre mostra a logo da Bollacha no cabeçalho se o aluno for da equipe — independente da aba ativa
  const showJiuLogo = hasJiu && isBollacha;

  useEffect(() => {
    if (!isTeacherOrAdmin && studentData && !studentData.modalityThai && studentData.modalityJiu) {
      setModality("jiu");
    }
    if (isTeacherOrAdmin && !hasThai && hasJiu) {
      setModality("jiu");
    }
  }, [studentData, isTeacherOrAdmin, hasThai, hasJiu]);

  const { data: attendance } = useListAttendance(
    { studentId: user?.id, modality },
    {
      query: {
        enabled: !!user?.id && user.role === "student",
        queryKey: getListAttendanceQueryKey({ studentId: user?.id, modality }),
      },
    }
  );

  const handleSave = () => {
    if (!user) return;
    updateMutation.mutate(
      {
        id: user.id,
        data: {
          name: name || undefined,
          unit: unit,
          phone: phone || undefined,
          birthDate: birthDate || undefined,
          paymentDay: paymentDay !== "" ? paymentDay : undefined,
          ...(isTeacherOrAdmin && {
            thaiGrade: editThaiGrade || undefined,
            thaiGradeColor: editThaiGradeColor || undefined,
            jiuGrade: editJiuGrade || undefined,
            jiuGradeColor: editJiuGradeColor || undefined,
            jiuDegree: editJiuGrade ? editJiuDegree : undefined,
          }),
        },
      },
      {
        onSuccess: (updated) => {
          setUser(updated);
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          setEditing(false);
          toast({ title: "Perfil atualizado com sucesso" });
        },
        onError: () => toast({ title: "Erro ao atualizar perfil", variant: "destructive" }),
      }
    );
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingPhoto(true);
    try {
      const objectPath = await uploadImageToStorage(file);
      const result = await registerProfilePhoto({ userId: user.id, objectPath });
      setUser({ ...user, profilePhotoUrl: result.profilePhotoUrl });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      if (result.faceDetected) {
        toast({ title: "Foto de perfil atualizada", description: "Rosto detectado e cadastrado para reconhecimento." });
      } else {
        toast({
          title: "Foto salva, mas nenhum rosto foi detectado",
          description: "Envie uma foto nítida e de frente para o reconhecimento facial funcionar.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Erro ao enviar a foto", variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  if (!user) return null;

  const rolePt =
    user.role === "admin" ? "Administrador" : user.role === "teacher" ? "Professor" : "Aluno";

  const isToday = isBirthdayToday(user.birthDate);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">

      {/* Banner de aniversário */}
      {isToday && (
        <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-5 py-4 text-yellow-300">
          <Gift size={22} className="shrink-0" />
          <span className="font-bold">Feliz aniversário, {user.name.split(" ")[0]}! 🎂 A academia inteira te deseja um ótimo dia!</span>
        </div>
      )}

      {/* Cabeçalho: logos nas laterais, título no centro */}
      <div className="flex items-center gap-6">
        <img
          src={logoThai}
          alt="Front Artes Marciais"
          className="object-contain shrink-0"
          style={{ width: 140, height: 140, filter: "drop-shadow(0 0 10px rgba(0,0,0,0.8)) contrast(1.15)" }}
        />

        <div className="flex-1 text-center space-y-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight uppercase">Meu Perfil</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">Gerencie suas informações pessoais</p>
          </div>
          {showToggle && (
            <div className="flex gap-2 bg-card border border-border rounded-lg p-1 w-fit mx-auto">
              <Button
                data-testid="button-profile-thai"
                variant={modality === "thai" ? "default" : "ghost"}
                size="sm"
                onClick={() => setModality("thai")}
              >
                Muay Thai
              </Button>
              <Button
                data-testid="button-profile-jiu"
                variant={modality === "jiu" ? "default" : "ghost"}
                size="sm"
                onClick={() => setModality("jiu")}
              >
                Jiu-Jitsu
              </Button>
            </div>
          )}
        </div>

        <div className="shrink-0" style={{ width: 140, height: 140 }}>
          {showJiuLogo && (
            <img
              src={logoJiu}
              alt="Bollacha Wrestling BJJ"
              className="object-contain w-full h-full"
              style={{ filter: "drop-shadow(0 0 10px rgba(0,0,0,0.8)) contrast(1.15)" }}
            />
          )}
        </div>
      </div>

      {/* Dados do perfil */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-6">
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <div className="w-20 h-20 rounded-full bg-muted border-2 border-border overflow-hidden">
              {user.profilePhotoUrl ? (
                <img
                  src={user.profilePhotoUrl}
                  alt={user.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-black text-muted-foreground">
                  {user.name.charAt(0)}
                </div>
              )}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={handlePhotoChange}
              data-testid="input-profile-photo"
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
              aria-label="Alterar foto de perfil"
              data-testid="button-upload-photo"
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center border-2 border-card shadow-md hover:bg-primary/90 transition-colors disabled:opacity-70"
            >
              {uploadingPhoto ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            </button>
          </div>
          <div>
            <div className="text-2xl font-bold">{user.name}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-block px-3 py-0.5 rounded-full text-xs font-bold ${
                  user.role === "admin"
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                    : user.role === "teacher"
                    ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                    : "bg-primary/20 text-primary border border-primary/30"
                }`}
              >
                {rolePt}
              </span>
              <span
                className={`inline-block px-3 py-0.5 rounded-full text-xs font-bold ${
                  modality === "thai"
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                }`}
              >
                {modality === "thai" ? "MUAY THAI" : "JIU-JITSU"}
              </span>
            </div>
          </div>
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Nome</label>
              <Input
                data-testid="input-profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Unidade</label>
              <div className="grid grid-cols-1 gap-2">
                {([ 
                  { value: "matriz",     label: "Front Matriz",     address: "Endereço atual" },
                  { value: "panobianco", label: "Front Panobianco", address: "R. Benjamin Pereira, 548" },
                  { value: "upfitness",  label: "Front Up Fitness", address: "Av. Gustavo Adolfo, 588" },
                ] as const).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      unit === opt.value ? "border-primary/60 bg-primary/10" : "border-border"
                    }`}
                    onClick={() => setUnit(opt.value)}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      unit === opt.value ? "border-primary bg-primary" : "border-muted-foreground"
                    }`}>
                      {unit === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.address}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Telefone</label>
              <Input
                data-testid="input-profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-0000"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Data de Nascimento</label>
              <Input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Dia de Pagamento da Mensalidade</label>
              <Input
                type="number"
                min={1}
                max={31}
                placeholder="Ex: 10"
                value={paymentDay}
                onChange={(e) => setPaymentDay(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>

            {/* Campos de graduação para professores */}
            {isTeacherOrAdmin && (
              <div className="space-y-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <p className="text-xs font-bold uppercase tracking-widest text-red-400">Graduação — Muay Thai</p>
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={editThaiGrade}
                  onChange={(e) => {
                    const grade = e.target.value;
                    setEditThaiGrade(grade);
                    const key = PRAJIED_LABELS[grade];
                    if (key) {
                      const primaryClass = PRAJIED_MAP[key]?.primary ?? "";
                      const colorName = primaryClass.replace("bg-", "").split("-")[0];
                      setEditThaiGradeColor(colorName);
                    }
                  }}
                >
                  <option value="">Selecione o prajied</option>
                  {PRAJIED_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            )}
            {isTeacherOrAdmin && (
              <div className="space-y-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                <p className="text-xs font-bold uppercase tracking-widest text-blue-400">Graduação — Jiu-Jitsu</p>
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={editJiuGrade}
                  onChange={(e) => {
                    const opt = JIU_GRADE_OPTIONS.find((o) => o.value === e.target.value);
                    setEditJiuGrade(e.target.value);
                    setEditJiuGradeColor(opt?.color ?? "");
                  }}
                >
                  <option value="">Selecione a faixa</option>
                  {JIU_GRADE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {editJiuGrade && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs font-medium text-muted-foreground">Graus</span>
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setEditJiuDegree(n)}
                          className={`h-8 w-8 rounded-md border text-sm font-semibold transition-colors ${
                            editJiuDegree === n
                              ? "border-blue-500 bg-blue-500/20 text-blue-300"
                              : "border-border bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                data-testid="button-save-profile"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                <Save size={16} className="mr-2" />
                {updateMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Nome</span>
              <span>{user.name}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Email</span>
              <span>{user.email}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Telefone</span>
              <span>{user.phone ?? "Não informado"}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Aniversário</span>
              <span>
                {user.birthDate
                  ? new Date(user.birthDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })
                  : "Não informado"}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Dia de pagamento</span>
              <span>
                {user.paymentDay ? `Todo dia ${user.paymentDay}` : "Não informado"}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Unidade</span>
              <span>{{
                matriz:     "Front Matriz",
                panobianco: "Front Panobianco",
                upfitness:  "Front Up Fitness",
              }[user.unit] ?? user.unit}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Função</span>
              <span>{rolePt}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Membro desde</span>
              <span>{new Date(user.createdAt).toLocaleDateString("pt-BR")}</span>
            </div>
            <Button
              data-testid="button-edit-profile"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setName(user.name);
                setUnit(user.unit ?? "matriz");
                setPhone(user.phone ?? "");
                setBirthDate(user.birthDate ?? "");
                setPaymentDay(user.paymentDay ?? "");
                setEditThaiGrade(user.thaiGrade ?? "");
                setEditThaiGradeColor(user.thaiGradeColor ?? "");
                setEditJiuGrade(user.jiuGrade ?? "");
                setEditJiuGradeColor(user.jiuGradeColor ?? "");
                setEditJiuDegree(user.jiuDegree ?? 0);
                setEditing(true);
              }}
            >
              <User size={14} className="mr-2" /> Editar Perfil
            </Button>
          </div>
        )}
      </div>

      {/* Graduação — visível para todos */}
      {user.role === "student" ? (
        (studentData?.modalityThai || studentData?.modalityJiu) && (
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-primary" />
              <h2 className="font-bold text-lg uppercase tracking-wide">Minha Graduação</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {studentData.modalityThai && (
                <div className="bg-muted/40 rounded-lg p-4 space-y-2 border border-red-500/20">
                  <span className="text-xs font-bold uppercase tracking-widest text-red-400">Muay Thai</span>
                  {studentData.thaiGrade ? (
                    <>
                      <PrajiedStripe grade={studentData.thaiGrade} />
                      <p className="font-semibold text-sm">{studentData.thaiGrade}</p>
                      <p className="text-xs text-muted-foreground">Prajied</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Não atribuído</p>
                  )}
                </div>
              )}
              {studentData.modalityJiu && (
                <div className="bg-muted/40 rounded-lg p-4 space-y-2 border border-blue-500/20">
                  <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Jiu-Jitsu</span>
                  {studentData.jiuGrade ? (
                    <>
                      <JiuBeltWithDegree color={studentData.jiuGradeColor} degree={studentData.jiuDegree} />
                      <p className="font-semibold text-sm">Faixa {studentData.jiuGrade}</p>
                      {(studentData.jiuDegree ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground">{studentData.jiuDegree}º grau</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Não atribuída</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        /* Professores / Admins: graduação real + opção de editar via Editar Perfil */
        (
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-primary" />
              <h2 className="font-bold text-lg uppercase tracking-wide">Minha Graduação</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-muted/40 rounded-lg p-4 space-y-2 border border-red-500/20">
                <span className="text-xs font-bold uppercase tracking-widest text-red-400">Muay Thai</span>
                {user.thaiGrade ? (
                  <>
                    <PrajiedStripe grade={user.thaiGrade} />
                    <p className="font-semibold text-sm">{user.thaiGrade}</p>
                    <p className="text-xs text-muted-foreground">Prajied</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Não atribuído</p>
                )}
              </div>
              <div className="bg-muted/40 rounded-lg p-4 space-y-2 border border-blue-500/20">
                <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Jiu-Jitsu</span>
                {user.jiuGrade ? (
                  <>
                    <JiuBeltWithDegree color={user.jiuGradeColor} degree={user.jiuDegree} />
                    <p className="font-semibold text-sm">Faixa {user.jiuGrade}</p>
                    {(user.jiuDegree ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground">{user.jiuDegree}º grau</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Não atribuída</p>
                )}
              </div>
            </div>
          </div>
        )
      )}

      {/* Mensalidade — apenas alunos */}
      {user.role === "student" && <StudentPaymentCard userId={user.id} paymentDay={user.paymentDay} />}

      {/* Histórico de presenças — apenas alunos */}
      {user.role === "student" && (
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Camera size={18} className="text-primary" />
            <h2 className="font-bold text-lg uppercase tracking-wide">Histórico de Presenças</h2>
            <span
              className={`ml-2 text-xs font-bold px-2 py-0.5 rounded ${
                modality === "thai"
                  ? "bg-red-500/20 text-red-400"
                  : "bg-blue-500/20 text-blue-400"
              }`}
            >
              {modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"}
            </span>
            <span className="ml-auto text-sm text-muted-foreground">
              {attendance?.length ?? 0} treinos
            </span>
          </div>
          {attendance && attendance.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {attendance.map((rec) => (
                <div
                  key={rec.id}
                  data-testid={`row-my-att-${rec.id}`}
                  className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0 text-sm"
                >
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      rec.modality === "thai" ? "bg-red-400" : "bg-blue-400"
                    }`}
                  />
                  <span className="flex-1 text-muted-foreground">
                    {new Date(rec.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                  {rec.faceRecognized && (
                    <span className="text-xs text-green-400">Reconhecido</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhuma presença registrada em{" "}
              {modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

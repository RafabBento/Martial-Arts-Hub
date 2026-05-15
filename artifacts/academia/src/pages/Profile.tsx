import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useUpdateUser, useListAttendance, useGetStudent, getListAttendanceQueryKey, getListUsersQueryKey, getGetStudentQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { User, Camera, Save, Shield } from "lucide-react";
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

export default function Profile() {
  const { user, setUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [modality, setModality] = useState<Modality>("thai");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateMutation = useUpdateUser();

  const { data: studentData } = useGetStudent(user?.id ?? 0, {
    query: { enabled: !!user?.id && user?.role === "student", queryKey: getGetStudentQueryKey(user?.id ?? 0) },
  });

  const hasThai = user?.role !== "student" ? true : (studentData?.modalityThai ?? true);
  const hasJiu  = user?.role !== "student" ? true : (studentData?.modalityJiu  ?? false);
  const showToggle   = hasThai && hasJiu;
  const showJiuLogo  = hasJiu && (modality === "jiu" || !showToggle);

  useEffect(() => {
    if (studentData && !studentData.modalityThai && studentData.modalityJiu) {
      setModality("jiu");
    }
  }, [studentData]);

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
      { id: user.id, data: { name: name || undefined, phone: phone || undefined } },
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

  if (!user) return null;

  const rolePt =
    user.role === "admin" ? "Administrador" : user.role === "teacher" ? "Professor" : "Aluno";

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Cabeçalho: logos nas laterais, título no centro */}
      <div className="flex items-center gap-6">
        {/* Logo Thai — sempre visível */}
        <img
          src={logoThai}
          alt="Front Artes Marciais"
          className="object-contain shrink-0"
          style={{ width: 140, height: 140 }}
        />

        {/* Título e toggle — centro */}
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

        {/* Logo Jiu — visível quando showJiuLogo, espaço reservado caso contrário */}
        <div className="shrink-0" style={{ width: 140, height: 140 }}>
          {showJiuLogo && (
            <img
              src={logoJiu}
              alt="Bollacha Wrestling BJJ"
              className="object-contain w-full h-full"
            />
          )}
        </div>
      </div>

      {/* Dados do perfil */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-6">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-muted border-2 border-border overflow-hidden shrink-0">
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
              <label className="text-sm text-muted-foreground block mb-1">Telefone</label>
              <Input
                data-testid="input-profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-0000"
              />
            </div>
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
                setPhone(user.phone ?? "");
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
        /* Alunos: mostra prajied e/ou faixa conforme modalidades */
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
                      {studentData.jiuGradeColor && <JiuStripe color={studentData.jiuGradeColor} />}
                      <p className="font-semibold text-sm">Faixa {studentData.jiuGrade}</p>
                      <p className="text-xs text-muted-foreground">Faixa</p>
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
        /* Professores e admins: exibe papel e modalidades */
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-primary" />
            <h2 className="font-bold text-lg uppercase tracking-wide">Minha Graduação</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-muted/40 rounded-lg p-4 space-y-2 border border-red-500/20">
              <span className="text-xs font-bold uppercase tracking-widest text-red-400">Muay Thai</span>
              <p className="font-semibold text-sm">{rolePt}</p>
              <p className="text-xs text-muted-foreground">Função na academia</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-4 space-y-2 border border-blue-500/20">
              <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Jiu-Jitsu</span>
              <p className="font-semibold text-sm">{rolePt}</p>
              <p className="text-xs text-muted-foreground">Função na academia</p>
            </div>
          </div>
        </div>
      )}

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

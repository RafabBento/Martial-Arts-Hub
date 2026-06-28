// Página de perfil/detalhe de um aluno. Mostra dados pessoais, logos da equipe,
// cadastro facial (foto da galeria ou modal multiângulo), graduações editáveis
// (prajied de Thai e faixa/grau de Jiu) e o histórico de presenças por modalidade.
// Edições de graduação e cadastro facial só são permitidas para professor/admin.
import { useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetStudent, getGetStudentQueryKey,
  useListAttendance, getListAttendanceQueryKey,
  useUpdateStudent,
  getListStudentsQueryKey,
  registerProfilePhoto,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, CheckCircle, XCircle, Shield, ImagePlus, Loader2, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FaceEnrollModal } from "@/components/FaceEnrollModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "../contexts/AuthContext";
import { uploadImageToStorage } from "@/lib/uploadImage";
import logoThai from "/logo-thai.png";
import logoJiu from "/logo-jiu.png";

// Lista ordenada de graduações de Muay Thai (prajied), com cores primária e
// secundária (ponta) usadas para renderizar a faixinha.
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
// Faixas de Jiu-Jitsu (rótulos) e suas cores correspondentes.
const JIU_GRADES = ["Branca", "Azul", "Roxa", "Marrom", "Preta"];
const JIU_COLORS = [
  { value: "white", label: "Branca" },
  { value: "blue", label: "Azul" },
  { value: "purple", label: "Roxa" },
  { value: "brown", label: "Marrom" },
  { value: "black", label: "Preta" },
];

// Mapa do prajied -> classes Tailwind (cor principal e ponta) para a faixinha.
const PRAJIED_MAP: Record<string, { primary: string; secondary?: string }> = {
  "branco":                 { primary: "bg-white" },
  "branco-ponta-vermelha":  { primary: "bg-white",    secondary: "bg-red-600"   },
  "vermelha":               { primary: "bg-red-600"   },
  "vermelha-ponta-amarela": { primary: "bg-red-600",   secondary: "bg-yellow-400"},
  "amarela":                { primary: "bg-yellow-400" },
  "amarela-ponta-verde":    { primary: "bg-yellow-400",secondary: "bg-green-600" },
  "verde":                  { primary: "bg-green-600" },
  "verde-ponta-azul":       { primary: "bg-green-600", secondary: "bg-blue-600"  },
  "azul":                   { primary: "bg-blue-600"  },
  "azul-ponta-preta":       { primary: "bg-blue-600",  secondary: "bg-gray-900"  },
  "preta":                  { primary: "bg-gray-900"  },
};

// Mapa de cor da faixa de Jiu -> classe Tailwind de fundo.
const JIU_COLOR_MAP: Record<string, string> = {
  white: "bg-white", blue: "bg-blue-600", purple: "bg-purple-600",
  brown: "bg-amber-800", black: "bg-gray-900",
};

// Faixinha visual do prajied; desenha a ponta secundária quando existir.
function PrajiedStripe({ grade }: { grade: string }) {
  const entry = PRAJIED_MAP[grade];
  if (!entry) return null;
  if (!entry.secondary) {
    return <div className={`h-2.5 w-20 rounded-full border border-white/20 ${entry.primary}`} />;
  }
  return (
    <div className="h-2.5 w-20 rounded-full border border-white/20 overflow-hidden flex">
      <div className={`flex-1 ${entry.primary}`} />
      <div className={`w-5 ${entry.secondary}`} />
    </div>
  );
}

/** BJJ belt: colored body + black tip with degree stripes */
// Faixa de Jiu visual: corpo colorido + ponta preta com os graus (até 4 listras).
function BeltStripe({ color, degree }: { color: string; degree?: number | null }) {
  const bg = JIU_COLOR_MAP[color] ?? "bg-muted";
  const stripes = Math.min(Math.max(degree ?? 0, 0), 4);  // limita o grau ao intervalo 0..4
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

export default function StudentDetail() {
  const [, params] = useRoute("/students/:id");                       // captura o :id da rota
  const [, setLocation] = useLocation();                             // navegação programática
  const studentId = params ? parseInt(params.id, 10) : 0;            // id numérico do aluno
  const [activeModality, setActiveModality] = useState<"thai" | "jiu">("thai"); // aba ativa (Thai/Jiu)
  const [faceUploading, setFaceUploading] = useState(false);        // estado de envio de foto da galeria
  const [enrollOpen, setEnrollOpen] = useState(false);              // controla o modal de cadastro facial
  const faceInputRef = useRef<HTMLInputElement>(null);              // ref do input de arquivo oculto
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Apenas professor/admin podem editar graduações e cadastrar rosto.
  const isMaster = user?.role === "teacher" || user?.role === "admin";

  // Envia uma foto escolhida da galeria: faz upload, registra como foto de perfil
  // (com tentativa de detecção facial) e revalida os dados do aluno. Avisa o
  // usuário se nenhum rosto foi detectado na imagem.
  const handleGalleryFace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFaceUploading(true);
    try {
      const objectPath = await uploadImageToStorage(file);
      const result = await registerProfilePhoto({ userId: studentId, objectPath });
      queryClient.invalidateQueries({ queryKey: getGetStudentQueryKey(studentId) });
      queryClient.invalidateQueries({ queryKey: getListStudentsQueryKey() });
      if (result.faceDetected) {
        toast({ title: "Foto e rosto cadastrados com sucesso!" });
      } else {
        toast({
          title: "Foto salva, mas nenhum rosto foi detectado",
          description: "Use uma foto nítida e de frente para o reconhecimento.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Erro ao enviar a foto", variant: "destructive" });
    } finally {
      setFaceUploading(false);
      if (faceInputRef.current) faceInputRef.current.value = "";
    }
  };

  // Busca os dados completos do aluno.
  const { data: student, isLoading } = useGetStudent(studentId, {
    query: { enabled: !!studentId, queryKey: getGetStudentQueryKey(studentId) }
  });

  // Histórico de presenças do aluno na modalidade ativa.
  const { data: attendance } = useListAttendance(
    { studentId, modality: activeModality },
    { query: { enabled: !!studentId, queryKey: getListAttendanceQueryKey({ studentId, modality: activeModality }) } }
  );

  const updateStudentMutation = useUpdateStudent();

  // Atualiza um campo de graduação genérico (faixa, cor ou grau) e revalida os dados.
  const handleGradeUpdate = (field: string, value: string | number | null) => {
    if (!studentId) return;
    updateStudentMutation.mutate(
      { id: studentId, data: { [field]: value } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetStudentQueryKey(studentId) });
          queryClient.invalidateQueries({ queryKey: getListStudentsQueryKey() });
          toast({ title: "Graduação atualizada com sucesso" });
        },
        onError: () => toast({ title: "Erro ao atualizar graduação", variant: "destructive" }),
      }
    );
  };

  // Atualiza o prajied (Muay Thai): converte o valor escolhido em rótulo + cor
  // primária e salva ambos no aluno.
  const handleThaiPrajied = (value: string) => {
    if (!studentId) return;
    const entry = PRAJIED_GRADES.find(p => p.value === value);
    if (!entry) return;
    updateStudentMutation.mutate(
      { id: studentId, data: { thaiGrade: entry.label, thaiGradeColor: entry.primary } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetStudentQueryKey(studentId) });
          queryClient.invalidateQueries({ queryKey: getListStudentsQueryKey() });
          toast({ title: "Prajied atualizado com sucesso" });
        },
        onError: () => toast({ title: "Erro ao atualizar prajied", variant: "destructive" }),
      }
    );
  };

  // Spinner enquanto carrega os dados do aluno.
  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  // Mensagem caso o aluno não exista.
  if (!student) {
    return <div className="text-center py-20 text-muted-foreground">Aluno nao encontrado</div>;
  }

  // Exibe o alternador de modalidade somente quando o aluno pratica as duas.
  const showToggle = student.modalityThai && student.modalityJiu;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/students")} data-testid="button-back">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-2xl font-black uppercase">Perfil do Aluno</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna esquerda: foto, identidade, logos, cadastro facial e contadores */}
        <div className="bg-card border border-border rounded-lg p-6 flex flex-col items-center gap-4">
          <div className="w-28 h-28 rounded-full bg-muted border-2 border-border overflow-hidden">
            {student.profilePhotoUrl
              ? <img src={student.profilePhotoUrl} alt={student.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-4xl font-black text-muted-foreground">{student.name.charAt(0)}</div>
            }
          </div>
          <div className="text-center">
            <div className="text-xl font-bold">{student.name}</div>
            <div className="text-sm text-muted-foreground">{student.email}</div>
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            {student.modalityThai && <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-sm font-bold">MUAY THAI</span>}
            {student.modalityJiu && <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-sm font-bold">JIU-JITSU</span>}
          </div>

          {/* Logos da equipe conforme modalidade ativa */}
          {(() => {
            const isBollacha = student.bollacha === true;
            const showJiuLogo = student.modalityJiu && isBollacha && (activeModality === "jiu" || !showToggle);
            return (
              <div className="flex items-center justify-center gap-5">
                {(student.modalityThai || student.modalityJiu) && (
                  <img src={logoThai} alt="Front Artes Marciais" className="object-contain" style={{ width: 88, height: 88, filter: "drop-shadow(0 0 6px rgba(0,0,0,0.8)) contrast(1.15)" }} />
                )}
                {showJiuLogo && (
                  <img src={logoJiu} alt="Bollacha Wrestling BJJ" className="object-contain" style={{ width: 88, height: 88, filter: "drop-shadow(0 0 6px rgba(0,0,0,0.8)) contrast(1.15)" }} />
                )}
              </div>
            );
          })()}

          {/* Status do cadastro facial + ações (somente master): modal multiângulo ou upload da galeria */}
          <div className="w-full pt-3 border-t border-border space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {student.hasFaceDescriptor
                ? <><CheckCircle size={16} className="text-green-400" /><span className="text-green-400">Rosto cadastrado</span></>
                : <><XCircle size={16} className="text-muted-foreground" /><span className="text-muted-foreground">Rosto não cadastrado</span></>
              }
            </div>
            {isMaster && (
              <>
                <input
                  ref={faceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleGalleryFace}
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={faceUploading}
                  onClick={() => setEnrollOpen(true)}
                >
                  <ScanFace size={14} className="mr-2" />
                  {student.hasFaceDescriptor ? "Refazer cadastro facial" : "Cadastrar rosto (vários ângulos)"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={faceUploading}
                  onClick={() => faceInputRef.current?.click()}
                >
                  {faceUploading
                    ? <><Loader2 size={14} className="animate-spin mr-2" />Processando...</>
                    : <><ImagePlus size={14} className="mr-2" />Enviar foto da galeria</>
                  }
                </Button>
              </>
            )}
          </div>

          <div className="w-full space-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between"><span>Presencas Thai</span><span className="font-bold text-foreground">{student.totalAttendanceThai}</span></div>
            <div className="flex justify-between"><span>Presencas Jiu</span><span className="font-bold text-foreground">{student.totalAttendanceJiu}</span></div>
          </div>
        </div>

        {/* Coluna direita: alternador de modalidade, graduações e histórico */}
        <div className="lg:col-span-2 space-y-4">
          {/* Alternador entre Muay Thai e Jiu-Jitsu (só quando pratica ambas) */}
          {showToggle && (
            <div className="flex gap-2 bg-card border border-border rounded-lg p-1 w-fit">
              <Button
                data-testid="button-toggle-thai"
                variant={activeModality === "thai" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveModality("thai")}
              >
                Muay Thai
              </Button>
              <Button
                data-testid="button-toggle-jiu"
                variant={activeModality === "jiu" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveModality("jiu")}
              >
                Jiu-Jitsu
              </Button>
            </div>
          )}

          {/* Bloco de graduação: seção de Muay Thai e/ou Jiu conforme modalidade ativa */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-primary" />
              <h2 className="font-bold text-lg uppercase tracking-wide">Graduacao</h2>
            </div>

            {/* Seção de prajied (Muay Thai) — editável só por master */}
            {(activeModality === "thai" || !showToggle) && student.modalityThai && (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Muay Thai</div>
                {student.thaiGrade && <PrajiedStripe grade={
                  PRAJIED_GRADES.find(p => p.label === student.thaiGrade)?.value ?? student.thaiGrade
                } />}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Prajied
                    {!isMaster && <span className="ml-1 text-[10px] text-primary/70">(somente mestre)</span>}
                  </label>
                  <Select
                    value={PRAJIED_GRADES.find(p => p.label === student.thaiGrade)?.value ?? student.thaiGrade ?? ""}
                    onValueChange={handleThaiPrajied}
                    disabled={!isMaster}
                  >
                    <SelectTrigger data-testid="select-thai-grade" disabled={!isMaster}>
                      <SelectValue placeholder="Selecionar prajied..." />
                    </SelectTrigger>
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
                </div>
              </div>
            )}

            {/* Seção de faixa/cor/grau (Jiu-Jitsu) — editável só por master */}
            {(activeModality === "jiu" || !showToggle) && student.modalityJiu && (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Jiu-Jitsu</div>
                {student.jiuGradeColor && (
                  <BeltStripe color={student.jiuGradeColor} degree={student.jiuDegree} />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Faixa</label>
                    <Select value={student.jiuGrade ?? ""} onValueChange={(v) => handleGradeUpdate("jiuGrade", v)} disabled={!isMaster}>
                      <SelectTrigger data-testid="select-jiu-grade" disabled={!isMaster}><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                      <SelectContent>
                        {JIU_GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Cor da Faixa</label>
                    <Select value={student.jiuGradeColor ?? ""} onValueChange={(v) => handleGradeUpdate("jiuGradeColor", v)} disabled={!isMaster}>
                      <SelectTrigger data-testid="select-jiu-color" disabled={!isMaster}><SelectValue placeholder="Cor..." /></SelectTrigger>
                      <SelectContent>
                        {JIU_COLORS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Grau
                    {!isMaster && <span className="ml-1 text-[10px] text-primary/70">(somente mestre)</span>}
                  </label>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3, 4].map((grau) => (
                      <button
                        key={grau}
                        disabled={!isMaster}
                        onClick={() => isMaster && handleGradeUpdate("jiuDegree", grau === 0 ? null : grau)}
                        className={`w-10 h-10 rounded-lg border text-sm font-bold transition-colors
                          ${(student.jiuDegree ?? 0) === grau
                            ? "bg-blue-600 border-blue-500 text-white"
                            : "bg-card border-border text-muted-foreground hover:border-blue-500/50 hover:text-foreground"}
                          ${!isMaster ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        {grau === 0 ? "—" : grau}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Histórico de presenças da modalidade ativa (lista rolável ou estado vazio) */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Camera size={18} className="text-primary" />
              <h2 className="font-bold text-lg uppercase tracking-wide">Historico de Presencas</h2>
              {showToggle && (
                <span className={`ml-auto text-xs px-2 py-0.5 rounded font-bold ${activeModality === "thai" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>
                  {activeModality === "thai" ? "Muay Thai" : "Jiu-Jitsu"}
                </span>
              )}
            </div>
            {attendance && attendance.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {attendance.map((rec) => (
                  <div key={rec.id} data-testid={`row-attendance-${rec.id}`} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${rec.faceRecognized ? "bg-green-400" : "bg-muted-foreground"}`} />
                    <div className="flex-1 text-sm">{new Date(rec.createdAt).toLocaleString("pt-BR")}</div>
                    {rec.faceRecognized && <span className="text-xs text-green-400">Reconhecido</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma presenca registrada</div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de cadastro facial multiângulo; ao concluir revalida os dados do aluno */}
      <FaceEnrollModal
        open={enrollOpen}
        userId={studentId}
        title="Cadastro facial do aluno"
        onClose={() => setEnrollOpen(false)}
        onDone={() => {
          queryClient.invalidateQueries({ queryKey: getGetStudentQueryKey(studentId) });
          queryClient.invalidateQueries({ queryKey: getListStudentsQueryKey() });
          toast({ title: "Cadastro facial concluído!" });
        }}
      />
    </div>
  );
}

import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetStudent, getGetStudentQueryKey,
  useListAttendance, getListAttendanceQueryKey,
  useUpdateStudent,
  getListStudentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, CheckCircle, XCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const THAI_GRADES = ["Iniciante", "Intermediario", "Avancado", "Instrutor", "Kru"];
const THAI_COLORS = [
  { value: "white", label: "Branco" },
  { value: "yellow", label: "Amarelo" },
  { value: "orange", label: "Laranja" },
  { value: "green", label: "Verde" },
  { value: "blue", label: "Azul" },
  { value: "red", label: "Vermelho" },
  { value: "black", label: "Preto" },
];
const JIU_GRADES = ["Branca", "Azul", "Roxa", "Marrom", "Preta"];
const JIU_COLORS = [
  { value: "white", label: "Branca" },
  { value: "blue", label: "Azul" },
  { value: "purple", label: "Roxa" },
  { value: "brown", label: "Marrom" },
  { value: "black", label: "Preta" },
];

function BeltStripe({ color }: { color: string }) {
  const colorMap: Record<string, string> = {
    white: "bg-white",
    blue: "bg-blue-600",
    purple: "bg-purple-600",
    brown: "bg-amber-800",
    black: "bg-gray-900",
    yellow: "bg-yellow-400",
    orange: "bg-orange-500",
    red: "bg-red-600",
    green: "bg-green-600",
  };
  return <div className={`h-2 w-16 rounded-full ${colorMap[color] ?? "bg-muted"}`} />;
}

export default function StudentDetail() {
  const [, params] = useRoute("/students/:id");
  const [, setLocation] = useLocation();
  const studentId = params ? parseInt(params.id, 10) : 0;
  const [activeModality, setActiveModality] = useState<"thai" | "jiu">("thai");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: student, isLoading } = useGetStudent(studentId, {
    query: { enabled: !!studentId, queryKey: getGetStudentQueryKey(studentId) }
  });

  const { data: attendance } = useListAttendance(
    { studentId, modality: activeModality },
    { query: { enabled: !!studentId, queryKey: getListAttendanceQueryKey({ studentId, modality: activeModality }) } }
  );

  const updateStudentMutation = useUpdateStudent();

  const handleGradeUpdate = (field: string, value: string) => {
    if (!studentId) return;
    updateStudentMutation.mutate(
      { id: studentId, data: { [field]: value } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetStudentQueryKey(studentId) });
          queryClient.invalidateQueries({ queryKey: getListStudentsQueryKey() });
          toast({ title: "Graduacao atualizada com sucesso" });
        },
        onError: () => toast({ title: "Erro ao atualizar graduacao", variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!student) {
    return <div className="text-center py-20 text-muted-foreground">Aluno nao encontrado</div>;
  }

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

          <div className="w-full pt-3 border-t border-border">
            <div className="flex items-center gap-2 text-sm">
              {student.hasFaceDescriptor
                ? <><CheckCircle size={16} className="text-green-400" /><span className="text-green-400">Rosto cadastrado</span></>
                : <><XCircle size={16} className="text-muted-foreground" /><span className="text-muted-foreground">Rosto nao cadastrado</span></>
              }
            </div>
          </div>

          <div className="w-full space-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between"><span>Presencas Thai</span><span className="font-bold text-foreground">{student.totalAttendanceThai}</span></div>
            <div className="flex justify-between"><span>Presencas Jiu</span><span className="font-bold text-foreground">{student.totalAttendanceJiu}</span></div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
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

          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-primary" />
              <h2 className="font-bold text-lg uppercase tracking-wide">Graduacao</h2>
            </div>

            {(activeModality === "thai" || !showToggle) && student.modalityThai && (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Muay Thai</div>
                {student.thaiGradeColor && <BeltStripe color={student.thaiGradeColor} />}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Nivel</label>
                    <Select value={student.thaiGrade ?? ""} onValueChange={(v) => handleGradeUpdate("thaiGrade", v)}>
                      <SelectTrigger data-testid="select-thai-grade"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                      <SelectContent>
                        {THAI_GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Cor do Mongkol</label>
                    <Select value={student.thaiGradeColor ?? ""} onValueChange={(v) => handleGradeUpdate("thaiGradeColor", v)}>
                      <SelectTrigger data-testid="select-thai-color"><SelectValue placeholder="Cor..." /></SelectTrigger>
                      <SelectContent>
                        {THAI_COLORS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {(activeModality === "jiu" || !showToggle) && student.modalityJiu && (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Jiu-Jitsu</div>
                {student.jiuGradeColor && <BeltStripe color={student.jiuGradeColor} />}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Faixa</label>
                    <Select value={student.jiuGrade ?? ""} onValueChange={(v) => handleGradeUpdate("jiuGrade", v)}>
                      <SelectTrigger data-testid="select-jiu-grade"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                      <SelectContent>
                        {JIU_GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Cor da Faixa</label>
                    <Select value={student.jiuGradeColor ?? ""} onValueChange={(v) => handleGradeUpdate("jiuGradeColor", v)}>
                      <SelectTrigger data-testid="select-jiu-color"><SelectValue placeholder="Cor..." /></SelectTrigger>
                      <SelectContent>
                        {JIU_COLORS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>

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
    </div>
  );
}

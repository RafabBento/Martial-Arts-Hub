import { useState } from "react";
import { useListStudents, getListStudentsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Search, Users, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function BeltBadge({ grade, color, label }: { grade: string | null | undefined; color: string | null | undefined; label: string }) {
  if (!grade) return null;
  const colorMap: Record<string, string> = {
    white: "bg-white text-black border-gray-300",
    blue: "bg-blue-600 text-white border-blue-700",
    purple: "bg-purple-600 text-white border-purple-700",
    brown: "bg-amber-800 text-white border-amber-900",
    black: "bg-gray-900 text-white border-gray-700",
    yellow: "bg-yellow-400 text-black border-yellow-500",
    orange: "bg-orange-500 text-white border-orange-600",
    red: "bg-red-600 text-white border-red-700",
    green: "bg-green-600 text-white border-green-700",
  };
  const cls = colorMap[color ?? ""] ?? "bg-muted text-foreground border-border";
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${cls}`}>
      {label}: {grade}
    </span>
  );
}

export default function Students() {
  const [search, setSearch] = useState("");
  const [modality, setModality] = useState<"" | "thai" | "jiu" | "both">("");

  const { data: students, isLoading } = useListStudents(
    { search: search || undefined, modality: modality || undefined },
    { query: { queryKey: getListStudentsQueryKey({ search: search || undefined, modality: modality || undefined }) } }
  );

  const modalityOptions = [
    { value: "", label: "Todos" },
    { value: "thai", label: "Muay Thai" },
    { value: "jiu", label: "Jiu-Jitsu" },
    { value: "both", label: "Ambos" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Alunos</h1>
          <p className="text-muted-foreground mt-1">{students?.length ?? 0} alunos cadastrados</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="input-search-students"
            placeholder="Buscar alunos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {modalityOptions.map((opt) => (
            <Button
              key={opt.value}
              data-testid={`button-filter-${opt.value || "all"}`}
              variant={modality === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setModality(opt.value as typeof modality)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-4 h-28 animate-pulse" />
          ))}
        </div>
      ) : students && students.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map((student) => (
            <Link key={student.userId} href={`/students/${student.userId}`} data-testid={`card-student-${student.userId}`}>
              <div className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-card transition-all cursor-pointer group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-muted border border-border overflow-hidden shrink-0">
                    {student.profilePhotoUrl
                      ? <img src={student.profilePhotoUrl} alt={student.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground">{student.name.charAt(0).toUpperCase()}</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate group-hover:text-primary transition-colors">{student.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{student.email}</div>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </div>
                <div className="flex flex-wrap gap-1">
                  {student.modalityThai && (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-medium">Thai</span>
                  )}
                  {student.modalityJiu && (
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium">Jiu</span>
                  )}
                  {student.thaiGrade && (
                    <BeltBadge grade={student.thaiGrade} color={student.thaiGradeColor} label="Thai" />
                  )}
                  {student.jiuGrade && (
                    <BeltBadge grade={student.jiuGrade} color={student.jiuGradeColor} label="Jiu" />
                  )}
                </div>
                <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                  <span>Thai: <strong className="text-foreground">{student.totalAttendanceThai}</strong></span>
                  <span>Jiu: <strong className="text-foreground">{student.totalAttendanceJiu}</strong></span>
                  {student.hasFaceDescriptor && (
                    <span className="text-green-400 font-medium">Face cadastrada</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users size={48} className="text-muted-foreground mb-4" />
          <div className="text-muted-foreground text-lg font-medium">Nenhum aluno encontrado</div>
          <div className="text-sm text-muted-foreground mt-1">Tente ajustar os filtros</div>
        </div>
      )}
    </div>
  );
}

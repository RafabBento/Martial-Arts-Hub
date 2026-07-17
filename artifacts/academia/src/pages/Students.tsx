// ============================================================
// Students.tsx — Página de listagem de alunos
//
// Exibe todos os alunos cadastrados na academia em formato de
// grade de cartões. Oferece três formas de filtrar a lista:
//   1. Busca por nome (input de texto)
//   2. Filtro por modalidade (Muay Thai, Jiu-Jitsu ou ambos)
//   3. Filtro por unidade (apenas para professor/admin)
//
// Cada cartão exibe foto, nome, email, modalidades, graduação
// e total de presenças, e leva ao perfil completo do aluno.
// ============================================================

import { useState } from "react";
import { useListStudents, getListStudentsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Search, Users, ChevronRight, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "../contexts/AuthContext";

// ============================================================
// Constantes de configuração
//
// UNIT_LABELS: mapeia o valor interno da unidade (usado na API)
// para um nome amigável exibido na interface. Centralizado aqui
// para evitar repetição em vários lugares do código.
// ============================================================
const UNIT_LABELS: Record<string, string> = {
  matriz:     "Front Matriz",
  panobianco: "Front Panobianco",
  upfitness:  "Front Up Fitness",
};

// Opções do filtro de unidade renderizadas como botões.
// O value "" representa "sem filtro" (todas as unidades).
const UNIT_FILTER_OPTIONS = [
  { value: "",           label: "Todas" },
  { value: "matriz",     label: "Matriz" },
  { value: "panobianco", label: "Panobianco" },
  { value: "upfitness",  label: "Up Fitness" },
];

// ============================================================
// Mapa de cores de faixa → classes Tailwind
//
// Cada cor de faixa tem um conjunto de classes que define o
// fundo, a cor do texto e a borda do selo de graduação.
// Se a cor não existir no mapa, usa as classes padrão (muted).
// ============================================================
const PRIMARY_COLOR_MAP: Record<string, string> = {
  white:  "bg-white text-black border-gray-300",
  blue:   "bg-blue-600 text-white border-blue-700",
  purple: "bg-purple-600 text-white border-purple-700",
  brown:  "bg-amber-800 text-white border-amber-900",
  black:  "bg-gray-900 text-white border-gray-700",
  yellow: "bg-yellow-400 text-black border-yellow-500",
  red:    "bg-red-600 text-white border-red-700",
  green:  "bg-green-600 text-white border-green-700",
};

// ============================================================
// Componente BeltBadge — Selo de graduação (faixa/prajied)
//
// Exibe a graduação do aluno em uma determinada modalidade.
// Recebe:
//   - grade: o nome da graduação (ex: "Faixa Azul", "Prajied Laranja")
//   - color: a chave de cor usada no PRIMARY_COLOR_MAP
//   - label: prefixo exibido antes da graduação ("Thai" ou "Jiu")
//
// Retorna null se não houver graduação, evitando renderizar
// um selo vazio no cartão do aluno.
// ============================================================
function BeltBadge({
  grade,
  color,
  label
}: {
  grade: string | null | undefined;
  color: string | null | undefined;
  label: string;
}) {
  // Se não há graduação, não renderiza nada
  if (!grade) return null;

  // Busca as classes da cor no mapa. O operador "?? " garante
  // um fallback visual neutro se a cor não estiver mapeada.
  const cls = PRIMARY_COLOR_MAP[color ?? ""] ?? "bg-muted text-foreground border-border";

  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${cls}`}>
      {label}: {grade}
    </span>
  );
}

// ============================================================
// Componente principal: Students
// ============================================================
export default function Students() {
  // Obtém o usuário logado para determinar se é professor/admin.
  // "isMaster" controla a visibilidade do filtro de unidade e
  // de informações extras como a unidade no cartão do aluno.
  const { user } = useAuth();
  const isMaster = user?.role === "teacher" || user?.role === "admin";

  // ----------------------------------------------------------
  // Estados dos filtros
  //
  // Cada filtro tem seu próprio estado local. Quando qualquer
  // filtro muda, o React re-renderiza o componente e a query
  // é refeita automaticamente com os novos parâmetros.
  // ----------------------------------------------------------
  const [search, setSearch] = useState("");
  const [modality, setModality] = useState<"" | "thai" | "jiu" | "both">("");
  const [unit, setUnit] = useState<"" | "matriz" | "panobianco" | "upfitness">("");

  // ----------------------------------------------------------
  // Monta os parâmetros da query
  //
  // Valores vazios são convertidos para "undefined" para que
  // não sejam enviados na URL (ex: ?search= seria enviado
  // desnecessariamente se não fizéssemos isso).
  //
  // O filtro de unidade só é aplicado para usuários master —
  // alunos comuns não devem poder filtrar por unidade.
  // ----------------------------------------------------------
  const queryParams = {
    search:   search || undefined,
    modality: modality || undefined,
    unit:     (isMaster && unit) ? unit : undefined,
  };

  // ----------------------------------------------------------
  // Busca a lista de alunos com os filtros aplicados.
  //
  // O queryKey inclui os parâmetros para que o React Query
  // trate cada combinação de filtros como uma cache separada.
  // Assim, ao voltar para um filtro já usado, os dados
  // aparecem instantaneamente sem nova requisição à API.
  // ----------------------------------------------------------
  const { data: students, isLoading } = useListStudents(
    queryParams,
    { query: { queryKey: getListStudentsQueryKey(queryParams) } }
  );

  // Opções do filtro de modalidade renderizadas como botões
  const modalityOptions = [
    { value: "",     label: "Todos" },
    { value: "thai", label: "Muay Thai" },
    { value: "jiu",  label: "Jiu-Jitsu" },
    { value: "both", label: "Ambos" },
  ];

  return (
    <div className="space-y-6">

      {/* Cabeçalho com título e contagem de alunos.
          "students?.length ?? 0" exibe 0 enquanto a API ainda
          não respondeu, evitando mostrar "undefined alunos" */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Alunos</h1>
          <p className="text-muted-foreground mt-1">
            {Array.isArray(students) ? students.length : 0} alunos cadastrados
          </p>
        </div>
      </div>

      {/* --------------------------------------------------------
          Barra de busca + filtros de modalidade

          A busca usa um Input controlado — cada tecla digitada
          atualiza o estado "search", que por sua vez atualiza
          o queryParams e dispara uma nova query na API.

          Os botões de modalidade usam variant="default" quando
          selecionados (cor de destaque) e "outline" quando não,
          criando um efeito de toggle visual.
      -------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          {/* Ícone de lupa posicionado absolutamente dentro do input */}
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

      {/* --------------------------------------------------------
          Filtro de unidade — exclusivo para professor/admin

          O bloco inteiro só é renderizado se "isMaster" for true.
          Alunos comuns não veem nem têm acesso a este filtro.
      -------------------------------------------------------- */}
      {isMaster && (
        <div className="flex gap-2 flex-wrap items-center">
          <MapPin size={14} className="text-muted-foreground" />
          {UNIT_FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={unit === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setUnit(opt.value as typeof unit)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      )}

      {/* --------------------------------------------------------
          Grade de cartões de alunos

          Três estados possíveis:
          1. isLoading → exibe 6 skeletons pulsantes
          2. Array válido com itens → exibe os cartões
          3. Array vazio ou dado inválido → mensagem de estado vazio

          Por que Array.isArray(students)?
          A API pode retornar um objeto em vez de um array em
          algumas situações (erro de rede, resposta inesperada,
          formato diferente do esperado). Sem essa verificação,
          chamar .map() em um objeto lança o erro
          "students.map is not a function" e quebra a página.
      -------------------------------------------------------- */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-4 h-28 animate-pulse" />
          ))}
        </div>
      ) : Array.isArray(students) && students.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map((student) => (
            <Link
              key={student.userId}
              href={`/students/${student.userId}`}
              data-testid={`card-student-${student.userId}`}
            >
              <div className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-card transition-all cursor-pointer group">

                {/* Linha superior: avatar + nome + email + unidade + seta */}
                <div className="flex items-center gap-3 mb-3">

                  {/* Avatar: foto de perfil ou inicial do nome como fallback */}
                  <div className="w-12 h-12 rounded-full bg-muted border border-border overflow-hidden shrink-0">
                    {student.profilePhotoUrl
                      ? <img src={student.profilePhotoUrl} alt={student.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground">
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* "truncate" corta o nome com "..." se for longo demais.
                        "group-hover:text-primary" muda a cor do nome quando
                        o usuário passa o mouse sobre o cartão inteiro */}
                    <div className="font-semibold truncate group-hover:text-primary transition-colors">
                      {student.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{student.email}</div>

                    {/* Unidade só aparece para professor/admin */}
                    {isMaster && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin size={10} className="text-muted-foreground/60" />
                        <span className="text-xs text-muted-foreground/70">
                          {UNIT_LABELS[student.unit] ?? student.unit}
                        </span>
                      </div>
                    )}
                  </div>

                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </div>

                {/* Linha de selos: modalidades e graduações do aluno.
                    Cada selo só aparece se o aluno tiver aquela modalidade
                    ou graduação — campos falsy não renderizam nada */}
                <div className="flex flex-wrap gap-1">
                  {student.modalityThai && (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-medium">
                      Thai
                    </span>
                  )}
                  {student.modalityJiu && (
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium">
                      Jiu
                    </span>
                  )}
                  {student.thaiGrade && (
                    <BeltBadge grade={student.thaiGrade} color={student.thaiGradeColor} label="Thai" />
                  )}
                  {student.jiuGrade && (
                    <BeltBadge grade={student.jiuGrade} color={student.jiuGradeColor} label="Jiu" />
                  )}
                </div>

                {/* Rodapé do cartão: total de presenças por modalidade
                    e indicador de face cadastrada para reconhecimento facial */}
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
        // Estado vazio: aparece quando a busca não encontra nenhum aluno
        // ou quando o array retornado está vazio
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users size={48} className="text-muted-foreground mb-4" />
          <div className="text-muted-foreground text-lg font-medium">Nenhum aluno encontrado</div>
          <div className="text-sm text-muted-foreground mt-1">Tente ajustar os filtros</div>
        </div>
      )}

    </div>
  );
}
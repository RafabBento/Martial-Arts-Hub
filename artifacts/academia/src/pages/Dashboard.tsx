// ============================================================
// Dashboard.tsx — Painel principal da academia
//
// Este componente é a "página inicial" do sistema. Ele busca
// dados da API e os exibe em três seções:
//   1. Cartões de estatísticas (números gerais da academia)
//   2. Lista de atividade recente (últimas presenças)
//   3. Atalhos rápidos + distribuição de alunos por modalidade
//
// Os dados vêm de dois endpoints distintos da API, cada um
// com seu próprio estado de loading para que as seções possam
// carregar de forma independente.
// ============================================================

import {
  useGetDashboardStats,
  useGetRecentActivity,
  getGetDashboardStatsQueryKey,
  getGetRecentActivityQueryKey
} from "@workspace/api-client-react";
import { Users, CalendarDays, Camera, TrendingUp, Dumbbell, Shield } from "lucide-react";
import { Link } from "wouter";

// ============================================================
// Componente StatCard
//
// Cartão genérico reutilizável para exibir uma estatística.
// Recebe 4 props:
//   - label: texto descritivo abaixo do número (ex: "Total de Alunos")
//   - value: o número a exibir. Pode ser undefined enquanto a API
//     ainda não respondeu — nesse caso exibe "—" como placeholder
//     usando o operador de coalescência nula (??)
//   - icon: componente de ícone do lucide-react passado como prop
//     para ser renderizado dinamicamente (por isso "icon: Icon" com
//     letra maiúscula — React exige isso para componentes dinâmicos)
//   - accent: classes Tailwind de cor aplicadas ao fundo do ícone,
//     permitindo que cada cartão tenha uma cor diferente sem
//     duplicar o componente
// ============================================================
function StatCard({
  label,
  value,
  icon: Icon,
  accent
}: {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-6 flex items-center gap-4 hover:border-primary/40 transition-colors">
      {/* Círculo colorido com o ícone. A cor vem da prop accent,
          que é uma string de classes Tailwind como "bg-red-500/20 text-red-400" */}
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${accent}`}>
        <Icon size={22} />
      </div>
      <div>
        {/* value ?? "—" significa: se value for null ou undefined,
            mostra "—". Isso evita mostrar "0" durante o loading,
            que poderia ser confundido com um valor real */}
        <div className="text-2xl font-bold">{value ?? "—"}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// ============================================================
// Componente ModalityBadge
//
// Exibe um selo colorido indicando a modalidade de uma atividade.
// "thai" → vermelho com texto "MUAY THAI"
// "jiu"  → azul com texto "JIU-JITSU"
// qualquer outro valor (null, undefined, string desconhecida)
// → retorna null, ou seja, não renderiza nada na tela.
//
// O tipo da prop aceita string | null | undefined porque a API
// pode retornar qualquer um desses valores dependendo do registro.
// ============================================================
function ModalityBadge({ modality }: { modality: string | null | undefined }) {
  if (modality === "thai")
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
        MUAY THAI
      </span>
    );
  if (modality === "jiu")
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
        JIU-JITSU
      </span>
    );
  return null;
}

// ============================================================
// Componente principal: Dashboard
// ============================================================
export default function Dashboard() {

  // ----------------------------------------------------------
  // Busca as estatísticas agregadas da academia.
  //
  // useGetDashboardStats é um hook gerado automaticamente pelo
  // orval (gerador de código a partir do OpenAPI spec). Ele
  // encapsula o React Query por baixo dos panos.
  //
  // O queryKey é passado explicitamente para que o React Query
  // possa identificar e cachear essa query de forma única.
  // Sem o queryKey correto, múltiplas instâncias do componente
  // poderiam fazer requisições duplicadas desnecessárias.
  //
  // "stats" pode ser undefined enquanto a requisição está em
  // andamento — por isso usamos "statsLoading" para controlar
  // o que mostrar na tela enquanto esperamos.
  // ----------------------------------------------------------
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: { queryKey: getGetDashboardStatsQueryKey() }
  });

  // ----------------------------------------------------------
  // Busca a lista de atividades recentes (últimas presenças).
  //
  // Mesmo padrão do hook acima, mas para um endpoint diferente.
  // "activity" deve ser um array de objetos, mas usamos
  // Array.isArray() antes de iterar para nos proteger contra
  // respostas inesperadas da API (ex: objeto, null, string).
  // ----------------------------------------------------------
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey() }
  });

  // ----------------------------------------------------------
  // Log temporário de diagnóstico.
  //
  // Adicionado para inspecionar o que a API está retornando
  // no campo "activity". O erro original era "slice is not a
  // function", o que indica que a API pode estar retornando
  // um objeto { data: [...] } em vez de um array diretamente.
  //
  // REMOVA este log após confirmar o formato da resposta.
  // ----------------------------------------------------------
  

  return (
    <div className="space-y-8">

      {/* Cabeçalho da página */}
      <div>
        <h1 className="text-3xl font-black tracking-tight uppercase">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Visao geral da academia</p>
      </div>

      {/* --------------------------------------------------------
          Seção 1: Grade de estatísticas
          
          Usa renderização condicional baseada no estado de loading:
          - Se statsLoading for true: exibe 8 retângulos pulsantes
            (skeleton/placeholder) para indicar que os dados estão
            sendo carregados, evitando uma tela em branco
          - Se statsLoading for false: exibe os cartões reais com
            os valores vindos da API
          
          A grade usa CSS Grid responsivo do Tailwind:
          - 1 coluna em telas pequenas (celular)
          - 2 colunas em telas médias (tablet)
          - 3 colunas em telas grandes
          - 4 colunas em telas extra grandes (desktop)
      -------------------------------------------------------- */}
      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* Gera 8 placeholders pulsantes. O Array(8) cria um array
              vazio de 8 posições; o spread [...] permite usar .map().
              O índice "i" é usado apenas como key única para o React. */}
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-6 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* Cada StatCard recebe seus dados específicos de "stats".
              O operador ?. (optional chaining) garante que não quebra
              se stats for undefined por algum motivo inesperado. */}
          <StatCard label="Total de Alunos"        value={stats?.totalStudents}           icon={Users}     accent="bg-primary/20 text-primary" />
          <StatCard label="Professores"             value={stats?.totalTeachers}           icon={Shield}    accent="bg-yellow-500/20 text-yellow-400" />
          <StatCard label="Sessoes Thai"            value={stats?.totalSessionsThai}       icon={Dumbbell}  accent="bg-red-500/20 text-red-400" />
          <StatCard label="Sessoes Jiu"             value={stats?.totalSessionsJiu}        icon={Dumbbell}  accent="bg-blue-500/20 text-blue-400" />
          <StatCard label="Presencas Hoje (Thai)"   value={stats?.attendanceTodayThai}     icon={Camera}    accent="bg-orange-500/20 text-orange-400" />
          <StatCard label="Presencas Hoje (Jiu)"    value={stats?.attendanceTodayJiu}      icon={Camera}    accent="bg-cyan-500/20 text-cyan-400" />
          <StatCard label="Presencas Este Mes"      value={stats?.totalAttendanceThisMonth} icon={TrendingUp} accent="bg-green-500/20 text-green-400" />
          <StatCard label="Alunos em Ambas"         value={stats?.studentsBoth}            icon={Users}     accent="bg-purple-500/20 text-purple-400" />
        </div>
      )}

      {/* Grade de duas colunas: coluna principal (2/3) + coluna lateral (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* --------------------------------------------------------
            Seção 2: Atividade Recente (coluna principal, 2/3 da largura)

            Exibe as últimas 10 atividades registradas no sistema
            (presenças confirmadas em sessões de treino).

            Fluxo de renderização:
            1. Se activityLoading → mostra 5 skeletons pulsantes
            2. Se activity é um array válido com itens → mostra a lista
            3. Caso contrário (array vazio ou dado inválido) → mensagem
               "Nenhuma atividade recente"

            Por que Array.isArray()?
            A guarda "activity && activity.length > 0" não é suficiente
            porque se a API retornar um objeto, ele seria "truthy" e
            teria a propriedade .length como undefined. O Array.isArray()
            garante com certeza que é um array antes de chamar .slice()
            e .map(), evitando o erro "slice is not a function".
        -------------------------------------------------------- */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-bold uppercase tracking-wide mb-4">Atividade Recente</h2>

          {activityLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : activity && Array.isArray(activity) && activity.length > 0 ? (
            <div className="space-y-2">
              {/* .slice(0, 10) limita a lista aos primeiros 10 itens,
                  mesmo que a API retorne mais, para não sobrecarregar
                  a interface visualmente */}
              {activity.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0"
                >
                  {/* Avatar do aluno: se tiver foto usa a imagem,
                      senão exibe a primeira letra do nome como fallback */}
                  <div className="w-9 h-9 rounded-full bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {item.studentPhotoUrl
                      ? <img src={item.studentPhotoUrl} alt="" className="w-full h-full object-cover" />
                      : item.studentName?.charAt(0).toUpperCase()}
                  </div>

                  {/* Descrição da atividade e data formatada em pt-BR.
                      "truncate" corta o texto com "..." se for longo demais
                      para caber na largura disponível */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{item.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString("pt-BR")}
                    </div>
                  </div>

                  {/* Selo de modalidade (MUAY THAI ou JIU-JITSU) */}
                  <ModalityBadge modality={item.modality} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhuma atividade recente
            </div>
          )}
        </div>

        {/* --------------------------------------------------------
            Seção 3: Ações Rápidas + Distribuição de Alunos
            (coluna lateral, 1/3 da largura)

            Atalhos de navegação para as principais áreas do sistema.
            Cada Link usa o componente <Link> do wouter (roteador
            leve usado no projeto) para navegar sem recarregar a página.

            Ao final, se "stats" já chegou da API, exibe também
            a distribuição de alunos por modalidade:
            - Somente Thai: alunos que só praticam Muay Thai
            - Somente Jiu: alunos que só praticam Jiu-Jitsu
            - Ambas: alunos que praticam as duas modalidades
        -------------------------------------------------------- */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold uppercase tracking-wide mb-4">Acoes Rapidas</h2>

          <Link href="/attendance" data-testid="link-quick-attendance">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer mb-3">
              <Camera size={20} className="text-primary" />
              <span className="font-medium text-sm">Marcar Presenca</span>
            </div>
          </Link>

          <Link href="/sessions" data-testid="link-quick-sessions">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted transition-colors cursor-pointer mb-3">
              <CalendarDays size={20} className="text-muted-foreground" />
              <span className="font-medium text-sm">Nova Sessao</span>
            </div>
          </Link>

          <Link href="/students" data-testid="link-quick-students">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted transition-colors cursor-pointer mb-3">
              <Users size={20} className="text-muted-foreground" />
              <span className="font-medium text-sm">Ver Alunos</span>
            </div>
          </Link>

          <Link href="/rankings" data-testid="link-quick-rankings">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted transition-colors cursor-pointer">
              <TrendingUp size={20} className="text-muted-foreground" />
              <span className="font-medium text-sm">Ranking de Presenca</span>
            </div>
          </Link>

          {/* Bloco de distribuição de alunos.
              O "stats &&" garante que este bloco só aparece depois
              que os dados da API chegarem — evita mostrar zeros ou
              travamentos enquanto a requisição ainda está em andamento */}
          {stats && (
            <div className="mt-6 pt-4 border-t border-border space-y-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-3">
                Distribuicao de Alunos
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Somente Thai</span>
                <span className="font-bold text-red-400">{stats.studentsThaiOnly}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Somente Jiu</span>
                <span className="font-bold text-blue-400">{stats.studentsJiuOnly}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ambas Modalidades</span>
                <span className="font-bold text-purple-400">{stats.studentsBoth}</span>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
// Painel principal (Dashboard) da academia. Mostra cartões com estatísticas
// gerais (alunos, professores, sessões, presenças), a atividade recente e atalhos
// rápidos para as principais áreas do sistema. Os dados vêm de duas queries da API.
import { useGetDashboardStats, useGetRecentActivity, getGetDashboardStatsQueryKey, getGetRecentActivityQueryKey } from "@workspace/api-client-react";
import { Users, CalendarDays, Camera, TrendingUp, Dumbbell, Shield } from "lucide-react";
import { Link } from "wouter";

// Cartão reutilizável de estatística: ícone + valor numérico + rótulo. Exibe "—"
// enquanto o valor ainda não chegou (undefined).
function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number | undefined; icon: React.ElementType; accent: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-6 flex items-center gap-4 hover:border-primary/40 transition-colors">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${accent}`}>
        <Icon size={22} />
      </div>
      <div>
        <div className="text-2xl font-bold">{value ?? "—"}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// Selo colorido que indica a modalidade (Muay Thai em vermelho, Jiu-Jitsu em
// azul). Não renderiza nada quando a modalidade é desconhecida/nula.
function ModalityBadge({ modality }: { modality: string | null | undefined }) {
  if (modality === "thai") return <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">MUAY THAI</span>;
  if (modality === "jiu") return <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">JIU-JITSU</span>;
  return null;
}

export default function Dashboard() {
  // Query das estatísticas agregadas exibidas nos cartões do topo.
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: { queryKey: getGetDashboardStatsQueryKey() }
  });
  // Query da lista de atividades recentes (presenças/eventos) exibida na coluna principal.
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey() }
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight uppercase">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Visao geral da academia</p>
      </div>

      {/* Grade de estatísticas: enquanto carrega mostra esqueletos (placeholders
          pulsantes); depois exibe os cartões com os números reais */}
      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-6 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <StatCard label="Total de Alunos" value={stats?.totalStudents} icon={Users} accent="bg-primary/20 text-primary" />
          <StatCard label="Professores" value={stats?.totalTeachers} icon={Shield} accent="bg-yellow-500/20 text-yellow-400" />
          <StatCard label="Sessoes Thai" value={stats?.totalSessionsThai} icon={Dumbbell} accent="bg-red-500/20 text-red-400" />
          <StatCard label="Sessoes Jiu" value={stats?.totalSessionsJiu} icon={Dumbbell} accent="bg-blue-500/20 text-blue-400" />
          <StatCard label="Presencas Hoje (Thai)" value={stats?.attendanceTodayThai} icon={Camera} accent="bg-orange-500/20 text-orange-400" />
          <StatCard label="Presencas Hoje (Jiu)" value={stats?.attendanceTodayJiu} icon={Camera} accent="bg-cyan-500/20 text-cyan-400" />
          <StatCard label="Presencas Este Mes" value={stats?.totalAttendanceThisMonth} icon={TrendingUp} accent="bg-green-500/20 text-green-400" />
          <StatCard label="Alunos em Ambas" value={stats?.studentsBoth} icon={Users} accent="bg-purple-500/20 text-purple-400" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal: lista de atividade recente (até 10 itens), com foto,
            descrição, data formatada em pt-BR e o selo de modalidade */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-bold uppercase tracking-wide mb-4">Atividade Recente</h2>
          {activityLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
            </div>
          ) : activity && activity.length > 0 ? (
            <div className="space-y-2">
              {activity.slice(0, 10).map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                  <div className="w-9 h-9 rounded-full bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {item.studentPhotoUrl
                      ? <img src={item.studentPhotoUrl} alt="" className="w-full h-full object-cover" />
                      : item.studentName?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{item.description}</div>
                    <div className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("pt-BR")}</div>
                  </div>
                  <ModalityBadge modality={item.modality} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma atividade recente</div>
          )}
        </div>

        {/* Coluna lateral: atalhos rápidos para as áreas principais e, ao final,
            o resumo da distribuição de alunos por modalidade */}
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

          {stats && (
            <div className="mt-6 pt-4 border-t border-border space-y-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-3">Distribuicao de Alunos</div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Somente Thai</span><span className="font-bold text-red-400">{stats.studentsThaiOnly}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Somente Jiu</span><span className="font-bold text-blue-400">{stats.studentsJiuOnly}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Ambas Modalidades</span><span className="font-bold text-purple-400">{stats.studentsBoth}</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

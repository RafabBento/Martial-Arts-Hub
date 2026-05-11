import { useState } from "react";
import { useListRankings, getListRankingsQueryKey } from "@workspace/api-client-react";
import { Trophy, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <div className="w-8 h-8 rounded-full bg-yellow-500/20 border border-yellow-400 flex items-center justify-center"><Trophy size={14} className="text-yellow-400" /></div>;
  if (rank === 2) return <div className="w-8 h-8 rounded-full bg-gray-400/20 border border-gray-400 flex items-center justify-center"><Medal size={14} className="text-gray-400" /></div>;
  if (rank === 3) return <div className="w-8 h-8 rounded-full bg-amber-700/20 border border-amber-700 flex items-center justify-center"><Medal size={14} className="text-amber-700" /></div>;
  return <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center text-sm font-bold text-muted-foreground">{rank}</div>;
}

function BeltDot({ color }: { color: string | null | undefined }) {
  if (!color) return null;
  const colorMap: Record<string, string> = {
    white: "bg-white", blue: "bg-blue-600", purple: "bg-purple-600",
    brown: "bg-amber-800", black: "bg-gray-900", yellow: "bg-yellow-400",
    orange: "bg-orange-500", red: "bg-red-600", green: "bg-green-600",
  };
  return <span className={`inline-block w-3 h-3 rounded-full border border-border ${colorMap[color] ?? "bg-muted"}`} />;
}

export default function Rankings() {
  const [modality, setModality] = useState<"both" | "thai" | "jiu">("both");
  const [period, setPeriod] = useState<"all" | "week" | "month" | "year">("all");

  const { data: rankings, isLoading } = useListRankings(
    { modality, period },
    { query: { queryKey: getListRankingsQueryKey({ modality, period }) } }
  );

  const periodOptions: { value: "all" | "week" | "month" | "year"; label: string }[] = [
    { value: "all", label: "Geral" },
    { value: "year", label: "Ano" },
    { value: "month", label: "Mes" },
    { value: "week", label: "Semana" },
  ];

  const modalityOptions: { value: "both" | "thai" | "jiu"; label: string }[] = [
    { value: "both", label: "Todos" },
    { value: "thai", label: "Muay Thai" },
    { value: "jiu", label: "Jiu-Jitsu" },
  ];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-black tracking-tight uppercase">Ranking de Presencas</h1>
        <p className="text-muted-foreground mt-1">Quem esta mais presente na academia</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex gap-2">
          {modalityOptions.map((opt) => (
            <Button
              key={opt.value}
              data-testid={`button-mod-${opt.value}`}
              variant={modality === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setModality(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          {periodOptions.map((opt) => (
            <Button
              key={opt.value}
              data-testid={`button-period-${opt.value}`}
              variant={period === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(7)].map((_, i) => <div key={i} className="bg-card border border-border rounded-lg p-4 h-16 animate-pulse" />)}
        </div>
      ) : rankings && rankings.length > 0 ? (
        <div className="space-y-2">
          {rankings.map((r) => (
            <Link key={r.studentId} href={`/students/${r.studentId}`} data-testid={`row-ranking-${r.rank}`}>
              <div className={`bg-card border rounded-lg p-4 flex items-center gap-4 hover:border-primary/50 transition-all cursor-pointer ${r.rank <= 3 ? "border-primary/30" : "border-border"}`}>
                <RankBadge rank={r.rank} />
                <div className="w-10 h-10 rounded-full bg-muted border border-border overflow-hidden shrink-0">
                  {r.profilePhotoUrl
                    ? <img src={r.profilePhotoUrl} alt={r.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">{r.name.charAt(0)}</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{r.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {r.thaiGradeColor && <BeltDot color={r.thaiGradeColor} />}
                    {r.thaiGrade && <span className="text-xs text-muted-foreground">Thai: {r.thaiGrade}</span>}
                    {r.jiuGradeColor && <BeltDot color={r.jiuGradeColor} />}
                    {r.jiuGrade && <span className="text-xs text-muted-foreground">Jiu: {r.jiuGrade}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-black text-primary">{r.percentage}%</div>
                  <div className="text-xs text-muted-foreground">{r.presentCount}/{r.totalSessions} treinos</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Trophy size={48} className="text-muted-foreground mb-4" />
          <div className="text-muted-foreground text-lg font-medium">Nenhum dado disponivel</div>
        </div>
      )}
    </div>
  );
}

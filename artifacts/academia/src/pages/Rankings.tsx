import { useState } from "react";
import { useListRankings, getListRankingsQueryKey } from "@workspace/api-client-react";
import { Trophy, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

const JIU_BG: Record<string, string> = {
  white: "bg-white", blue: "bg-blue-600", purple: "bg-purple-600",
  brown: "bg-amber-800", black: "bg-gray-900",
};

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

/** Prajied stripe for Muay Thai */
function PrajiedStripe({ grade }: { grade: string | null | undefined }) {
  if (!grade) return null;
  const key = grade.toLowerCase().replace(/ /g, "-");
  const entry = PRAJIED_MAP[key];
  if (!entry) return null;
  if (!entry.secondary) {
    return <div className={`h-2 w-14 rounded-sm border border-white/20 ${entry.primary}`} />;
  }
  return (
    <div className="h-2 w-14 rounded-sm border border-white/20 overflow-hidden flex">
      <div className={`flex-1 ${entry.primary}`} />
      <div className={`w-4 ${entry.secondary}`} />
    </div>
  );
}

/** BJJ belt with degree stripes */
function JiuBelt({ color, degree }: { color: string | null | undefined; degree: number | null | undefined }) {
  if (!color) return null;
  const bg = JIU_BG[color] ?? "bg-muted";
  const stripes = Math.min(Math.max(degree ?? 0, 0), 4);
  const isWhite = color === "white";

  return (
    <div className={`relative h-4 w-16 rounded-sm border overflow-hidden shrink-0 ${bg} ${isWhite ? "border-gray-300/50" : "border-white/20"}`}>
      {/* center line (seam) */}
      <div className={`absolute inset-x-0 top-1/2 -translate-y-px h-px ${isWhite ? "bg-gray-300/40" : "bg-black/30"}`} />
      {/* degree stripes — right-aligned */}
      {stripes > 0 && (
        <div className="absolute right-1 top-0.5 bottom-0.5 flex gap-0.5">
          {Array.from({ length: stripes }).map((_, i) => (
            <div key={i} className={`w-1.5 h-full rounded-[1px] ${isWhite ? "bg-gray-700/60" : "bg-white/80"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <div className="w-7 h-7 rounded-full bg-yellow-500/20 border border-yellow-400 flex items-center justify-center"><Trophy size={12} className="text-yellow-400" /></div>;
  if (rank === 2) return <div className="w-7 h-7 rounded-full bg-gray-400/20 border border-gray-400 flex items-center justify-center"><Medal size={12} className="text-gray-400" /></div>;
  if (rank === 3) return <div className="w-7 h-7 rounded-full bg-amber-700/20 border border-amber-700 flex items-center justify-center"><Medal size={12} className="text-amber-700" /></div>;
  return <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-bold text-muted-foreground">{rank}</div>;
}

type RankingEntry = {
  rank: number;
  studentId: number;
  name: string;
  profilePhotoUrl: string | null;
  thaiGrade?: string | null;
  thaiGradeColor?: string | null;
  jiuGrade?: string | null;
  jiuGradeColor?: string | null;
  jiuDegree?: number | null;
  totalSessions: number;
  presentCount: number;
  percentage: number;
  modality: string;
};

function RankingList({
  title,
  color,
  entries,
  showThai,
}: {
  title: string;
  color: "red" | "blue";
  entries: RankingEntry[];
  showThai: boolean;
}) {
  const accent = color === "red"
    ? { border: "border-red-500/30", badge: "bg-red-500/10 text-red-400 border-red-500/30", line: "bg-red-500" }
    : { border: "border-blue-500/30", badge: "bg-blue-500/10 text-blue-400 border-blue-500/30", line: "bg-blue-500" };

  return (
    <div className="flex-1 min-w-0 space-y-3">
      <div className="flex items-center gap-2">
        <div className={`w-1 h-5 rounded-full ${accent.line}`} />
        <h2 className="font-black uppercase tracking-wide text-lg">{title}</h2>
        <span className={`ml-auto text-xs font-semibold border rounded px-2 py-0.5 ${accent.badge}`}>
          {entries.length} alunos
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <Trophy size={32} className="mb-2 opacity-30" />
          <p className="text-sm">Nenhum dado</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((r) => (
            <Link key={r.studentId} href={`/students/${r.studentId}`}>
              <div className={`bg-card border rounded-lg px-3 py-2.5 flex items-center gap-2.5 hover:border-primary/50 transition-all cursor-pointer ${r.rank <= 3 ? accent.border : "border-border"}`}>
                <RankBadge rank={r.rank} />

                <div className="w-8 h-8 rounded-full bg-muted border border-border overflow-hidden shrink-0">
                  {r.profilePhotoUrl
                    ? <img src={r.profilePhotoUrl} alt={r.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">{r.name.charAt(0)}</div>
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{r.name}</div>
                  <div className="mt-0.5">
                    {showThai && r.thaiGrade && (
                      <PrajiedStripe grade={r.thaiGradeColor} />
                    )}
                    {!showThai && (
                      <JiuBelt color={r.jiuGradeColor} degree={r.jiuDegree} />
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-lg font-black text-primary leading-none">{r.percentage}%</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{r.presentCount}/{r.totalSessions}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Rankings() {
  const [period, setPeriod] = useState<"all" | "week" | "month" | "year">("all");

  const { data: bothData, isLoading } = useListRankings(
    { modality: "both", period },
    { query: { queryKey: getListRankingsQueryKey({ modality: "both", period }) } }
  );

  const periodOptions: { value: "all" | "week" | "month" | "year"; label: string }[] = [
    { value: "all", label: "Geral" },
    { value: "year", label: "Ano" },
    { value: "month", label: "Mês" },
    { value: "week", label: "Semana" },
  ];

  const thaiRanking: RankingEntry[] = (bothData as any)?.thai ?? [];
  const jiuRanking: RankingEntry[] = (bothData as any)?.jiu ?? [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Ranking de Presenças</h1>
          <p className="text-muted-foreground mt-1">Quem está mais presente na academia</p>
        </div>

        <div className="flex gap-1.5 bg-card border border-border rounded-lg p-1">
          {periodOptions.map((opt) => (
            <Button
              key={opt.value}
              data-testid={`button-period-${opt.value}`}
              variant={period === opt.value ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1].map((col) => (
            <div key={col} className="space-y-2">
              <div className="h-6 w-32 bg-muted rounded animate-pulse" />
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-lg h-14 animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <RankingList title="Muay Thai" color="red" entries={thaiRanking} showThai={true} />
          <RankingList title="Jiu-Jitsu" color="blue" entries={jiuRanking} showThai={false} />
        </div>
      )}
    </div>
  );
}

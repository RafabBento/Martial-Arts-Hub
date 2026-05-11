import { useRoute, useLocation } from "wouter";
import {
  useGetSession, getGetSessionQueryKey,
  useListAttendance, getListAttendanceQueryKey,
  useDeleteAttendance,
  useDeleteSession,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Users, Trash2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "../contexts/AuthContext";
import { Link } from "wouter";

export default function SessionDetail() {
  const [, params] = useRoute("/sessions/:id");
  const [, setLocation] = useLocation();
  const sessionId = params ? parseInt(params.id, 10) : 0;
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: session, isLoading: sessionLoading } = useGetSession(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) }
  });

  const { data: attendance, isLoading: attLoading } = useListAttendance(
    { sessionId },
    { query: { enabled: !!sessionId, queryKey: getListAttendanceQueryKey({ sessionId }) } }
  );

  const deleteAttMutation = useDeleteAttendance();
  const deleteSessionMutation = useDeleteSession();

  const handleDeleteAttendance = (id: number) => {
    deleteAttMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAttendanceQueryKey({ sessionId }) });
        queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(sessionId) });
        toast({ title: "Presenca removida" });
      },
      onError: () => toast({ title: "Erro ao remover presenca", variant: "destructive" }),
    });
  };

  const handleDeleteSession = () => {
    if (!confirm("Tem certeza que deseja excluir esta sessao?")) return;
    deleteSessionMutation.mutate({ id: sessionId }, {
      onSuccess: () => {
        toast({ title: "Sessao excluida" });
        setLocation("/sessions");
      },
      onError: () => toast({ title: "Erro ao excluir sessao", variant: "destructive" }),
    });
  };

  if (sessionLoading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!session) {
    return <div className="text-center py-20 text-muted-foreground">Sessao nao encontrada</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/sessions")} data-testid="button-back">
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-2xl font-black uppercase">Detalhes da Sessao</h1>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${session.modality === "thai" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-blue-500/20 text-blue-400 border border-blue-500/30"}`}>
              {session.modality === "thai" ? "MUAY THAI" : "JIU-JITSU"}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Calendar size={14} />
              <span>{new Date(session.sessionDate).toLocaleString("pt-BR")}</span>
            </div>
            <div className="text-sm text-muted-foreground">Prof. <strong className="text-foreground">{session.teacherName}</strong></div>
            {session.description && <div className="text-sm text-muted-foreground">{session.description}</div>}
          </div>
          {(user?.role === "teacher" || user?.role === "admin") && (
            <Button
              data-testid="button-delete-session"
              variant="destructive"
              size="sm"
              onClick={handleDeleteSession}
              disabled={deleteSessionMutation.isPending}
            >
              <Trash2 size={14} className="mr-1" /> Excluir Sessao
            </Button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-primary" />
          <h2 className="font-bold text-lg uppercase tracking-wide">Presencas</h2>
          <span className="ml-auto text-sm text-muted-foreground">{attendance?.length ?? 0} alunos</span>
        </div>

        {attLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
          </div>
        ) : attendance && attendance.length > 0 ? (
          <div className="space-y-2">
            {attendance.map((rec) => (
              <div key={rec.id} data-testid={`row-att-${rec.id}`} className="flex items-center gap-3 py-2 px-2 rounded hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0">
                <div className="w-9 h-9 rounded-full bg-muted border border-border overflow-hidden shrink-0">
                  {rec.studentPhotoUrl
                    ? <img src={rec.studentPhotoUrl} alt={rec.studentName} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">{rec.studentName.charAt(0)}</div>
                  }
                </div>
                <Link href={`/students/${rec.studentId}`} className="flex-1 font-medium hover:text-primary transition-colors">
                  {rec.studentName}
                </Link>
                <div className="flex items-center gap-2">
                  {rec.faceRecognized && <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">Reconhecido</span>}
                  <span className="text-xs text-muted-foreground">{new Date(rec.createdAt).toLocaleTimeString("pt-BR")}</span>
                  {(user?.role === "teacher" || user?.role === "admin") && (
                    <Button
                      data-testid={`button-remove-att-${rec.id}`}
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteAttendance(rec.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma presenca registrada nesta sessao</div>
        )}
      </div>
    </div>
  );
}

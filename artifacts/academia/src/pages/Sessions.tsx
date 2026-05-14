import { useState } from "react";
import {
  useListSessions, getListSessionsQueryKey,
  useCreateSession,
  useListUsers, getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { CalendarDays, Plus, ChevronRight, Users, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "../contexts/AuthContext";

export default function Sessions() {
  const [modality, setModality] = useState<"" | "thai" | "jiu">("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ modality: "thai", sessionDate: "", description: "", teacherId: "" });
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useListSessions(
    { modality: modality || undefined },
    { query: { queryKey: getListSessionsQueryKey({ modality: modality || undefined }) } }
  );

  const { data: teachers } = useListUsers(
    { role: "teacher" },
    { query: { queryKey: getListUsersQueryKey({ role: "teacher" }) } }
  );

  const createMutation = useCreateSession();

  const handleCreate = () => {
    if (!form.sessionDate || !form.teacherId) {
      toast({ title: "Preencha todos os campos obrigatorios", variant: "destructive" });
      return;
    }
    createMutation.mutate(
      { data: { modality: form.modality as "thai" | "jiu", sessionDate: new Date(form.sessionDate).toISOString(), description: form.description || undefined, teacherId: parseInt(form.teacherId, 10) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          toast({ title: "Sessao criada com sucesso" });
          setOpen(false);
          setForm({ modality: "thai", sessionDate: "", description: "", teacherId: "" });
        },
        onError: () => toast({ title: "Erro ao criar sessao", variant: "destructive" }),
      }
    );
  };

  const SCHEDULE = [
    { time: "19:00", modality: "jiu" as const, days: "Seg – Sex", instructor: "Instrutor Ewerton" },
    { time: "20:30", modality: "thai" as const, days: "Seg, Qua e Sex", instructor: "Mestre Ewerton" },
    { time: "20:30", modality: "thai" as const, days: "Ter e Qui", instructor: "Instrutor Luis" },
    { time: "10:30", modality: "thai" as const, days: "Sábado", instructor: "Instrutor Nilberto" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Sessões</h1>
          <p className="text-muted-foreground mt-1">{sessions?.length ?? 0} sessões registradas</p>
        </div>
        {(user?.role === "teacher" || user?.role === "admin") && (
          <Button data-testid="button-new-session" onClick={() => setOpen(true)}>
            <Plus size={16} className="mr-2" /> Nova Sessão
          </Button>
        )}
      </div>

      {/* Cronograma semanal */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Cronograma Semanal</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin size={11} /> Av. Julio Buono, 2224
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {SCHEDULE.map((item, i) => (
            <div key={i} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border ${item.modality === "thai" ? "bg-red-500/10 border-red-500/20" : "bg-blue-500/10 border-blue-500/20"}`}>
              <div className="flex items-center gap-1 shrink-0">
                <Clock size={12} className="text-muted-foreground" />
                <span className="font-black text-sm">{item.time}</span>
              </div>
              <div className="min-w-0">
                <div className={`text-xs font-bold ${item.modality === "thai" ? "text-red-400" : "text-blue-400"}`}>
                  {item.modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"}
                </div>
                <div className="text-xs text-muted-foreground truncate">{item.days}</div>
                <div className="text-xs text-muted-foreground truncate">{item.instructor}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        {["", "thai", "jiu"].map((m) => (
          <Button
            key={m}
            data-testid={`button-filter-${m || "all"}`}
            variant={modality === m ? "default" : "outline"}
            size="sm"
            onClick={() => setModality(m as typeof modality)}
          >
            {m === "" ? "Todos" : m === "thai" ? "Muay Thai" : "Jiu-Jitsu"}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="bg-card border border-border rounded-lg p-4 h-20 animate-pulse" />)}
        </div>
      ) : sessions && sessions.length > 0 ? (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Link key={session.id} href={`/sessions/${session.id}`} data-testid={`row-session-${session.id}`}>
              <div className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-all cursor-pointer flex items-center gap-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-black text-sm shrink-0 ${session.modality === "thai" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-blue-500/20 text-blue-400 border border-blue-500/30"}`}>
                  {session.modality === "thai" ? "MT" : "JJ"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{session.modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"}</div>
                  <div className="text-sm text-muted-foreground">{new Date(session.sessionDate).toLocaleString("pt-BR")} &mdash; Prof. {session.teacherName}</div>
                  {session.description && <div className="text-xs text-muted-foreground mt-0.5 truncate">{session.description}</div>}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                  <Users size={14} />
                  <span>{session.attendanceCount}</span>
                  <ChevronRight size={16} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CalendarDays size={48} className="text-muted-foreground mb-4" />
          <div className="text-muted-foreground text-lg font-medium">Nenhuma sessao encontrada</div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Sessao de Treino</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Modalidade</label>
              <Select value={form.modality} onValueChange={(v) => setForm(f => ({ ...f, modality: v }))}>
                <SelectTrigger data-testid="select-session-modality"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="thai">Muay Thai</SelectItem>
                  <SelectItem value="jiu">Jiu-Jitsu</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Data e Hora</label>
              <Input
                data-testid="input-session-date"
                type="datetime-local"
                value={form.sessionDate}
                onChange={(e) => setForm(f => ({ ...f, sessionDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Professor</label>
              <Select value={form.teacherId} onValueChange={(v) => setForm(f => ({ ...f, teacherId: v }))}>
                <SelectTrigger data-testid="select-session-teacher"><SelectValue placeholder="Selecionar professor..." /></SelectTrigger>
                <SelectContent>
                  {teachers?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Descricao (opcional)</label>
              <Input
                data-testid="input-session-description"
                placeholder="Ex: Treino de clinch e joelhada"
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button data-testid="button-create-session" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar Sessao"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

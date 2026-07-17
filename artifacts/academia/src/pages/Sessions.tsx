// ============================================================
// Sessions.tsx — Página de sessões de treino
//
// Esta página tem três responsabilidades principais:
//   1. Exibir o cronograma semanal fixo da academia (dado
//      estático, não vem do banco de dados)
//   2. Listar as sessões registradas com filtro por modalidade
//   3. Permitir que professores/admins criem novas sessões
//      via um diálogo (modal)
//
// O fluxo de criação de sessão é:
//   professor clica em "Nova Sessão" → abre o diálogo →
//   preenche os campos → clica em "Criar" → API é chamada →
//   lista é atualizada automaticamente via invalidação de cache
// ============================================================

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

  // ----------------------------------------------------------
  // Estados locais da página
  //
  // modality: filtro ativo de modalidade. String vazia significa
  //   "sem filtro" (todas as modalidades). Ao mudar, dispara
  //   nova requisição à API com o filtro atualizado.
  //
  // open: controla se o diálogo de criação está aberto ou não.
  //   true = diálogo visível, false = diálogo oculto.
  //
  // form: estado do formulário dentro do diálogo. Agrupa todos
  //   os campos em um único objeto para facilitar o reset após
  //   a criação bem-sucedida de uma sessão.
  // ----------------------------------------------------------
  const [modality, setModality] = useState<"" | "thai" | "jiu">("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    modality: "thai",
    sessionDate: "",
    description: "",
    teacherId: "",
  });

  const { user } = useAuth();
  const { toast } = useToast();

  // ----------------------------------------------------------
  // useQueryClient permite invalidar o cache do React Query
  // manualmente. Usado após criar uma sessão para forçar a
  // lista a ser recarregada com o novo item incluído.
  // ----------------------------------------------------------
  const queryClient = useQueryClient();

  // ----------------------------------------------------------
  // Busca a lista de sessões com o filtro de modalidade ativo.
  //
  // O queryKey inclui o filtro atual para que o React Query
  // trate cada modalidade como uma cache independente. Assim,
  // ao alternar entre "Thai" e "Jiu", os dados já em cache
  // aparecem instantaneamente sem nova requisição.
  //
  // "modality || undefined" converte string vazia em undefined
  // para que o parâmetro não seja enviado na URL quando não
  // há filtro ativo.
  // ----------------------------------------------------------
  const { data: sessions, isLoading } = useListSessions(
    { modality: modality || undefined },
    { query: { queryKey: getListSessionsQueryKey({ modality: modality || undefined }) } }
  );

  // ----------------------------------------------------------
  // Busca a lista de professores para o seletor do diálogo.
  //
  // Filtra por role "teacher" para mostrar apenas professores,
  // não alunos ou admins. Esses dados são usados apenas dentro
  // do diálogo de criação de sessão.
  // ----------------------------------------------------------
  const { data: teachers } = useListUsers(
    { role: "teacher" },
    { query: { queryKey: getListUsersQueryKey({ role: "teacher" }) } }
  );

  // ----------------------------------------------------------
  // Mutation de criação de sessão
  //
  // useCreateSession retorna um objeto com o método "mutate"
  // que dispara a requisição POST para a API. O estado
  // "isPending" é usado para desabilitar o botão enquanto
  // a requisição está em andamento, evitando duplo envio.
  // ----------------------------------------------------------
  const createMutation = useCreateSession();

  // ----------------------------------------------------------
  // handleCreate — função de submissão do formulário
  //
  // Fluxo:
  // 1. Valida os campos obrigatórios (data e professor)
  // 2. Chama a mutation com os dados formatados
  // 3. Em caso de sucesso:
  //    - Invalida o cache da lista de sessões para forçar
  //      um novo fetch e mostrar a sessão recém-criada
  //    - Exibe um toast de confirmação
  //    - Fecha o diálogo
  //    - Reseta o formulário para os valores iniciais
  // 4. Em caso de erro: exibe um toast de erro
  //
  // Por que invalidateQueries e não atualizar o estado local?
  // Porque a API pode aplicar ordenação ou filtros no retorno,
  // então é mais seguro buscar a lista atualizada do servidor
  // do que tentar inserir o item manualmente no estado local.
  // ----------------------------------------------------------
  const handleCreate = () => {
    if (!form.sessionDate || !form.teacherId) {
      toast({ title: "Preencha todos os campos obrigatorios", variant: "destructive" });
      return;
    }
    createMutation.mutate(
      {
        data: {
          modality: form.modality as "thai" | "jiu",
          // Converte a string do datetime-local para ISO 8601,
          // formato esperado pela API
          sessionDate: new Date(form.sessionDate).toISOString(),
          description: form.description || undefined,
          // O select retorna string, mas a API espera número
          teacherId: parseInt(form.teacherId, 10),
        }
      },
      {
        onSuccess: () => {
          // Invalida todas as variações do cache de sessões
          // (com e sem filtro de modalidade)
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          toast({ title: "Sessao criada com sucesso" });
          setOpen(false);
          setForm({ modality: "thai", sessionDate: "", description: "", teacherId: "" });
        },
        onError: () => toast({ title: "Erro ao criar sessao", variant: "destructive" }),
      }
    );
  };

  // ----------------------------------------------------------
  // Cronograma semanal fixo
  //
  // Estes dados são estáticos — não vêm do banco de dados.
  // Representam o horário regular das aulas e servem como
  // referência visual para alunos e professores.
  // Definido dentro do componente apenas para manter o código
  // organizado; poderia estar fora se fosse reutilizado.
  // ----------------------------------------------------------
  const SCHEDULE = [
    { time: "19:00", modality: "jiu" as const,  days: "Seg – Sex",       instructor: "Instrutor Ewerton" },
    { time: "20:30", modality: "thai" as const, days: "Seg, Qua e Sex",  instructor: "Mestre Ewerton" },
    { time: "20:30", modality: "thai" as const, days: "Ter e Qui",       instructor: "Instrutor Luis" },
    { time: "10:30", modality: "thai" as const, days: "Sábado",          instructor: "Instrutor Nilberto" },
  ];

  return (
    <div className="space-y-6">

      {/* Cabeçalho com título, contagem e botão de nova sessão.
          O botão só aparece para professor/admin — alunos não
          têm permissão para criar sessões. */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Sessões</h1>
          <p className="text-muted-foreground mt-1">
            {Array.isArray(sessions) ? sessions.length : 0} sessões registradas
          </p>
        </div>
        {(user?.role === "teacher" || user?.role === "admin") && (
          <Button data-testid="button-new-session" onClick={() => setOpen(true)}>
            <Plus size={16} className="mr-2" /> Nova Sessão
          </Button>
        )}
      </div>

      {/* --------------------------------------------------------
          Cronograma semanal fixo

          Exibido sempre, independente de loading ou filtros.
          Cada item tem cor diferente baseada na modalidade:
          vermelho para Muay Thai, azul para Jiu-Jitsu.
          O endereço da academia é exibido no canto superior
          direito do bloco como referência de localização.
      -------------------------------------------------------- */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Cronograma Semanal
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin size={11} /> Av. Julio Buono, 2224
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {SCHEDULE.map((item, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border ${
                item.modality === "thai"
                  ? "bg-red-500/10 border-red-500/20"
                  : "bg-blue-500/10 border-blue-500/20"
              }`}
            >
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

      {/* --------------------------------------------------------
          Botões de filtro por modalidade

          Ao clicar em um botão, atualiza o estado "modality",
          que por sua vez atualiza o queryParams e dispara uma
          nova requisição à API com o filtro selecionado.

          O botão ativo recebe variant="default" (cor de destaque)
          e os demais recebem variant="outline" (borda simples).
      -------------------------------------------------------- */}
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

      {/* --------------------------------------------------------
          Lista de sessões

          Três estados possíveis:
          1. isLoading → exibe 5 skeletons pulsantes
          2. Array válido com itens → exibe a lista de sessões
          3. Array vazio ou dado inválido → mensagem de estado vazio

          Cada item da lista é um Link clicável que leva à página
          de detalhes daquela sessão específica.

          Por que Array.isArray(sessions)?
          Proteção contra respostas inesperadas da API. Se a API
          retornar um objeto em vez de array, .map() lançaria o
          erro "sessions.map is not a function" e quebraria a página.
      -------------------------------------------------------- */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : Array.isArray(sessions) && sessions.length > 0 ? (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/sessions/${session.id}`}
              data-testid={`row-session-${session.id}`}
            >
              <div className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-all cursor-pointer flex items-center gap-4">

                {/* Ícone de modalidade: "MT" para Muay Thai, "JJ" para Jiu-Jitsu.
                    A cor do fundo e da borda muda conforme a modalidade. */}
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-black text-sm shrink-0 ${
                  session.modality === "thai"
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                }`}>
                  {session.modality === "thai" ? "MT" : "JJ"}
                </div>

                {/* Informações principais: nome da modalidade, data/hora
                    formatada em pt-BR, nome do professor e descrição opcional */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">
                    {session.modality === "thai" ? "Muay Thai" : "Jiu-Jitsu"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(session.sessionDate).toLocaleString("pt-BR")} &mdash; Prof. {session.teacherName}
                  </div>
                  {session.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {session.description}
                    </div>
                  )}
                </div>

                {/* Contagem de presenças e seta de navegação */}
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

      {/* --------------------------------------------------------
          Diálogo de criação de sessão

          Controlado pelo estado "open". Contém 4 campos:
          1. Modalidade (select): Muay Thai ou Jiu-Jitsu
          2. Data e hora (datetime-local): quando a sessão ocorreu
          3. Professor (select): populado com a lista da API
          4. Descrição (input texto, opcional): tema da aula

          O botão "Criar Sessão" fica desabilitado enquanto a
          mutation está em andamento (isPending) para evitar
          duplo envio acidental.

          "onOpenChange={setOpen}" permite fechar o diálogo
          clicando fora dele ou no botão "Cancelar".
      -------------------------------------------------------- */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Sessao de Treino</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">

            {/* Campo 1: Modalidade */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Modalidade</label>
              <Select
                value={form.modality}
                onValueChange={(v) => setForm(f => ({ ...f, modality: v }))}
              >
                <SelectTrigger data-testid="select-session-modality">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="thai">Muay Thai</SelectItem>
                  <SelectItem value="jiu">Jiu-Jitsu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Campo 2: Data e hora
                O input type="datetime-local" exibe um seletor
                nativo do browser para data e hora combinados */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Data e Hora</label>
              <Input
                data-testid="input-session-date"
                type="datetime-local"
                value={form.sessionDate}
                onChange={(e) => setForm(f => ({ ...f, sessionDate: e.target.value }))}
              />
            </div>

            {/* Campo 3: Professor
                Populado dinamicamente com os dados da API.
                O Array.isArray protege caso teachers não seja array. */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Professor</label>
              <Select
                value={form.teacherId}
                onValueChange={(v) => setForm(f => ({ ...f, teacherId: v }))}
              >
                <SelectTrigger data-testid="select-session-teacher">
                  <SelectValue placeholder="Selecionar professor..." />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(teachers) && teachers.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Campo 4: Descrição (opcional) */}
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
            <Button
              data-testid="button-create-session"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Criando..." : "Criar Sessao"}
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

    </div>
  );
}
// Página de controle de mensalidades (uso de professor/admin). Lista os alunos do
// mês/ano selecionado separando pagos e pendentes, permite alternar o status de
// pagamento e navegar entre meses. Os dados vêm da API por mês/ano.
import { useState } from "react";
import { useListPayments, useMarkPayment, useUnmarkPayment, getListPaymentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, ChevronLeft, ChevronRight, Users, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// Nomes dos meses em pt-BR (índice 0 = Janeiro) usados no cabeçalho de navegação.
const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export default function Payments() {
  const now = new Date();
  // Mês/ano atualmente visualizados (inicia no mês corrente). month é 1-12.
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  // Id do aluno cuja mutation está em andamento — usado para mostrar spinner e
  // bloquear cliques simultâneos em outras linhas.
  const [pendingId, setPendingId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Lista de pagamentos do mês/ano selecionado.
  const { data: payments, isLoading } = useListPayments(
    { month, year },
    { query: { queryKey: getListPaymentsQueryKey({ month, year }) } }
  );

  const markMutation = useMarkPayment();     // marca mensalidade como paga
  const unmarkMutation = useUnmarkPayment(); // remove a marcação de pago

  // Revalida a lista do mês atual após uma alteração para refletir o novo status.
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey({ month, year }) });

  // Alterna o status de pagamento de um aluno. Ignora cliques se já houver uma
  // operação em andamento; escolhe marcar ou desmarcar conforme o estado atual.
  const handleToggle = (studentId: number, paid: boolean, name: string) => {
    if (pendingId !== null) return;
    setPendingId(studentId);
    if (paid) {
      unmarkMutation.mutate(
        { studentId, year, month },
        {
          onSuccess: () => { invalidate(); toast({ title: `${name} desmarcado` }); },
          onError: () => toast({ title: "Erro ao desmarcar", variant: "destructive" }),
          onSettled: () => setPendingId(null),
        }
      );
    } else {
      markMutation.mutate(
        { studentId, year, month, data: {} },
        {
          onSuccess: () => { invalidate(); toast({ title: `${name} marcado como pago ✓` }); },
          onError: () => toast({ title: "Erro ao marcar", variant: "destructive" }),
          onSettled: () => setPendingId(null),
        }
      );
    }
  };

  // Navegação para o mês anterior; ao passar de Janeiro volta para Dezembro do
  // ano anterior.
  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  // Navegação para o próximo mês; ao passar de Dezembro avança para Janeiro do
  // ano seguinte.
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Separa os pagamentos em duas listas: pagos e pendentes, para exibição em seções.
  const paid = payments?.filter(p => p.paid) ?? [];
  const pending = payments?.filter(p => !p.paid) ?? [];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-black tracking-tight uppercase">Mensalidades</h1>
        <p className="text-muted-foreground mt-1">Controle de pagamentos da academia</p>
      </div>

      {/* Navegação de mês */}
      <div className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
        <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft size={18} /></Button>
        <div className="text-center">
          <div className="font-black text-xl uppercase tracking-wide">{MONTHS[month - 1]}</div>
          <div className="text-sm text-muted-foreground">{year}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight size={18} /></Button>
      </div>

      {/* Resumo */}
      {payments && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-lg p-4 text-center">
            <div className="text-2xl font-black text-foreground">{payments.length}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1"><Users size={12} /> Total</div>
          </div>
          <div className="bg-card border border-green-500/30 rounded-lg p-4 text-center">
            <div className="text-2xl font-black text-green-400">{paid.length}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1"><CheckCircle2 size={12} className="text-green-400" /> Pagos</div>
          </div>
          <div className="bg-card border border-red-500/30 rounded-lg p-4 text-center">
            <div className="text-2xl font-black text-primary">{pending.length}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1"><AlertCircle size={12} className="text-primary" /> Pendentes</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-lg h-16 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pendentes */}
          {pending.length > 0 && (
            <div className="space-y-1.5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                <AlertCircle size={12} /> Pendentes ({pending.length})
              </h2>
              {pending.map(p => (
                <PaymentRow
                  key={p.studentId}
                  entry={p}
                  month={month}
                  onToggle={handleToggle}
                  pending={pendingId === p.studentId}
                  disabled={pendingId !== null}
                />
              ))}
            </div>
          )}

          {/* Pagos */}
          {paid.length > 0 && (
            <div className="space-y-1.5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-green-400 flex items-center gap-2">
                <CheckCircle2 size={12} /> Pagos ({paid.length})
              </h2>
              {paid.map(p => (
                <PaymentRow
                  key={p.studentId}
                  entry={p}
                  month={month}
                  onToggle={handleToggle}
                  pending={pendingId === p.studentId}
                  disabled={pendingId !== null}
                />
              ))}
            </div>
          )}

          {payments?.length === 0 && (
            <div className="flex flex-col items-center py-20 text-center text-muted-foreground">
              <Users size={40} className="mb-3 opacity-30" />
              <p>Nenhum aluno cadastrado</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Tipo de uma entrada de pagamento (um aluno em determinado mês/ano).
type PaymentEntry = {
  studentId: number;
  name: string;
  profilePhotoUrl?: string | null;
  paymentDay?: number | null;
  paid: boolean;
  paidAt?: string | null;
  notes?: string | null;
  month?: number;
  year?: number;
};

// Linha de pagamento de um aluno: foto, nome, status/vencimento e botão para
// alternar entre pago/pendente (com spinner durante a operação).
function PaymentRow({ entry, month, onToggle, pending, disabled }: {
  entry: PaymentEntry;
  month: number;
  onToggle: (id: number, paid: boolean, name: string) => void;
  pending: boolean;
  disabled: boolean;
}) {
  // Texto de vencimento (dia do mês) quando o aluno tem dia de pagamento definido.
  const vencimento = entry.paymentDay
    ? `Vence dia ${entry.paymentDay}`
    : null;

  // Data formatada do pagamento já confirmado, quando existir.
  const paidDate = entry.paidAt
    ? new Date(entry.paidAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : null;

  return (
    <div className={`bg-card border rounded-lg px-4 py-3 flex items-center gap-3 transition-colors ${entry.paid ? "border-green-500/20" : "border-border"}`}>
      <div className="w-9 h-9 rounded-full bg-muted border border-border overflow-hidden shrink-0">
        {entry.profilePhotoUrl
          ? <img src={entry.profilePhotoUrl} alt={entry.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">{entry.name.charAt(0)}</div>
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{entry.name}</div>
        <div className="text-xs text-muted-foreground">
          {entry.paid && paidDate
            ? <span className="text-green-400">Pago em {paidDate}</span>
            : vencimento
              ? <span className={entry.paymentDay && entry.paymentDay < new Date().getDate() && !entry.paid ? "text-primary" : ""}>{vencimento}</span>
              : <span>Sem dia definido</span>
          }
        </div>
      </div>

      <button
        onClick={() => onToggle(entry.studentId, entry.paid, entry.name)}
        disabled={disabled}
        className="shrink-0 transition-colors"
        title={entry.paid ? "Clique para desmarcar" : "Clique para marcar como pago"}
      >
        {pending
          ? <Loader2 size={24} className="animate-spin text-muted-foreground" />
          : entry.paid
            ? <CheckCircle2 size={24} className="text-green-400 hover:text-green-300" />
            : <Circle size={24} className="text-muted-foreground hover:text-foreground" />
        }
      </button>
    </div>
  );
}

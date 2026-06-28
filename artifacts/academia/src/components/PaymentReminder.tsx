// Componente sem UI própria que exibe um toast lembrando o usuário do
// vencimento da mensalidade. Compara o dia de pagamento do usuário com a data
// atual e mostra mensagens diferentes quando faltam 0 a 3 dias. Dispara no
// máximo uma vez por sessão (controlado via sessionStorage), salvo no modo de
// teste (?testReminder=true) usado para visualizar o aviso.
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

// Chave em sessionStorage que evita repetir o lembrete na mesma sessão.
const SESSION_KEY = "payment_reminder_shown";

export function PaymentReminder() {
  const { user } = useAuth();
  const { toast } = useToast();
  // Modo de teste: ativado por ?testReminder=true para forçar a exibição.
  const [isTest] = useState(
    () => new URLSearchParams(window.location.search).get("testReminder") === "true"
  );
  // Guard para garantir que o lembrete só dispare uma vez por montagem.
  const fired = useRef(false);

  useEffect(() => {
    // Sem usuário ou já disparado nesta instância: não faz nada.
    if (!user || fired.current) return;

    // Modo de teste: dispara o toast de "dia de pagamento" imediatamente,
    // ignorando a checagem de data e o controle de sessão.
    if (isTest) {
      fired.current = true;
      const day = user.paymentDay ?? new Date().getDate();
      setTimeout(() => {
        toast({
          title: "Hoje é seu dia de pagamento!",
          description: `Lembre-se de pagar a mensalidade hoje (dia ${day}). Valor: R$ 80,00 — PIX: frontartesmarciais@gmail.com`,
          duration: 8000,
        });
      }, 600);
      return;
    }

    // Sem dia de pagamento definido, ou já exibido nesta sessão: não lembra.
    if (!user.paymentDay) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    // Calcula quantos dias faltam para o dia de vencimento neste mês.
    const today = new Date().getDate();
    const day = user.paymentDay;
    const diff = day - today;

    // Define título/descrição conforme a proximidade do vencimento (0 a 3 dias).
    let title = "";
    let description = "";

    if (diff === 0) {
      title = "Hoje é seu dia de pagamento!";
      description = `Lembre-se de pagar a mensalidade hoje (dia ${day}). Valor: R$ 80,00 — PIX: frontartesmarciais@gmail.com`;
    } else if (diff === 1) {
      title = "Mensalidade vence amanhã!";
      description = `Seu pagamento vence amanhã, dia ${day}. Não deixe para última hora!`;
    } else if (diff === 2 || diff === 3) {
      title = `Mensalidade vence em ${diff} dias`;
      description = `Seu dia de pagamento é dia ${day}. Fique atento!`;
    }

    // Só exibe se alguma das condições acima preencheu o título.
    if (title) {
      fired.current = true;
      sessionStorage.setItem(SESSION_KEY, "1");
      // Pequeno atraso para o toast aparecer após a tela carregar.
      setTimeout(() => {
        toast({ title, description, duration: 8000 });
      }, 1500);
    }
  }, [user, isTest, toast]);

  // Componente puramente lateral (efeito de toast); não renderiza nenhuma UI.
  return null;
}

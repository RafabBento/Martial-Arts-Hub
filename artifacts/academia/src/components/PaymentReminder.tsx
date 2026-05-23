import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const SESSION_KEY = "payment_reminder_shown";

export function PaymentReminder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const shown = useRef(false);

  useEffect(() => {
    if (!user || shown.current) return;

    const params = new URLSearchParams(window.location.search);
    const isTest = params.get("testReminder") === "true";

    if (isTest) {
      shown.current = true;
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

    if (!user.paymentDay) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    const today = new Date().getDate();
    const day = user.paymentDay;
    const diff = day - today;

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

    if (title) {
      shown.current = true;
      sessionStorage.setItem(SESSION_KEY, "1");
      setTimeout(() => {
        toast({ title, description, duration: 8000 });
      }, 1500);
    }
  }, [user, toast]);

  return null;
}

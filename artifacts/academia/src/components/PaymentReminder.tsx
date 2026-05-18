import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const SESSION_KEY = "payment_reminder_shown";

export function PaymentReminder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const shown = useRef(false);

  useEffect(() => {
    if (!user?.paymentDay || shown.current) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    const today = new Date().getDate();
    const day = user.paymentDay;
    const diff = day - today;

    let title = "";
    let description = "";

    if (diff === 0) {
      title = "Hoje é seu dia de pagamento!";
      description = `Lembre-se de pagar a mensalidade hoje (dia ${day}).`;
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

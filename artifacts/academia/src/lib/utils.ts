// Utilitários gerais da aplicação web.
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// cn: combina classes condicionais (clsx) e resolve conflitos de classes do
// Tailwind (twMerge). Ex.: cn("p-2", cond && "p-4") -> "p-4" sem duplicatas.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

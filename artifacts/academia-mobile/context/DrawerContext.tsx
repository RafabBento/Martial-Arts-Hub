// Contexto que controla o estado (aberta/fechada) da gaveta lateral e expõe as
// ações open()/close() para qualquer tela. Também monta a AppDrawer sobre o app.
import React, { createContext, useCallback, useContext, useState } from "react";
import { AppDrawer } from "@/components/AppDrawer";

// Tipo do contexto: estado de aberta/fechada e ações para controlar a gaveta.
type DrawerContextType = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

const DrawerContext = createContext<DrawerContextType | null>(null);

/**
 * Provedor da gaveta lateral.
 *
 * Guarda se a gaveta está aberta e disponibiliza as funções open()/close()
 * para qualquer tela filha (usadas pelo botão de menu — três barrinhas).
 * Também renderiza a própria AppDrawer por cima do conteúdo.
 */
export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <DrawerContext.Provider value={{ isOpen, open, close }}>
      {children}
      <AppDrawer isOpen={isOpen} onClose={close} />
    </DrawerContext.Provider>
  );
}

/** Hook para acessar o controle da gaveta a partir de qualquer tela. */
export function useAppDrawer() {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error("useAppDrawer deve ser usado dentro de DrawerProvider");
  return ctx;
}

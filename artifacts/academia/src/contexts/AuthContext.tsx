// Contexto de autenticação da aplicação web.
// Expõe o usuário logado, o estado de carregamento e um setter para atualizar o
// usuário (ex.: após login/logout ou edição de perfil). A sessão é baseada em
// cookie: ao montar, busca /me para descobrir se há sessão ativa.
import { createContext, useContext, useEffect, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";

// Formato do valor disponibilizado pelo contexto aos componentes consumidores.
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
}

// Valor padrão do contexto (usado quando não há provider acima na árvore).
const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  setUser: () => {},
});

// Provider que mantém o usuário autenticado e o disponibiliza para a árvore.
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);

  // Busca o usuário da sessão atual (/me). retry:false evita reintentos quando
  // não há sessão (401), tratando o caso de usuário deslogado como normal.
  const { data: me, isLoading } = useGetMe({ 
    query: {
      retry: false,
      queryKey: ["me"],
    } 
  });

  // Quando os dados de /me chegam, sincroniza o estado local do usuário.
  useEffect(() => {
    if (me && !isLoading) {
      setUser(me);
    }
  }, [me, isLoading]);

  return (
    <AuthContext.Provider value={{ user, isLoading, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook utilitário para consumir o contexto de autenticação em qualquer componente.
export const useAuth = () => useContext(AuthContext);

// Contexto de autenticação do app mobile. Mantém o usuário e o token logados,
// persiste a sessão no AsyncStorage (restaurando ao abrir o app) e conecta o
// token ao cliente de API para que as requisições sejam autenticadas.
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";

// Configura a URL base do cliente de API a partir do domínio do ambiente Expo.
const API_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
setBaseUrl(`https://${API_DOMAIN}`);

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Estado da sessão: usuário, token e flag de carregamento inicial.
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Ao montar, restaura a sessão salva no AsyncStorage (login persistente).
  useEffect(() => {
    const restore = async () => {
      try {
        const [storedUser, storedToken] = await Promise.all([
          AsyncStorage.getItem("auth_user"),
          AsyncStorage.getItem("auth_token"),
        ]);
        if (storedUser && storedToken) {
          setUser(JSON.parse(storedUser));
          setToken(storedToken);
        }
      } catch {}
      // Sinaliza que a tentativa de restauração terminou (com ou sem sessão).
      setIsLoading(false);
    };
    restore();
  }, []);

  // Mantém o cliente de API sincronizado com o token atual, de forma que toda
  // requisição use o Bearer token vigente (ou nenhum, após logout).
  useEffect(() => {
    setAuthTokenGetter(() => token);
  }, [token]);

  // Efetua login: persiste usuário/token e atualiza o estado em memória.
  const login = async (u: User, t: string) => {
    await Promise.all([
      AsyncStorage.setItem("auth_user", JSON.stringify(u)),
      AsyncStorage.setItem("auth_token", t),
    ]);
    setUser(u);
    setToken(t);
  };

  // Efetua logout: remove a sessão persistida e limpa o estado em memória.
  const logout = async () => {
    await Promise.all([
      AsyncStorage.removeItem("auth_user"),
      AsyncStorage.removeItem("auth_token"),
    ]);
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook de acesso ao contexto de autenticação; falha se usado fora do provider.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used dentro de AuthProvider");
  return ctx;
}

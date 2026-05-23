import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";

const API_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
setBaseUrl(`https://${API_DOMAIN}`);

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      setIsLoading(false);
    };
    restore();
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => token);
  }, [token]);

  const login = async (u: User, t: string) => {
    await Promise.all([
      AsyncStorage.setItem("auth_user", JSON.stringify(u)),
      AsyncStorage.setItem("auth_token", t),
    ]);
    setUser(u);
    setToken(t);
  };

  const logout = async () => {
    await Promise.all([
      AsyncStorage.removeItem("auth_user"),
      AsyncStorage.removeItem("auth_token"),
    ]);
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used dentro de AuthProvider");
  return ctx;
}

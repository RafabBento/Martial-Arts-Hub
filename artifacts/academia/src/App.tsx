// Componente raiz da aplicação web.
// Concentra a configuração global (TanStack Query, contexto de autenticação,
// tooltips e toasts) e define o roteamento (wouter) com rotas públicas e
// protegidas. Também monta utilitários globais como lembrete de pagamento e
// o prompt de instalação do PWA.
import React from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { PaymentReminder } from "./components/PaymentReminder";
import { InstallPrompt } from "./components/InstallPrompt";
import { Layout } from "./components/Layout";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import StudentDetail from "./pages/StudentDetail";
import Sessions from "./pages/Sessions";
import SessionDetail from "./pages/SessionDetail";
import Attendance from "./pages/Attendance";
import Rankings from "./pages/Rankings";
import Profile from "./pages/Profile";
import Payments from "./pages/Payments";

// Cliente único do TanStack Query usado em toda a aplicação.
// Padrões: tenta novamente apenas 1 vez em caso de falha e não refaz a busca
// automaticamente quando a janela volta ao foco (evita requisições excessivas).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Rota protegida: exige usuário autenticado.
// Enquanto o estado de auth carrega exibe um spinner; se não houver usuário
// redireciona para /login; caso contrário renderiza o componente dentro do Layout.
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Após terminar o carregamento, se não houver usuário logado, manda para o login.
  React.useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [isLoading, user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background dark">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Sem usuário (e já redirecionando), não renderiza nada para evitar flash de conteúdo.
  if (!user) return null;

  // Usuário autenticado: renderiza a página dentro do layout com sidebar/cabeçalho.
  return (
    <Layout>
      <Component />
    </Layout>
  );
}

// Rota pública: páginas acessíveis sem login (home, login, cadastro).
// Se um usuário já autenticado tentar acessar essas rotas, é redirecionado
// automaticamente para o painel (/dashboard).
function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  // Usuário logado acessando home/login/register é levado direto ao painel.
  React.useEffect(() => {
    if (!isLoading && user && (location === "/login" || location === "/register" || location === "/")) {
      setLocation("/dashboard");
    }
  }, [isLoading, user, location, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background dark">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Evita renderizar a página pública por um instante antes do redirecionamento.
  if (user && (location === "/login" || location === "/register" || location === "/")) return null;

  return <Component />;
}

// Tabela de rotas da aplicação.
// <Switch> renderiza apenas a primeira <Route> que casa com a URL atual.
// As três primeiras são públicas; as demais exigem autenticação; a última
// (sem path) funciona como fallback 404.
function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <PublicRoute component={Home} />} />
      <Route path="/login" component={() => <PublicRoute component={Login} />} />
      <Route path="/register" component={() => <PublicRoute component={Register} />} />
      
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/students" component={() => <ProtectedRoute component={Students} />} />
      <Route path="/students/:id" component={() => <ProtectedRoute component={StudentDetail} />} />
      <Route path="/sessions" component={() => <ProtectedRoute component={Sessions} />} />
      <Route path="/sessions/:id" component={() => <ProtectedRoute component={SessionDetail} />} />
      <Route path="/attendance" component={() => <ProtectedRoute component={Attendance} />} />
      <Route path="/rankings" component={() => <ProtectedRoute component={Rankings} />} />
      <Route path="/profile" component={() => <ProtectedRoute component={Profile} />} />
      <Route path="/payments" component={() => <ProtectedRoute component={Payments} />} />
      
      {/* Rota curinga: qualquer URL não reconhecida cai na página 404. */}
      <Route component={NotFound} />
    </Switch>
  );
}

// Composição dos provedores globais que envolvem toda a aplicação:
// - QueryClientProvider: cache/estado de requisições (TanStack Query)
// - AuthProvider: estado de autenticação do usuário
// - TooltipProvider: suporte a tooltips (Radix)
// - WouterRouter: roteamento, usando BASE_URL como base (sem a barra final)
// Além do roteador, monta utilitários globais: lembrete de pagamento,
// prompt de instalação do PWA e o container de toasts.
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <PaymentReminder />
          <InstallPrompt />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

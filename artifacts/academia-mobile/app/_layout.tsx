// Layout raiz do app mobile (expo-router). Este é o ponto de entrada de TODAS
// as rotas: carrega as fontes, registra os providers globais (React Query,
// gestos, teclado, área segura, autenticação) e define a pilha de navegação
// (Stack) com as telas de nível superior.
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";

// Impede a splash screen nativa de sumir sozinha; só a escondemos manualmente
// depois que as fontes terminam de carregar (ver useEffect abaixo).
SplashScreen.preventAutoHideAsync();

// Instância única do cliente do React Query usada por todo o app para cache de
// requisições (queries) e mutações.
const queryClient = new QueryClient();

// Define a pilha de navegação e protege as rotas: se não houver usuário logado,
// redireciona para a tela de login. Precisa estar dentro do AuthProvider para
// poder usar o hook useAuth.
function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // Sempre que o estado de autenticação muda, decide se redireciona para login.
  // Enquanto ainda está carregando a sessão (isLoading) não faz nada.
  React.useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
    }
  }, [user, isLoading]);

  // Enquanto a sessão é restaurada, não renderiza nada (evita "piscar" telas).
  if (isLoading) return null;

  // Pilha de telas de nível superior. headerShown:false porque cada tela
  // desenha seu próprio cabeçalho. As rotas com [id] são dinâmicas (detalhe).
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="student/[id]" />
      <Stack.Screen name="session/[id]" />
    </Stack>
  );
}

// Componente raiz exportado para o expo-router. Carrega as fontes Inter e só
// libera a renderização do app (e esconde a splash) quando elas estiverem
// prontas, montando então toda a árvore de providers.
export default function RootLayout() {
  // Carrega as variações da fonte Inter usadas em todo o app.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Esconde a splash screen assim que as fontes carregarem (ou falharem).
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Mantém a splash visível enquanto as fontes ainda não resolveram.
  if (!fontsLoaded && !fontError) return null;

  // Ordem dos providers (de fora para dentro): área segura → captura de erros →
  // React Query → gestos → teclado → autenticação → navegação.
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <RootLayoutNav />
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

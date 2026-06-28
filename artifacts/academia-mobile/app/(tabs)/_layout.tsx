import { Tabs } from "expo-router";
import React from "react";
import { DrawerProvider } from "@/context/DrawerContext";

/**
 * Layout das telas principais.
 *
 * A navegação agora é feita pela gaveta lateral (DrawerProvider + AppDrawer),
 * acionada pelo botão de menu (três barrinhas) no cabeçalho de cada tela.
 * Por isso a barra de abas inferior padrão fica escondida — mantemos as
 * <Tabs.Screen> apenas para registrar as rotas das telas.
 */
export default function TabLayout() {
  return (
    <DrawerProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: "none" },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Início" }} />
        <Tabs.Screen name="students" options={{ title: "Alunos" }} />
        <Tabs.Screen name="sessions" options={{ title: "Sessões" }} />
        <Tabs.Screen name="attendance" options={{ title: "Presença" }} />
        <Tabs.Screen name="payments" options={{ title: "Mensalidade" }} />
        <Tabs.Screen name="rankings" options={{ title: "Rankings" }} />
        <Tabs.Screen name="profile" options={{ title: "Perfil" }} />
      </Tabs>
    </DrawerProvider>
  );
}

// Componente da gaveta lateral de navegação do app mobile (espelha a sidebar
// da versão web). Renderiza o menu de telas, destaca a rota atual e oferece
// atalhos de Perfil/Sair. É montado pelo DrawerProvider e animado com Animated.
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

// Largura da gaveta lateral (equivale ao "w-72" usado na versão web).
const DRAWER_WIDTH = 288;

// Cada item de navegação da gaveta: rótulo, rota de destino e ícone.
type NavItem = {
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
};

/**
 * Gaveta lateral de navegação (espelha a sidebar da versão web).
 *
 * Desliza da esquerda para a direita quando aberta. Mostra o logo da academia,
 * a lista de telas e, no rodapé, os atalhos de Perfil e Sair.
 *
 * É renderizada pelo DrawerProvider e fica sempre montada; quando fechada ela
 * sai da tela (translateX negativo) e deixa de capturar toques (pointerEvents).
 */
export function AppDrawer({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Professores e administradores têm acesso ao controle de presença.
  const isMaster = user?.role === "teacher" || user?.role === "admin";

  // Valores animados: posição horizontal do painel e opacidade do fundo escuro.
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fade = useRef(new Animated.Value(0)).current;

  // Mantém a captura de toques ativa enquanto a animação de fechar está rodando,
  // evitando que um toque "vaze" para a tela de baixo durante o deslize de saída.
  const [interactive, setInteractive] = useState(isOpen);

  // Sempre que "isOpen" muda, animamos o painel e o fundo em paralelo.
  useEffect(() => {
    // Ao abrir, já capturamos toques de imediato.
    if (isOpen) setInteractive(true);
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: isOpen ? 0 : -DRAWER_WIDTH,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: isOpen ? 1 : 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Só liberamos os toques para a tela de baixo após o fechamento terminar.
      if (!isOpen) setInteractive(false);
    });
  }, [isOpen, translateX, fade]);

  // Itens principais da gaveta (a Presença só aparece para mestres).
  const items: NavItem[] = [
    { label: "Início", route: "/", icon: "home-outline" },
    { label: "Alunos", route: "/students", icon: "people-outline" },
    { label: "Sessões", route: "/sessions", icon: "calendar-outline" },
    ...(isMaster
      ? [{ label: "Presença", route: "/attendance", icon: "camera-outline" as const }]
      : []),
    { label: "Rankings", route: "/rankings", icon: "trophy-outline" },
    { label: "Mensalidade", route: "/payments", icon: "card-outline" },
  ];

  // Fecha a gaveta e navega até a rota escolhida.
  const go = (route: string) => {
    onClose();
    router.navigate(route as never);
  };

  // Encerra a sessão; o layout raiz redireciona para o login quando não há usuário.
  const handleLogout = async () => {
    onClose();
    await logout();
    router.replace("/login");
  };

  // Marca o item atual como ativo (destaque vermelho), igual à web.
  const isActive = (route: string) =>
    route === "/" ? pathname === "/" : pathname.startsWith(route);

  return (
    // Quando fechada (e sem animação em curso), pointerEvents="none" deixa os
    // toques passarem para a tela de baixo.
    <View style={StyleSheet.absoluteFill} pointerEvents={interactive ? "auto" : "none"}>
      {/* Fundo escuro: tocar nele fecha a gaveta. */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Painel deslizante da esquerda. */}
      <Animated.View
        style={[
          styles.panel,
          {
            width: DRAWER_WIDTH,
            backgroundColor: colors.card,
            borderRightColor: colors.border,
            paddingTop: insets.top,
            transform: [{ translateX }],
          },
        ]}
      >
        {/* Cabeçalho com o logo e o botão de fechar. */}
        <View style={[styles.brand, { borderBottomColor: colors.border }]}>
          <View style={styles.brandLeft}>
            <View
              style={[
                styles.logoCircle,
                { borderColor: colors.primary, backgroundColor: colors.primary + "1A" },
              ]}
            >
              <Ionicons name="skull-outline" size={22} color={colors.primary} />
            </View>
            <Text
              style={[styles.brandText, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}
              numberOfLines={2}
            >
              FRONT ARTES MARCIAIS
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Lista de telas. */}
        <View style={styles.nav}>
          {items.map(item => {
            const active = isActive(item.route);
            return (
              <TouchableOpacity
                key={item.route}
                style={[styles.item, active && { backgroundColor: colors.primary }]}
                onPress={() => go(item.route)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={active ? "#fff" : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.itemText,
                    {
                      color: active ? "#fff" : colors.mutedForeground,
                      fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Rodapé: Perfil e Sair. */}
        <View
          style={[
            styles.footer,
            { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 },
          ]}
        >
          <TouchableOpacity
            style={[styles.item, isActive("/profile") && { backgroundColor: colors.primary }]}
            onPress={() => go("/profile")}
            activeOpacity={0.8}
          >
            <Ionicons
              name="person-outline"
              size={20}
              color={isActive("/profile") ? "#fff" : colors.mutedForeground}
            />
            <Text
              style={[
                styles.itemText,
                {
                  color: isActive("/profile") ? "#fff" : colors.mutedForeground,
                  fontFamily: "Inter_500Medium",
                },
              ]}
            >
              Perfil
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.logoutBtn, { backgroundColor: colors.destructive }]}
            onPress={handleLogout}
            activeOpacity={0.85}
          >
            <Ionicons name="log-out-outline" size={20} color="#fff" />
            <Text style={[styles.logoutText, { fontFamily: "Inter_600SemiBold" }]}>Sair</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.8)" },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: 1,
    elevation: 16,
    zIndex: 50,
  },
  brand: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    marginTop: 8,
  },
  brandLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, paddingRight: 8 },
  logoCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: { fontSize: 15, letterSpacing: 0.5, flex: 1 },
  nav: { flex: 1, paddingHorizontal: 12, paddingTop: 16, gap: 4 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
  },
  itemText: { fontSize: 15 },
  footer: { paddingHorizontal: 12, paddingTop: 12, borderTopWidth: 1, gap: 8 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
  },
  logoutText: { fontSize: 15, color: "#fff" },
});

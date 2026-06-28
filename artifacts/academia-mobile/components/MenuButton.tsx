// Botão de menu (hambúrguer) reutilizável que dispara a abertura da gaveta
// lateral. Usado nos cabeçalhos das telas principais do app mobile.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { useAppDrawer } from "@/context/DrawerContext";
import { useColors } from "@/hooks/useColors";

/**
 * Botão "três barrinhas" (hambúrguer) que abre a gaveta lateral.
 *
 * Fica no canto superior esquerdo do cabeçalho de cada tela principal.
 */
export function MenuButton() {
  const { open } = useAppDrawer();
  const colors = useColors();

  return (
    <TouchableOpacity
      onPress={open}
      hitSlop={10}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel="Abrir menu"
    >
      <Ionicons name="menu" size={26} color={colors.foreground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: 2, paddingRight: 6 },
});

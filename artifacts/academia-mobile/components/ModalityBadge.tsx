// Selo (badge) que identifica visualmente a modalidade do aluno/sessão:
// vermelho para Muay Thai e azul para Jiu-Jitsu. Suporta um tamanho compacto.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface ModalityBadgeProps {
  modality: "thai" | "jiu";
  small?: boolean;
}

export function ModalityBadge({ modality, small }: ModalityBadgeProps) {
  const colors = useColors();
  // Define cores de fundo, borda, texto e rótulo conforme a modalidade.
  const isThai = modality === "thai";
  const bg = isThai ? "#3b0a0a" : "#0a1a3b";
  const borderColor = isThai ? colors.thai : colors.jiu;
  const textColor = isThai ? colors.thai : colors.jiu;
  const label = isThai ? "MUAY THAI" : "JIU-JITSU";

  return (
    <View style={[
      styles.badge,
      { backgroundColor: bg, borderColor },
      small && styles.small,
    ]}>
      <Text style={[
        styles.text,
        { color: textColor, fontFamily: "Inter_700Bold" },
        small && styles.smallText,
      ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  small: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  text: {
    fontSize: 11,
    letterSpacing: 0.8,
  },
  smallText: {
    fontSize: 9,
  },
});

import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useListPayments,
  useMarkPayment,
  useUnmarkPayment,
  getListPaymentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { MenuButton } from "@/components/MenuButton";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function PaymentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; type?: "ok" | "err" } | null>(null);

  const isMaster = user?.role === "teacher" || user?.role === "admin";

  const queryKey = getListPaymentsQueryKey({ month, year });
  const { data: payments, isLoading, refetch } = useListPayments(
    { month, year },
    { query: { queryKey } }
  );

  const markMutation = useMarkPayment();
  const unmarkMutation = useUnmarkPayment();

  if (!user && !authLoading) return <Redirect href="/login" />;

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleToggle = (studentId: number, paid: boolean, name: string) => {
    if (pendingId !== null) return;
    setPendingId(studentId);
    if (paid) {
      unmarkMutation.mutate(
        { studentId, year, month },
        {
          onSuccess: () => {
            invalidate();
            refetch();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            showToast(`${name.split(" ")[0]} desmarcado`);
          },
          onError: () => showToast("Erro ao desmarcar", "err"),
          onSettled: () => setPendingId(null),
        }
      );
    } else {
      markMutation.mutate(
        { studentId, year, month, data: {} },
        {
          onSuccess: () => {
            invalidate();
            refetch();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showToast(`${name.split(" ")[0]} marcado como pago ✓`);
          },
          onError: () => showToast("Erro ao marcar pagamento", "err"),
          onSettled: () => setPendingId(null),
        }
      );
    }
  };

  const copyPix = async () => {
    await Clipboard.setStringAsync("frontartesmarciais@gmail.com");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast("Chave PIX copiada!");
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const paidList = payments?.filter(p => p.paid) ?? [];
  const pendingList = payments?.filter(p => !p.paid) ?? [];
  const myPayment = payments?.find(p => p.studentId === user?.id);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Toast */}
      {toast && (
        <View style={[styles.toast, { backgroundColor: toast.type === "err" ? "#7f1d1d" : "#166534" }]}>
          <Ionicons name={toast.type === "err" ? "alert-circle" : "checkmark-circle"} size={16} color="#fff" />
          <Text style={[styles.toastText, { fontFamily: "Inter_500Medium" }]}>{toast.msg}</Text>
        </View>
      )}

      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <MenuButton />
          <View>
            <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Mensalidades</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {isMaster ? "Controle de pagamentos" : "Minha situação"}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: botPad + 24 }]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
      >
        {/* Navegador de mês */}
        <View style={[styles.monthNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.monthBtn} onPress={prevMonth}>
            <Ionicons name="chevron-back" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <View style={styles.monthCenter}>
            <Text style={[styles.monthName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {MONTHS[month - 1]}
            </Text>
            <Text style={[styles.monthYear, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{year}</Text>
          </View>
          <TouchableOpacity style={styles.monthBtn} onPress={nextMonth}>
            <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : (
          <>
            {/* Resumo — apenas professores/admins */}
            {isMaster && payments && (
              <View style={styles.summaryGrid}>
                <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.summaryNum, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{payments.length}</Text>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Total</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: "rgba(34,197,94,0.08)", borderColor: "rgba(34,197,94,0.25)" }]}>
                  <Text style={[styles.summaryNum, { color: "#4ade80", fontFamily: "Inter_700Bold" }]}>{paidList.length}</Text>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Pagos</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "35" }]}>
                  <Text style={[styles.summaryNum, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>{pendingList.length}</Text>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Pendentes</Text>
                </View>
              </View>
            )}

            {/* Visão do aluno — seu próprio card */}
            {!isMaster && (
              <View style={[styles.myStatusCard, {
                backgroundColor: myPayment?.paid ? "rgba(34,197,94,0.08)" : colors.primary + "10",
                borderColor: myPayment?.paid ? "rgba(34,197,94,0.3)" : colors.primary + "40",
              }]}>
                <View style={styles.myStatusRow}>
                  <Ionicons
                    name={myPayment?.paid ? "checkmark-circle" : "time-outline"}
                    size={28}
                    color={myPayment?.paid ? "#4ade80" : colors.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.myStatusTitle, { color: myPayment?.paid ? "#4ade80" : colors.primary, fontFamily: "Inter_700Bold" }]}>
                      {myPayment?.paid ? "Mensalidade paga!" : "Pagamento pendente"}
                    </Text>
                    <Text style={[styles.myStatusSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      {MONTHS[month - 1]} {year} · R$ 80,00
                    </Text>
                  </View>
                </View>

                {myPayment?.paid && myPayment.paidAt && (
                  <Text style={[styles.paidDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Confirmado em {new Date(myPayment.paidAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                  </Text>
                )}

                {!myPayment?.paid && (
                  <>
                    <View style={[styles.pixBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={styles.pixRow}>
                        <Text style={[styles.pixLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Valor</Text>
                        <Text style={[styles.pixValue, { color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 18 }]}>R$ 80,00</Text>
                      </View>
                      <View style={styles.pixRow}>
                        <Text style={[styles.pixLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Banco</Text>
                        <Text style={[styles.pixValue, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>Caixa Econômica Federal</Text>
                      </View>
                      <View style={styles.pixRow}>
                        <Text style={[styles.pixLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Recebedor</Text>
                        <Text style={[styles.pixValue, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>Ewerton Tadeu da Silva</Text>
                      </View>
                    </View>
                    <View style={[styles.pixKeyRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pixLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Chave PIX (e-mail)</Text>
                        <Text style={[{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }]} numberOfLines={1}>
                          frontartesmarciais@gmail.com
                        </Text>
                      </View>
                      <TouchableOpacity style={[styles.copyBtn, { borderColor: colors.border }]} onPress={copyPix}>
                        <Ionicons name="copy-outline" size={14} color={colors.mutedForeground} />
                        <Text style={[styles.copyBtnText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Copiar</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.pixNote, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      Após o pagamento, envie o comprovante para o professor confirmar.
                    </Text>
                  </>
                )}
              </View>
            )}

            {/* Lista para professores/admins */}
            {isMaster && (
              <>
                {/* Pendentes */}
                {pendingList.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="alert-circle" size={13} color={colors.primary} />
                      <Text style={[styles.sectionTitle, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                        PENDENTES ({pendingList.length})
                      </Text>
                    </View>
                    {pendingList.map(p => (
                      <PaymentRow
                        key={p.studentId}
                        entry={p}
                        isMaster={isMaster}
                        isPending={pendingId === p.studentId}
                        onToggle={handleToggle}
                        colors={colors}
                      />
                    ))}
                  </View>
                )}

                {/* Pagos */}
                {paidList.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="checkmark-circle" size={13} color="#4ade80" />
                      <Text style={[styles.sectionTitle, { color: "#4ade80", fontFamily: "Inter_700Bold" }]}>
                        PAGOS ({paidList.length})
                      </Text>
                    </View>
                    {paidList.map(p => (
                      <PaymentRow
                        key={p.studentId}
                        entry={p}
                        isMaster={isMaster}
                        isPending={pendingId === p.studentId}
                        onToggle={handleToggle}
                        colors={colors}
                      />
                    ))}
                  </View>
                )}

                {payments?.length === 0 && (
                  <View style={styles.empty}>
                    <Ionicons name="card-outline" size={48} color={colors.mutedForeground} />
                    <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      Nenhum registro para {MONTHS[month - 1]} {year}
                    </Text>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PaymentRow({
  entry,
  isMaster,
  isPending,
  onToggle,
  colors,
}: {
  entry: { studentId: number; name: string; paid: boolean; paidAt?: string | null };
  isMaster: boolean;
  isPending: boolean;
  onToggle: (id: number, paid: boolean, name: string) => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const initials = entry.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <View style={[styles.payRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.payAvatar, {
        backgroundColor: entry.paid ? "rgba(34,197,94,0.15)" : colors.primary + "18",
      }]}>
        <Text style={[styles.payInitials, { color: entry.paid ? "#4ade80" : colors.primary, fontFamily: "Inter_700Bold" }]}>
          {initials}
        </Text>
      </View>
      <View style={styles.payInfo}>
        <Text style={[styles.payName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
          {entry.name}
        </Text>
        {entry.paid && entry.paidAt && (
          <Text style={[styles.paySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {new Date(entry.paidAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
          </Text>
        )}
      </View>
      {isMaster && (
        <TouchableOpacity
          style={[styles.toggleBtn, {
            backgroundColor: entry.paid ? "rgba(34,197,94,0.15)" : colors.primary + "15",
            borderColor: entry.paid ? "rgba(34,197,94,0.4)" : colors.primary + "50",
          }]}
          onPress={() => onToggle(entry.studentId, entry.paid, entry.name)}
          disabled={isPending}
        >
          {isPending ? (
            <ActivityIndicator size="small" color={entry.paid ? "#4ade80" : colors.primary} />
          ) : (
            <Ionicons
              name={entry.paid ? "checkmark-circle" : "ellipse-outline"}
              size={20}
              color={entry.paid ? "#4ade80" : colors.primary}
            />
          )}
        </TouchableOpacity>
      )}
      {!isMaster && (
        <Ionicons
          name={entry.paid ? "checkmark-circle" : "time-outline"}
          size={20}
          color={entry.paid ? "#4ade80" : colors.primary}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  toast: {
    position: "absolute", top: 60, left: 16, right: 16, zIndex: 99,
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 10,
  },
  toastText: { color: "#fff", fontSize: 13, flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, gap: 2 },
  title: { fontSize: 26, letterSpacing: 0.5 },
  subtitle: { fontSize: 13 },
  content: { padding: 16, gap: 14 },

  monthNav: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1 },
  monthBtn: { padding: 16 },
  monthCenter: { flex: 1, alignItems: "center", gap: 2 },
  monthName: { fontSize: 18, letterSpacing: 0.5 },
  monthYear: { fontSize: 12 },

  summaryGrid: { flexDirection: "row", gap: 10 },
  summaryCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: "center", gap: 4 },
  summaryNum: { fontSize: 24 },
  summaryLabel: { fontSize: 11 },

  myStatusCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  myStatusRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  myStatusTitle: { fontSize: 16, marginBottom: 2 },
  myStatusSub: { fontSize: 12 },
  paidDate: { fontSize: 12 },

  pixBox: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 8 },
  pixRow: { flexDirection: "row", alignItems: "center" },
  pixLabel: { flex: 1, fontSize: 13 },
  pixValue: { fontSize: 13 },
  pixKeyRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, padding: 12 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  copyBtnText: { fontSize: 12 },
  pixNote: { fontSize: 11, lineHeight: 16 },

  section: { gap: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  sectionTitle: { fontSize: 11, letterSpacing: 1 },

  payRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, padding: 12 },
  payAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  payInitials: { fontSize: 14 },
  payInfo: { flex: 1 },
  payName: { fontSize: 14 },
  paySub: { fontSize: 12, marginTop: 2 },
  toggleBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  empty: { alignItems: "center", gap: 12, paddingVertical: 48 },
  emptyText: { fontSize: 14, textAlign: "center" },
});

// Wrapper compatível de ScrollView que ajusta o conteúdo ao teclado. No mobile
// usa o KeyboardAwareScrollView (react-native-keyboard-controller); na web cai
// para um ScrollView comum, pois aquela lib não funciona/é desnecessária lá.
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from "react-native-keyboard-controller";
import { Platform, ScrollView, ScrollViewProps } from "react-native";

type Props = KeyboardAwareScrollViewProps & ScrollViewProps;

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  ...props
}: Props) {
  // Na web, usa o ScrollView padrão (sem o tratamento de teclado nativo).
  if (Platform.OS === "web") {
    return (
      <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
        {children}
      </ScrollView>
    );
  }
  // Em iOS/Android, usa a versão que reposiciona o conteúdo quando o teclado abre.
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

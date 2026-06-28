// Barreira de erro (Error Boundary) do app mobile. Captura exceções de
// renderização na árvore de componentes filhos e exibe uma tela de fallback
// em vez de derrubar o app inteiro.
import React, { Component, ComponentType, PropsWithChildren } from "react";

import { ErrorFallback, ErrorFallbackProps } from "@/components/ErrorFallback";

export type ErrorBoundaryProps = PropsWithChildren<{
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, stackTrace: string) => void;
}>;

type ErrorBoundaryState = { error: Error | null };

/**
 * This is a special case for for using the class components. Error boundaries must be class components because React only provides error boundary functionality through lifecycle methods (componentDidCatch and getDerivedStateFromError) which are not available in functional components.
 * https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  // Estado inicial: nenhum erro capturado.
  state: ErrorBoundaryState = { error: null };

  // Fallback padrão usado quando nenhum componente customizado é informado.
  static defaultProps: {
    FallbackComponent: ComponentType<ErrorFallbackProps>;
  } = {
    FallbackComponent: ErrorFallback,
  };

  // Atualiza o estado quando um filho lança erro durante a renderização,
  // disparando a exibição do fallback.
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  // Efeito colateral pós-captura: repassa o erro e o stack ao callback onError
  // (ex.: para logar/telemetria), se fornecido.
  componentDidCatch(error: Error, info: { componentStack: string }): void {
    if (typeof this.props.onError === "function") {
      this.props.onError(error, info.componentStack);
    }
  }

  // Limpa o erro para tentar renderizar os filhos novamente.
  resetError = (): void => {
    this.setState({ error: null });
  };

  render() {
    const { FallbackComponent } = this.props;

    return this.state.error && FallbackComponent ? (
      <FallbackComponent
        error={this.state.error}
        resetError={this.resetError}
      />
    ) : (
      this.props.children
    );
  }
}

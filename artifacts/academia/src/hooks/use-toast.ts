// Sistema de toasts (notificações) da aplicação web.
// Implementa um store leve fora do React (estado em memória + reducer) com
// dispatch/listeners, e expõe o hook useToast() e a função toast() para os
// componentes criarem/atualizarem/dispensarem notificações.
import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

// Quantidade máxima de toasts visíveis ao mesmo tempo.
const TOAST_LIMIT = 1
// Atraso (ms) antes de remover um toast já dispensado da lista.
// Valor propositalmente alto: a remoção efetiva é controlada pela animação/UX.
const TOAST_REMOVE_DELAY = 1000000

// Toast interno do store: estende as props visuais com id e campos de conteúdo.
type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

// Tipos de ação suportados pelo reducer do store de toasts.
const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

// Contador para gerar ids únicos e incrementais de toasts.
let count = 0

// Gera um id sequencial (com wrap-around para nunca estourar o número seguro).
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

// Formato do estado do store: lista de toasts ativos.
interface State {
  toasts: ToasterToast[]
}

// Mapa de timeouts pendentes de remoção, indexado pelo id do toast.
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

// Agenda a remoção de um toast após TOAST_REMOVE_DELAY (sem duplicar timeouts).
const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

// Reducer puro do store: aplica cada ação ao estado atual e retorna o novo.
export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    // Adiciona um toast no topo, respeitando o limite máximo.
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    // Atualiza um toast existente, mesclando os novos campos por id.
    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    // Dispensa um toast (ou todos): fecha visualmente e agenda a remoção.
    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      // Efeito colateral: enfileira a remoção do(s) toast(s) afetado(s).
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      // Marca como fechado (open:false) para acionar a animação de saída.
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    // Remove definitivamente o toast da lista (ou limpa todos se sem id).
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

// Lista de assinantes (componentes) notificados a cada mudança de estado.
const listeners: Array<(state: State) => void> = []

// Estado do store mantido em memória, fora da árvore React.
let memoryState: State = { toasts: [] }

// Aplica uma ação ao estado e notifica todos os assinantes.
function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

// Entrada pública para criar um toast (id é gerado internamente).
type Toast = Omit<ToasterToast, "id">

// Cria e exibe um toast; retorna helpers para atualizá-lo ou dispensá-lo.
function toast({ ...props }: Toast) {
  const id = genId()

  // Atualiza o conteúdo deste toast específico.
  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  // Dispensa este toast específico.
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  // Adiciona o toast já aberto; ao ser fechado pela UI, dispara o dismiss.
  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

// Hook React que assina o store e devolve o estado + ações de toast.
function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  // Registra/desregistra este componente como assinante das mudanças do store.
  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }

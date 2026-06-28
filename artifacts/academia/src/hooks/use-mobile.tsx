// Hook utilitário que indica se a viewport atual é de tamanho "mobile".
// Usa matchMedia para reagir a mudanças de largura/orientação da janela.
import * as React from "react"

// Largura limite (em px): abaixo disso é considerado mobile.
const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // undefined no primeiro render (antes de medir), depois true/false.
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    // Observa a media query e atualiza o estado quando ela mudar.
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    // Define o valor inicial logo após montar.
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    // Cleanup: remove o listener ao desmontar.
    return () => mql.removeEventListener("change", onChange)
  }, [])

  // Coage para boolean (evita retornar undefined ao consumidor).
  return !!isMobile
}

// Ponto de entrada (bootstrap) da aplicação web React.
// Responsável por montar o componente raiz <App /> dentro do elemento #root
// do index.html e carregar os estilos globais (Tailwind/CSS) da aplicação.
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Cria a raiz React no elemento #root e renderiza toda a árvore de componentes.
// O "!" indica ao TypeScript que confiamos que o elemento #root existe no HTML.
createRoot(document.getElementById("root")!).render(<App />);

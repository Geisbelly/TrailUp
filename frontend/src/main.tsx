import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { installChunkReloadHandler } from "./lib/chunkReload";
import "./index.css";
import "./styles/immersive.css";
import "./styles/page-surfaces.css";
import "./styles/console-theme.css";
import "./styles/motion.css";

// Aba aberta de um deploy antigo pede chunks que nao existem mais: recarrega uma vez.
installChunkReloadHandler();

createRoot(document.getElementById("root")!).render(<App />);

import { Component, type ErrorInfo, type ReactNode } from "react";
import { isChunkLoadError } from "@/lib/chunkReload";
import { registrarErroDeTela } from "@/lib/saude";

type Props = { children: ReactNode };
type State = { quebrou: boolean };

/** Sem isto, erro de renderização deixa a tela em branco, e o boundary do React não sobe até `window`. */
export class TelaDeErro extends Component<Props, State> {
  state: State = { quebrou: false };

  static getDerivedStateFromError(): State {
    return { quebrou: true };
  }

  componentDidCatch(erro: Error, _info: ErrorInfo) {
    // Chunk de deploy antigo já recarrega sozinho (`chunkReload`): não é defeito de tela.
    if (!isChunkLoadError(erro)) registrarErroDeTela(erro);
  }

  render() {
    if (!this.state.quebrou) return this.props.children;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <h1 className="text-xl font-semibold">Algo deu errado nesta tela</h1>
        <p className="max-w-sm text-sm text-muted-foreground">O que você salvou continua guardado. Recarregue para voltar.</p>
        <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => window.location.reload()}>
          Recarregar
        </button>
      </main>
    );
  }
}

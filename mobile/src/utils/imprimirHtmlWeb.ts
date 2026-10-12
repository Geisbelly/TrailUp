/**
 * Abre a impressão do navegador para um HTML pronto (o do relatório), num
 * iframe oculto: o aluno escolhe "Salvar como PDF" ali. No navegador não há
 * `Print.printToFileAsync` nem `FileSystem`, então o caminho do celular falhava
 * calado na web (#346, protótipo v4: "hoje falha em silêncio").
 */
export function imprimirHtmlNaWeb(html: string, titulo: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Sem navegador para imprimir."));
      return;
    }
    const quadro = document.createElement("iframe");
    quadro.setAttribute("aria-hidden", "true");
    Object.assign(quadro.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(quadro);
    const remover = () => setTimeout(() => quadro.remove(), 1000);
    const doc = quadro.contentWindow?.document;
    if (!doc || !quadro.contentWindow) {
      quadro.remove();
      reject(new Error("Não foi possível preparar a impressão."));
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    doc.title = titulo;
    // Espera as imagens (o logo vem em base64) antes de chamar a impressão.
    const imprimir = () => {
      try {
        quadro.contentWindow?.focus();
        quadro.contentWindow?.print();
        remover();
        resolve();
      } catch (erro) {
        quadro.remove();
        reject(erro instanceof Error ? erro : new Error(String(erro)));
      }
    };
    if (doc.readyState === "complete") setTimeout(imprimir, 50);
    else quadro.onload = () => setTimeout(imprimir, 50);
  });
}

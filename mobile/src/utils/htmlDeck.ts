// Deck HTML (motor atual do BrainHexPDF) x .pptx enviado pelo professor.
//
// Modulo proprio, sem nenhum import de react-native, pra poder ser testado
// direto no node (contentBlocks.ts arrasta a arvore do RN e nao roda fora do
// Metro). contentBlocks reexporta daqui.
//
// A distincao importa em dois lugares:
//
// 1. o leitor nativo do mobile baixa o arquivo e parseia como PPTX (zip+xml) -
//    com HTML ele falha, e o app cai no visualizador do Office, que tambem nao
//    abre HTML. Resultado pro aluno: "nao foi possivel abrir os slides";
// 2. a URL publica do Supabase serve .html como text/plain, entao carregar por
//    uri mostraria o codigo-fonte. Tem que ir como HTML inline - com baseUrl,
//    pro deck continuar lendo as flags de visibilidade de location.search
//    (hideQuiz/hideChecklist/hideNotes, ver deckExportUtils no BrainHexPDF).

function semQueryNemHash(url: string): string {
  return url.split(/[?#]/, 1)[0].trim();
}

export function isHtmlDeckUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.html?$/i.test(semQueryNemHash(url));
}

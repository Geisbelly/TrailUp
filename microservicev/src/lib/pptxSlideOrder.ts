// PowerPoint nao renomeia slideN.xml ao reordenar slides na interface — a
// ordem real da apresentacao vem de ppt/presentation.xml (<p:sldIdLst>) +
// ppt/_rels/presentation.xml.rels, nao do numero no nome do arquivo. Sem
// isso, um professor que reordena slides no PowerPoint sem fazer "salvar
// como" completo tem o conteudo extraido fora de ordem (ex.: conclusao
// antes da introducao).
//
// Parsing por regex (nao XML parser completo) para seguir o mesmo padrao
// leve ja usado neste servico para extrair texto de <a:t>.

function parseRelsMap(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  const relTagPattern = /<Relationship\b[^>]*\/?>/gi;
  const tags = relsXml.match(relTagPattern) ?? [];
  for (const tag of tags) {
    const idMatch = tag.match(/\bId="([^"]+)"/i);
    const targetMatch = tag.match(/\bTarget="([^"]+)"/i);
    if (!idMatch || !targetMatch) continue;
    if (!/slides\/slide\d+\.xml$/i.test(targetMatch[1])) continue;
    map.set(idMatch[1], `ppt/${targetMatch[1]}`);
  }
  return map;
}

function parseSlideIdOrder(presentationXml: string): string[] {
  const listMatch = presentationXml.match(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/i);
  if (!listMatch) return [];
  const relIdPattern = /r:id="([^"]+)"/g;
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = relIdPattern.exec(listMatch[1])) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

function sortByFilenameNumber(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ""), 10);
    const numB = parseInt(b.replace(/\D/g, ""), 10);
    return numA - numB;
  });
}

/**
 * Resolve a ordem real dos slides. Sempre retorna exatamente os mesmos
 * paths de `availableSlideFiles` (nunca perde nem duplica) — slides que a
 * apresentacao/rels nao conseguiu resolver caem no fallback por nome de
 * arquivo, anexados apos os resolvidos.
 */
export function resolveRealSlideOrder(
  presentationXml: string,
  relsXml: string,
  availableSlideFiles: string[]
): string[] {
  const relsMap = parseRelsMap(relsXml);
  const slideIdOrder = parseSlideIdOrder(presentationXml);
  const available = new Set(availableSlideFiles);

  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const relId of slideIdOrder) {
    const path = relsMap.get(relId);
    if (path && available.has(path) && !seen.has(path)) {
      resolved.push(path);
      seen.add(path);
    }
  }

  const unresolved = availableSlideFiles.filter((path) => !seen.has(path));
  return [...resolved, ...sortByFilenameNumber(unresolved)];
}

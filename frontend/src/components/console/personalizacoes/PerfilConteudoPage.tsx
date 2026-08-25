import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PerfilConteudoView, type MaterialTipo } from "./PerfilConteudoView";
import type { PersonalizacaoPerfilItem } from "./personalizacoesApi";

/**
 * Pagina do conteudo completo de um perfil (/console/personalizacoes/material).
 *
 * Substitui o modal que existia antes: a lista de subtopicos estourava a
 * largura do Dialog (max-w-3xl), o material lia mal numa coluna estreita com
 * scroll proprio, e o estado nao sobrevivia a refresh nem ao botao voltar.
 * Aqui a largura e a da pagina e a URL diz o que esta aberto.
 */
export function PerfilConteudoPage({
  item,
  initialTab,
  classeId,
  topicoId,
  topicoTitulo,
  conteudoTitulo,
  resolveToken,
  onRegenerated,
  onVoltar,
}: {
  item: PersonalizacaoPerfilItem;
  initialTab?: MaterialTipo;
  classeId?: number;
  topicoId?: number;
  topicoTitulo?: string;
  conteudoTitulo?: string;
  resolveToken?: () => Promise<string>;
  onRegenerated?: () => void;
  onVoltar: () => void;
}) {
  const trilhaDeContexto = [topicoTitulo, conteudoTitulo].filter(Boolean).join(" › ");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onVoltar} className="gap-2 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        {trilhaDeContexto && (
          <p className="text-xs text-muted-foreground truncate">{trilhaDeContexto}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-8 w-1.5 rounded-full" style={{ backgroundColor: item.cor }} />
        <div>
          <h2 className="text-xl font-semibold capitalize leading-tight">{item.perfil_label}</h2>
          <p className="text-sm text-muted-foreground">
            Conteúdo gerado para o perfil <span className="capitalize">{item.perfil}</span> — todos os
            formatos em um só lugar.
          </p>
        </div>
      </div>

      <PerfilConteudoView
        item={item}
        initialTab={initialTab}
        classeId={classeId}
        topicoId={topicoId}
        resolveToken={resolveToken}
        onRegenerated={onRegenerated}
      />
    </div>
  );
}

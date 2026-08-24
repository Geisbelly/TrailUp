import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownUrlTransform } from "./markdownUrlTransform";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ExternalLink, FileText, Music, FileImage, NotebookPen, Wand2 } from "lucide-react";
import type { PersonalizacaoPerfilItem } from "./personalizacoesApi";
import { regenerarDocumentoPersonalizacao, regenerarSlidePersonalizacao } from "./personalizacoesApi";
import {
  resolveDocumentPreviewMode,
  versionedMaterialUrl,
  type DocumentPreviewMode,
} from "./materialPreview";
import { getMaterialPartes } from "./materialParts";
import { fetchHtmlDeckSource, createHtmlBlobUrl } from "./htmlDeckSource";
import { supabase } from "@/integrations/supabase/client";

export type MaterialTipo = "markdown" | "pdf" | "audio" | "apresentacao";

const TABS: Array<{ key: MaterialTipo; label: string; icon: typeof FileText }> = [
  { key: "markdown", label: "Texto", icon: NotebookPen },
  { key: "audio", label: "Áudio", icon: Music },
  { key: "apresentacao", label: "Apresentação", icon: FileImage },
  { key: "pdf", label: "PDF", icon: FileText },
];

function getMaterial(materiais: Record<string, unknown> | null | undefined, tipo: string): Record<string, unknown> | null {
  if (!materiais || typeof materiais !== "object") return null;
  const value = (materiais as Record<string, unknown>)[tipo];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function materialUrl(material: Record<string, unknown> | null): string | null {
  if (!material) return null;
  const url = material.arquivo_url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

// bucket vive so no nivel do material (nao por parte - ver
// persistApresentacaoResult no BrainHexPDF), ao contrario de storage_path
// (que MaterialPartInfo ja traz por parte).
function materialBucket(material: Record<string, unknown> | null): string | null {
  if (!material) return null;
  const bucket = material.bucket;
  return typeof bucket === "string" && bucket.trim() ? bucket.trim() : null;
}

// ReactMarkdown + remark-gfm (tabelas, listas numeradas, links, blocos de
// codigo, imagens) - o renderizador anterior era escrito a mao e so
// reconhecia headings/lista simples/negrito/italico, quebrando qualquer
// markdown gerado com tabela, code fence, link ou imagem. `prose` (plugin
// @tailwindcss/typography) cobre a tipografia de todos os elementos GFM;
// so o h2 recebe cor de destaque pra manter a enfase visual que a versao
// anterior ja dava aos subtopicos. A variante `prose-trailup`
// (tailwind.config.ts) amarra as cores aos tokens do tema - o `prose` puro
// assume tema claro e o app e escuro por padrao, sem a classe "dark".
function MarkdownView({ text }: { text: string }) {
  return (
    <div className="prose prose-sm prose-trailup max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Sem isso o react-markdown apaga toda imagem em data URI - some tanto
        // a imagem que veio de dentro do .pptx do professor quanto o diagrama
        // de fluxo em SVG que o pipeline gera (ver markdownUrlTransform.ts).
        urlTransform={markdownUrlTransform}
        components={{
          h2: ({ children }) => <h2 className="text-primary-light">{children}</h2>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function TextoMaterialContent({ url }: { url: string }) {
  const [state, setState] = useState<{ loading: boolean; text: string | null; error: string | null }>({
    loading: true,
    text: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    setState({ loading: true, text: null, error: null });
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (active) setState({ loading: false, text, error: null });
      })
      .catch((error) => {
        if (active) {
          setState({
            loading: false,
            text: null,
            error: error instanceof Error ? error.message : "Falha ao carregar o texto.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [url]);

  if (state.loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando texto...
      </div>
    );
  }
  if (state.error || !state.text) {
    return (
      <div className="space-y-2 py-4 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível carregar o texto aqui.</p>
        <Button variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-2" /> Abrir em nova aba
          </a>
        </Button>
      </div>
    );
  }
  return (
    <div className="max-h-[55vh] overflow-y-auto pr-2">
      <MarkdownView text={state.text} />
    </div>
  );
}

function AudioMaterialContent({ url }: { url: string }) {
  return (
    <div className="py-6 flex flex-col items-center gap-3">
      <audio controls className="w-full max-w-md" src={url}>
        Seu navegador não suporta reprodução de áudio.
      </audio>
      <Button variant="ghost" size="sm" asChild>
        <a href={url} target="_blank" rel="noreferrer">
          <ExternalLink className="h-3.5 w-3.5 mr-2" /> Abrir em nova aba
        </a>
      </Button>
    </div>
  );
}

// PDFs sao exibidos diretamente pelo navegador. Arquivos PowerPoint legados
// continuam usando o Office Viewer, conforme MIME/extensao do material.
// Decks HTML (motor atual do BrainHexPDF) usam HtmlDeckEmbed, nao este
// componente - ver comentario em htmlDeckSource.ts sobre por que a URL
// publica do Supabase nao pode ir direto num <iframe src>.
function EmbedMaterialContent({ url, mode }: { url: string; mode: "pdf" | "office" }) {
  const [embedFailed, setEmbedFailed] = useState(false);
  const embedSrc = useMemo(() => {
    if (mode === "pdf") return url;
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }, [url, mode]);

  if (embedFailed) {
    return (
      <div className="space-y-2 py-8 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível pré-visualizar este arquivo aqui.</p>
        <Button variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-2" /> Abrir em nova aba
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <iframe
        src={embedSrc}
        title={mode === "pdf" ? "Pré-visualização do PDF" : "Pré-visualização da apresentação"}
        className="w-full h-[55vh] rounded-md border"
        onError={() => setEmbedFailed(true)}
      />
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-2" /> Abrir em nova aba
          </a>
        </Button>
      </div>
    </div>
  );
}

// Deck HTML autocontido do BrainHexPDF: baixado direto do Supabase (bucket +
// storage_path), sem depender do proxy de reescrita do BrainHexPDF
// (/api/v1/decks/...) nem da sua disponibilidade. Renderizado via
// iframe.srcDoc (ver htmlDeckSource.ts) porque a URL publica do Supabase
// serve .html como text/plain, e um <iframe src> direto so mostraria o
// codigo-fonte como texto.
function HtmlDeckEmbed({ bucket, storagePath, fallbackUrl }: { bucket: string; storagePath: string; fallbackUrl: string }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; html: string } | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchHtmlDeckSource(supabase.storage, bucket, storagePath).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setState({ status: "error", message: result.error });
      } else {
        setState({ status: "ready", html: result.html });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bucket, storagePath]);

  if (state.status === "loading") {
    return <div className="py-8 text-center text-sm text-muted-foreground">Carregando apresentação…</div>;
  }

  if (state.status === "error") {
    return (
      <div className="space-y-2 py-8 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível carregar a apresentação do Supabase.</p>
        <p className="text-xs text-muted-foreground">{state.message}</p>
        <Button variant="outline" size="sm" asChild>
          <a href={fallbackUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-2" /> Abrir em nova aba
          </a>
        </Button>
      </div>
    );
  }

  const html = state.html;
  return (
    <div className="space-y-2">
      <iframe
        srcDoc={html}
        title="Pré-visualização da apresentação"
        className="w-full h-[55vh] rounded-md border"
      />
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open(createHtmlBlobUrl(html), "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-2" /> Abrir em nova aba
        </Button>
      </div>
    </div>
  );
}

type RegenerarContext = {
  classeId: number;
  topicoId: number;
  conteudoId?: number | null;
  brainhexProfileKey: string;
  resolveToken: () => Promise<string>;
  onRegenerated: () => void;
};

// Painel inline de "Regenerar com IA" — compartilhado pelas 2 acoes hoje
// disponiveis (documento: texto+roteiro; slide: um slide especifico). Nao
// reconstroi a apresentacao renderizada (arquivo_url) quando kind="slide" —
// so atualiza o conteudo do slide no JSON e devolve uma imagem de preview.
function RegenerarConteudoPainel({
  kind,
  context,
  totalSlides,
}: {
  kind: "documento" | "slide";
  context: RegenerarContext;
  totalSlides?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [slideNumeroInput, setSlideNumeroInput] = useState("1");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleSubmit = async () => {
    const improvementPrompt = prompt.trim();
    if (!improvementPrompt) {
      toast.error("Descreva o que deve mudar antes de regenerar.");
      return;
    }
    setLoading(true);
    try {
      const token = await context.resolveToken();
      if (kind === "documento") {
        await regenerarDocumentoPersonalizacao(token, {
          classeId: context.classeId,
          topicoId: context.topicoId,
          conteudo_id: context.conteudoId ?? null,
          brainhex_profile_key: context.brainhexProfileKey,
          improvement_prompt: improvementPrompt,
        });
        toast.success("Documento regenerado — texto e roteiro de áudio atualizados.");
      } else {
        const slideIndex = Math.max(0, Math.trunc(Number(slideNumeroInput) || 1) - 1);
        const resultado = await regenerarSlidePersonalizacao(token, {
          classeId: context.classeId,
          topicoId: context.topicoId,
          conteudo_id: context.conteudoId ?? null,
          brainhex_profile_key: context.brainhexProfileKey,
          slide_index: slideIndex,
          improvement_prompt: improvementPrompt,
        });
        setPreview(resultado.image_base64_preview ?? null);
        toast.success(`Slide ${slideIndex + 1} regenerado.`);
      }
      setPrompt("");
      setExpanded(false);
      context.onRegenerated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao regenerar conteúdo.");
    } finally {
      setLoading(false);
    }
  };

  if (!expanded) {
    return (
      <div className="flex justify-end pt-3 mt-3 border-t">
        <Button variant="outline" size="sm" onClick={() => setExpanded(true)}>
          <Wand2 className="h-3.5 w-3.5 mr-2" /> Regenerar com IA
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-3 mt-3 border-t">
      {kind === "slide" && (
        <div className="flex items-center gap-2">
          <Label htmlFor="regenerar-slide-numero" className="text-xs shrink-0 text-muted-foreground">
            Nº do slide
          </Label>
          <Input
            id="regenerar-slide-numero"
            type="number"
            min={1}
            max={totalSlides}
            value={slideNumeroInput}
            onChange={(event) => setSlideNumeroInput(event.target.value)}
            className="h-8 w-20"
            disabled={loading}
          />
          {totalSlides ? <span className="text-xs text-muted-foreground">de {totalSlides}</span> : null}
        </div>
      )}
      <Textarea
        placeholder={
          kind === "documento"
            ? "Ex.: aprofunde o exemplo de docas do porto e reduza o tom formal."
            : "Ex.: deixe este slide mais visual e direto."
        }
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={3}
        disabled={loading}
      />
      {kind === "slide" && (
        <p className="text-xs text-muted-foreground">
          Atualiza o conteúdo do slide; a apresentação já publicada não é reconstruída automaticamente.
        </p>
      )}
      {preview && (
        <div className="rounded-md border p-2">
          <p className="text-xs text-muted-foreground mb-1">Preview da imagem regerada:</p>
          <img
            src={`data:image/png;base64,${preview}`}
            alt="Preview do slide regenerado"
            className="max-h-40 rounded"
          />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setExpanded(false);
            setPrompt("");
            setPreview(null);
          }}
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5 mr-2" />
          )}
          Regenerar
        </Button>
      </div>
    </div>
  );
}

function MaterialTabContent({
  tipo,
  material,
  fallbackUpdatedAt,
  regenerarContext,
}: {
  tipo: MaterialTipo;
  material: Record<string, unknown> | null;
  fallbackUpdatedAt?: string | null;
  regenerarContext?: RegenerarContext;
}) {
  // Materiais gerados em varias partes (ver ContentPart no microservice)
  // trazem "partes" com um item por bloco; registros antigos, sem "partes",
  // caem no fallback de 1 parte so via getMaterialPartes - o restante deste
  // componente nunca precisa saber a diferenca.
  const partes = getMaterialPartes(material);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [tipo, materialUrl(material)]);

  const safeIndex = Math.min(activeIndex, partes.length - 1);
  const activeParte = partes[safeIndex];
  const rawUrl = activeParte?.arquivo_url ?? null;
  const url = rawUrl
    ? versionedMaterialUrl(rawUrl, material, fallbackUpdatedAt)
    : null;
  const previewMode = resolveDocumentPreviewMode(material, tipo === "pdf" ? "pdf" : "apresentacao");
  const bucket = materialBucket(material);
  const storagePath = activeParte?.storage_path ?? null;

  const payload = material && typeof material.payload === "object" ? (material.payload as Record<string, unknown>) : null;
  const slides = Array.isArray(payload?.slides) ? (payload.slides as unknown[]) : null;

  if (partes.length === 0 || !partes.some((parte) => parte.arquivo_url)) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Este material ainda não está disponível.</p>;
  }

  return (
    <div>
      {partes.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {partes.map((parte, index) => (
            <Button
              key={parte.ordem}
              type="button"
              size="sm"
              variant={index === safeIndex ? "default" : "outline"}
              onClick={() => setActiveIndex(index)}
            >
              {parte.titulo || `Parte ${parte.ordem}`}
            </Button>
          ))}
        </div>
      )}
      {!url ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Esta parte ainda não está disponível.</p>
      ) : tipo === "markdown" ? (
        <div>
          <TextoMaterialContent url={url} />
          {regenerarContext && <RegenerarConteudoPainel kind="documento" context={regenerarContext} />}
        </div>
      ) : tipo === "audio" ? (
        <AudioMaterialContent url={url} />
      ) : (
        <div>
          {previewMode === "html" ? (
            bucket && storagePath ? (
              <HtmlDeckEmbed bucket={bucket} storagePath={storagePath} fallbackUrl={url} />
            ) : (
              <div className="space-y-2">
                <iframe
                  src={url}
                  title="Pré-visualização da apresentação"
                  className="w-full h-[55vh] rounded-md border"
                />
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" asChild>
                    <a href={url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-2" /> Abrir em nova aba
                    </a>
                  </Button>
                </div>
              </div>
            )
          ) : (
            <EmbedMaterialContent url={url} mode={previewMode} />
          )}
          {tipo === "apresentacao" && regenerarContext && (
            <RegenerarConteudoPainel kind="slide" context={regenerarContext} totalSlides={slides?.length} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Conteudo completo de um perfil, em pagina inteira.
 *
 * Era um modal (Dialog) limitado a max-w-3xl: a lista de subtopicos estourava a
 * largura, o material ficava espremido numa coluna estreita com scroll interno,
 * e nao dava pra abrir por link nem voltar pelo navegador. Como pagina, o
 * material usa a largura toda e a URL passa a dizer o que esta aberto.
 */
export function PerfilConteudoView({
  item,
  initialTab,
  classeId,
  topicoId,
  resolveToken,
  onRegenerated,
}: {
  item: PersonalizacaoPerfilItem;
  initialTab?: MaterialTipo;
  classeId?: number;
  topicoId?: number;
  resolveToken?: () => Promise<string>;
  onRegenerated?: () => void;
}) {
  const disponiveis = TABS.filter((tab) => getMaterial(item.materiais, tab.key));
  const regenerarContext: RegenerarContext | undefined =
    classeId != null && topicoId != null && resolveToken && onRegenerated
      ? {
          classeId,
          topicoId,
          conteudoId: item.personalizacao?.conteudo_id,
          brainhexProfileKey: item.perfil,
          resolveToken,
          onRegenerated,
        }
      : undefined;
  const [activeTab, setActiveTab] = useState<MaterialTipo>(initialTab ?? disponiveis[0]?.key ?? "markdown");

  useEffect(() => {
    setActiveTab(initialTab ?? disponiveis[0]?.key ?? "markdown");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, item.perfil]);

  if (disponiveis.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        Ainda não há materiais gerados para este perfil neste tópico.
      </p>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MaterialTipo)}>
      <TabsList>
        {disponiveis.map(({ key, label, icon: Icon }) => (
          <TabsTrigger key={key} value={key} className="gap-1.5">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {disponiveis.map(({ key }) => (
        <TabsContent key={key} value={key}>
          <MaterialTabContent
            tipo={key}
            material={getMaterial(item.materiais, key)}
            fallbackUpdatedAt={item.personalizacao?.updated_at ?? item.gerado_em}
            regenerarContext={regenerarContext}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

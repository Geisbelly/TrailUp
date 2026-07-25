import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, FileText, Music, FileImage, NotebookPen } from "lucide-react";
import type { PersonalizacaoPerfilItem } from "./personalizacoesApi";

type MaterialTipo = "markdown" | "pdf" | "audio" | "apresentacao";

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

// Render leve de markdown -> JSX (sem dependencia externa), mesmo padrao usado em BlogPost.tsx.
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <span key={i}>{part}</span>;
  });
}

function MarkdownView({ text }: { text: string }) {
  const paragraphs = text.split("\n").filter((p) => p.trim());
  return (
    <div className="space-y-2">
      {paragraphs.map((paragraph, index) => {
        if (paragraph.startsWith("# ")) {
          return (
            <h1 key={index} className="text-xl font-bold mt-4 mb-2">
              {renderInline(paragraph.slice(2))}
            </h1>
          );
        }
        if (paragraph.startsWith("## ")) {
          return (
            <h2 key={index} className="text-lg font-bold mt-3 mb-2 text-primary">
              {renderInline(paragraph.slice(3))}
            </h2>
          );
        }
        if (paragraph.startsWith("### ")) {
          return (
            <h3 key={index} className="text-base font-semibold mt-2 mb-1">
              {renderInline(paragraph.slice(4))}
            </h3>
          );
        }
        if (paragraph.startsWith("- ") || paragraph.startsWith("* ")) {
          return (
            <li key={index} className="ml-6 list-disc text-sm">
              {renderInline(paragraph.slice(2))}
            </li>
          );
        }
        return (
          <p key={index} className="text-sm text-muted-foreground leading-relaxed">
            {renderInline(paragraph)}
          </p>
        );
      })}
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

// Apresentacao (.pptx) e PDF nao renderizam nativamente no navegador. Para
// .pptx usamos o visualizador embutido do Office (precisa de URL publica,
// ja garantido pelo bucket publico do Supabase); para PDF o navegador exibe
// nativamente via iframe. Se o embed falhar, o fallback "abrir em nova aba"
// sempre funciona.
function EmbedMaterialContent({ url, kind }: { url: string; kind: "apresentacao" | "pdf" }) {
  const [embedFailed, setEmbedFailed] = useState(false);
  const embedSrc = useMemo(() => {
    if (kind === "pdf") return url;
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }, [url, kind]);

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
        title={kind === "pdf" ? "Pré-visualização do PDF" : "Pré-visualização da apresentação"}
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

function MaterialTabContent({ tipo, url }: { tipo: MaterialTipo; url: string | null }) {
  if (!url) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Este material ainda não está disponível.</p>;
  }
  if (tipo === "markdown") return <TextoMaterialContent url={url} />;
  if (tipo === "audio") return <AudioMaterialContent url={url} />;
  return <EmbedMaterialContent url={url} kind={tipo} />;
}

export function PerfilConteudoDialog({
  item,
  open,
  onOpenChange,
  initialTab,
}: {
  item: PersonalizacaoPerfilItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: MaterialTipo;
}) {
  const disponiveis = TABS.filter((tab) => getMaterial(item.materiais, tab.key));
  const [activeTab, setActiveTab] = useState<MaterialTipo>(initialTab ?? disponiveis[0]?.key ?? "markdown");

  useEffect(() => {
    if (open) setActiveTab(initialTab ?? disponiveis[0]?.key ?? "markdown");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab, item.perfil]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.cor }} />
            <DialogTitle className="capitalize">{item.perfil_label}</DialogTitle>
          </div>
          <DialogDescription>
            Conteúdo gerado para o perfil <span className="capitalize">{item.perfil}</span> — todos os formatos em um
            só lugar.
          </DialogDescription>
        </DialogHeader>

        {disponiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Ainda não há materiais gerados para este perfil neste tópico.
          </p>
        ) : (
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
                <MaterialTabContent tipo={key} url={materialUrl(getMaterial(item.materiais, key))} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

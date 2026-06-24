import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, ExternalLink, X, Loader2, Link2, Clock } from "lucide-react";
import { cn, formatFileSize } from "@/lib/utils";
import {
  PROFESSOR_UPLOAD_ACCEPT,
  PROFESSOR_UPLOAD_MAX_BYTES,
  getFileExtension,
  isProfessorUploadFileAllowed,
} from "@/lib/upload-file-policy";
import type { ConteudoFile } from "./types";

const EXT_LABELS: Record<string, string> = {
  pdf: "PDF",
  doc: "DOC",
  docx: "DOCX",
  ppt: "PPT",
  pptx: "PPTX",
  txt: "TXT",
  md: "MD",
  mp3: "MP3",
  wav: "WAV",
  ogg: "OGG",
  mp4: "MP4",
  webm: "WEBM",
  mov: "MOV",
};

function getExtLabel(filename: string): string {
  const ext = getFileExtension(filename);
  return EXT_LABELS[ext] || (ext ? ext.toUpperCase() : "ARQ");
}

function parseStorageDisplayName(pathOrUrl: string): string {
  if (!pathOrUrl) return "";
  if (!pathOrUrl.startsWith("http://") && !pathOrUrl.startsWith("https://")) {
    const rawName = pathOrUrl.split("/").pop() || pathOrUrl;
    return rawName.replace(/^\d+_/, "");
  }
  try {
    const url = new URL(pathOrUrl);
    const rawName = url.pathname.split("/").pop() || "link";
    return decodeURIComponent(rawName).replace(/^\d+_/, "");
  } catch {
    return "link externo";
  }
}

function isStoragePath(value: string): boolean {
  return !!value && !value.startsWith("http://") && !value.startsWith("https://");
}

type Props = {
  topicId: number | null | undefined;
  value: string;
  onChange: (value: string) => void;
  extraFiles?: ConteudoFile[];
  onRemoveExtraFile?: (path: string) => void;
  pendingFiles: File[];
  onPendingFilesChange: (files: File[]) => void;
};

export function ContentFileUpload({
  topicId,
  value,
  onChange,
  extraFiles = [],
  onRemoveExtraFile,
  pendingFiles,
  onPendingFilesChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const handleFilesSelect = (incoming: File[]) => {
    if (!topicId) {
      toast.error("Salve o tópico antes de adicionar arquivos.");
      return;
    }

    const oversized = incoming.filter((file) => file.size > PROFESSOR_UPLOAD_MAX_BYTES);
    if (oversized.length) {
      toast.error(
        `${oversized.map((file) => file.name).join(", ")}: maior que 200 MB.`,
      );
    }

    const invalidType = incoming.filter((file) => !isProfessorUploadFileAllowed(file));
    if (invalidType.length) {
      toast.error(
        `${invalidType.map((file) => file.name).join(", ")}: formato não permitido.`,
      );
    }

    const valid = incoming.filter(
      (file) => file.size <= PROFESSOR_UPLOAD_MAX_BYTES && isProfessorUploadFileAllowed(file),
    );
    if (valid.length) onPendingFilesChange([...pendingFiles, ...valid]);
  };

  const removePending = (index: number) => {
    onPendingFilesChange(pendingFiles.filter((_, i) => i !== index));
  };

  const removeExisting = (pathOrUrl: string) => {
    if (isStoragePath(pathOrUrl)) {
      void supabase.storage.from("conteudos").remove([pathOrUrl]).catch(console.error);
    }
    if (pathOrUrl === value) {
      onChange("");
      return;
    }
    onRemoveExtraFile?.(pathOrUrl);
  };

  const openPreview = async (pathOrUrl: string) => {
    if (!isStoragePath(pathOrUrl)) {
      window.open(pathOrUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setLoadingPreview(pathOrUrl);
    const { data } = await supabase.storage.from("conteudos").createSignedUrl(pathOrUrl, 3600);
    setLoadingPreview(null);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    else toast.error("Não foi possível gerar o link de pré-visualização.");
  };

  const commitUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    onChange(trimmed);
    setShowUrlInput(false);
    setUrlInput("");
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) handleFilesSelect(files);
  };

  const darkInput =
    "bg-input border-border text-foreground focus:border-ring placeholder:text-muted-foreground hover:border-border/80 transition-colors";

  const savedFiles: Array<{ pathOrUrl: string; name: string }> = [];
  if (value) savedFiles.push({ pathOrUrl: value, name: parseStorageDisplayName(value) });
  extraFiles.forEach((file) => savedFiles.push({ pathOrUrl: file.path, name: file.name }));

  const totalPending = pendingFiles.length;
  const hasAny = savedFiles.length > 0 || totalPending > 0;

  return (
    <div className="space-y-3">
      {totalPending > 0 && (
        <div className="space-y-1.5">
          {pendingFiles.map((file, idx) => (
            <div
              key={`${file.name}-${file.size}-${idx}`}
              className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-500/20 bg-amber-900/30 text-center text-[10px] font-bold uppercase leading-none text-amber-400">
                {getExtLabel(file.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-warning/80">
                  <Clock className="h-3 w-3" />
                  Pendente · {formatFileSize(file.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removePending(idx)}
                title="Cancelar seleção"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <p className="pl-1 text-[10px] text-warning/60">
            {totalPending} arquivo{totalPending > 1 ? "s" : ""} · serão enviados ao salvar
          </p>
        </div>
      )}

      {savedFiles.length > 0 && (
        <div className="space-y-1.5">
          {savedFiles.map(({ pathOrUrl, name }) => (
            <div
              key={pathOrUrl}
              className="flex items-center gap-3 rounded-lg border border-border/80 bg-card p-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/15 text-center text-[10px] font-bold uppercase leading-none text-primary">
                {name ? getExtLabel(name) : "ARQ"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{name || "arquivo"}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {isStoragePath(pathOrUrl) ? "Bucket privado · conteudos" : "URL direta"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => void openPreview(pathOrUrl)}
                disabled={loadingPreview === pathOrUrl}
                title="Abrir"
              >
                {loadingPreview === pathOrUrl ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeExisting(pathOrUrl)}
                title="Remover"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          "cursor-pointer select-none rounded-xl border-2 border-dashed transition-all",
          isDragging
            ? "border-primary bg-primary/10"
            : "border-border bg-background/40 hover:border-border/80 hover:bg-background/70",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={PROFESSOR_UPLOAD_ACCEPT}
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) handleFilesSelect(files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-col items-center gap-3 px-6 py-6 text-center">
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
              isDragging ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {hasAny ? "Adicionar mais arquivos" : "Arraste ou clique para selecionar"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              PDF · DOC/DOCX · PPT/PPTX · TXT/MD · Vídeo · Áudio
              <br />
              <span className="text-muted-foreground/60">máx. 200 MB · envio ocorre ao salvar</span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border/50" />
        <button
          type="button"
          onClick={() => setShowUrlInput((v) => !v)}
          className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <Link2 className="h-3 w-3" />
          {showUrlInput ? "Cancelar" : "Ou cole uma URL direta"}
        </button>
        <div className="h-px flex-1 bg-border/50" />
      </div>

      {showUrlInput && (
        <div className="animate-in slide-in-from-top-2 fade-in flex gap-2 duration-200">
          <Input
            className={cn(darkInput, "h-9 flex-1 text-sm")}
            placeholder="https://example.com/documento.pdf"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitUrl();
            }}
            autoFocus
          />
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 bg-primary px-4 text-primary-foreground hover:bg-primary/90"
            onClick={commitUrl}
          >
            Usar URL
          </Button>
        </div>
      )}
    </div>
  );
}


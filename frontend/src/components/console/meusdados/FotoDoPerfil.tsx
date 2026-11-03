import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { chaveDaMinhaConta, useMinhaConta } from "@/hooks/useMinhaConta";
import { TIPOS_DE_FOTO } from "@/lib/fotoDePerfil";
import { iniciais } from "./conta";
import { removerFotoDoProfessor, trocarFotoDoProfessor, type ResultadoDaFoto } from "./fotoDoProfessor";

/** Foto do professor em "Meus dados": enviar, trocar e remover. Salva na hora, fora do "Salvar alterações". */
export function FotoDoPerfil({ uid, nome, desabilitado }: { uid: string | undefined; nome: string; desabilitado?: boolean }) {
  const conta = useMinhaConta();
  const queryClient = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState<"enviando" | "removendo" | null>(null);
  const fotoUrl = conta.data?.fotoUrl ?? null;
  const fotoRef = conta.data?.fotoRef ?? null;

  const concluir = async (resultado: ResultadoDaFoto, sucesso: string) => {
    if ("mensagem" in resultado) {
      toast.error(resultado.mensagem);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: chaveDaMinhaConta(uid) });
    toast.success(sucesso);
  };

  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo || !uid) return;
    setOcupado("enviando");
    try {
      await concluir(await trocarFotoDoProfessor(uid, arquivo, fotoRef), fotoRef ? "Foto trocada." : "Foto adicionada.");
    } finally {
      setOcupado(null);
      if (entrada.current) entrada.current.value = "";
    }
  };

  const remover = async () => {
    if (!uid) return;
    setOcupado("removendo");
    try {
      await concluir(await removerFotoDoProfessor(uid, fotoRef), "Foto removida.");
    } finally {
      setOcupado(null);
    }
  };

  const bloqueado = desabilitado || !uid || ocupado !== null || conta.isLoading;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar className="h-[72px] w-[72px]">
        {fotoUrl && <AvatarImage src={fotoUrl} alt={`Foto de ${nome}`} className="object-cover" />}
        <AvatarFallback className="bg-primary text-xl font-extrabold text-primary-foreground">{iniciais(nome)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-full font-semibold" disabled={bloqueado} onClick={() => entrada.current?.click()}>
            {ocupado === "enviando" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="mr-2 h-4 w-4" aria-hidden="true" />}
            {ocupado === "enviando" ? "Enviando…" : fotoRef ? "Trocar foto" : "Adicionar foto"}
          </Button>
          {fotoRef && (
            <Button type="button" variant="ghost" size="sm" className="rounded-full font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={bloqueado} onClick={remover}>
              {ocupado === "removendo" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />}
              {ocupado === "removendo" ? "Removendo…" : "Remover"}
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">JPG, PNG, WebP ou GIF, até 5 MB.</p>
      </div>
      <input
        ref={entrada}
        type="file"
        accept={TIPOS_DE_FOTO.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label="Escolher foto de perfil"
        onChange={(e) => escolher(e.target.files?.[0])}
      />
    </div>
  );
}

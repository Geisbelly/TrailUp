import * as ImagePicker from "expo-image-picker";
import { useState } from "react";

import { useNotifications } from "@/context/NotificacaoContext";
import { useUsuario } from "@/context/SessaoContext";
import { supabase } from "@/database/supabase";
import { Aluno } from "@/models/Aluno";
import { nomeDoArquivoDeFoto, textoDaRef } from "@/utils/fotoPerfil";

export type AvisoInfo = (titulo: string, descricao: string) => void;

/**
 * Estado e ações de "Informações pessoais": os campos, a troca de foto e de
 * banner (com o envio ao Storage) e o salvar. Saiu da tela do app para a web
 * em tela larga (#346) usar a mesma lógica com outro layout. `avisar` diz como
 * mostrar os recados: o app usa Alert; a web, o diálogo do app (lá o Alert
 * não aparece).
 */
export function useInfoPessoais(avisar: AvisoInfo) {
  const { usuario, atualizarUsuario } = useUsuario();
  const { addToast } = useNotifications();

  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [apelido, setApelido] = useState(
    (usuario as any)?.apelido ??
      (usuario?.email ? `@${usuario.email.split("@")[0]}` : "")
  );
  const [descricao, setDescricao] = useState(usuario?.descricao ?? "");
  const [modoNome] = useState(usuario?.modoOperacao_nome ?? "");
  const [modoResposta, setModoResposta] = useState(
    (usuario as any)?.modoResposta ?? "imediato"
  );
  const [fotoUri, setFotoUri] = useState<string | null>(
    (usuario as any)?.foto_url ?? null
  );
  const [bannerUri, setBannerUri] = useState<string | null>(
    (usuario as any)?.banner_url ?? null
  );
  // O que vai para o banco: a ref no Storage. `fotoUri`/`bannerUri` sao o que
  // a tela mostra (o arquivo local logo depois de escolher).
  const [fotoRef, setFotoRef] = useState<string | null>(
    (usuario as any)?.foto_url ?? null
  );
  const [bannerRef, setBannerRef] = useState<string | null>(
    (usuario as any)?.banner_url ?? null
  );

  const uploadToStorage = async (uri: string, type: "foto" | "banner") => {
    try {
      if (!usuario?.id) throw new Error("sessão sem aluno");
      const response = await fetch(uri);
      const mime = response.headers.get("content-type") || `image/${uri.split(".").pop() || "jpeg"}`;
      const arrayBuffer = await response.arrayBuffer();
      const file = new Uint8Array(arrayBuffer);
      // Pasta com o uid: e' o que as politicas de `storage.objects` checam (#195).
      const fileName = nomeDoArquivoDeFoto(usuario.id, mime, Date.now());
      const bucket = type === "foto" ? "perfil_fotos" : "banners_fotos";

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, { contentType: mime, upsert: false });
      if (error) throw error;

      // Bucket privado (#195): grava a REFERENCIA `<bucket>/<caminho>`, nao a
      // URL publica (que da' 400). Quem mostra a imagem assina na hora; o
      // preview continua com o arquivo local que o aluno escolheu.
      const ref = textoDaRef({ bucket, caminho: data.path });
      if (type === "foto") {
        setFotoRef(ref);
      } else {
        setBannerRef(ref);
      }

      avisar("Upload concluído", "Imagem atualizada com sucesso.");
    } catch (err) {
      console.warn("Erro ao subir imagem:", err);
      if (type === "foto") {
        setFotoUri(fotoRef);
      } else {
        setBannerUri(bannerRef);
      }
      avisar("Erro", "Não foi possível enviar a imagem agora.");
    }
  };

  const handlePickImage = async (type: "foto" | "banner") => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      avisar(
        "Permissão negada",
        "Autorize o acesso às fotos para escolher uma imagem."
      );
      return;
    }

    const pickerMediaTypes = ["images"];

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: pickerMediaTypes as any,
      allowsEditing: true,
      aspect: type === "banner" ? [3, 1] : [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) return;

    const uri = result.assets[0].uri;
    if (type === "foto") {
      setFotoUri(uri);
    } else {
      setBannerUri(uri);
    }

    await uploadToStorage(uri, type);
  };

  const salvar = async () => {
    if (!usuario?.id || salvando) {
      if (!usuario?.id) {
        avisar("Aviso", "Sessão inválida.");
      }
      return;
    }

    if (!nome.trim()) {
      avisar("Atenção", "Informe seu nome.");
      return;
    }

    try {
      setSalvando(true);
      await (usuario as Aluno).atualizarPerfilViaFuncao({
        nome,
        apelido,
        modoResposta,
        descricao,
        foto_url: fotoRef,
        banner_url: bannerRef,
      });
      await atualizarUsuario();
      setEditando(false);
      addToast({
        type: "achievement",
        title: "Perfil atualizado",
        description:
          "Suas preferencias de estudo foram salvas e ja entram no proximo ciclo do app.",
      });
    } catch (err) {
      console.warn(err);
      avisar("Erro", "Não foi possível salvar agora.");
    } finally {
      setSalvando(false);
    }
  };

  return {
    usuario,
    editando,
    setEditando,
    salvando,
    nome,
    setNome,
    apelido,
    setApelido,
    descricao,
    setDescricao,
    modoNome,
    modoResposta,
    setModoResposta,
    fotoUri,
    bannerUri,
    handlePickImage,
    salvar,
  };
}

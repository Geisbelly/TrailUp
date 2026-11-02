import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";
import { contarNaoLidas, eTabelaAusente, naoLida, ordenarNotificacoes, type NotificacaoDoProfessor } from "./notificacoesProfessor";

const LIMITE = 30;
const INTERVALO_DE_RESERVA_MS = 60_000;

const tabela = () => supabase.from("professor_notificacoes");

/**
 * Notificações do professor: lê e marca como lida direto no Supabase (RLS `professor_notificacoes_*`,
 * GRANT por coluna só em `lida_em`). Nada passa pela API. O Realtime avisa na hora; a leitura a cada
 * minuto e ao voltar para a aba cobre canal que caiu em silêncio (assinar não reclama quando falta
 * policy ou publicação).
 *
 * `disponivel = false` quando a tabela ainda não existe no banco (migration pendente): o sino some em
 * vez de mostrar erro.
 */
export function useNotificacoesDoProfessor() {
  const [lista, setLista] = useState<NotificacaoDoProfessor[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [disponivel, setDisponivel] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const guarda = useRef(createRequestGuard());

  const carregar = useCallback(async () => {
    const request = guarda.current.next();
    const [recentes, total] = await Promise.all([
      tabela().select("*").order("atualizado_em", { ascending: false }).order("id", { ascending: false }).limit(LIMITE),
      tabela().select("id", { count: "exact", head: true }).is("lida_em", null),
    ]);
    if (!request.isCurrent()) return;
    const erro = recentes.error ?? total.error;
    if (erro) {
      if (eTabelaAusente(erro)) setDisponivel(false);
      setCarregando(false);
      return;
    }
    const linhas = ordenarNotificacoes((recentes.data ?? []) as NotificacaoDoProfessor[]);
    setLista(linhas);
    // O total vem do banco: a lista é só a janela das últimas 30.
    setNaoLidas(total.count ?? contarNaoLidas(linhas));
    setDisponivel(true);
    setCarregando(false);
  }, []);

  useEffect(() => {
    let vivo = true;
    let canal: ReturnType<typeof supabase.channel> | null = null;
    void carregar();

    // A RLS já filtra por professor; o filtro do canal só evita tráfego de outras linhas.
    void supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (!vivo || !id) return;
      canal = supabase
        .channel(`professor_notificacoes:${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "professor_notificacoes", filter: `professor_id=eq.${id}` }, () => void carregar())
        .subscribe();
    });

    const timer = window.setInterval(() => void carregar(), INTERVALO_DE_RESERVA_MS);
    const aoVoltar = () => void carregar();
    window.addEventListener("focus", aoVoltar);
    return () => {
      vivo = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", aoVoltar);
      if (canal) void supabase.removeChannel(canal);
    };
  }, [carregar]);

  const marcarComoLida = useCallback(
    async (id: number) => {
      const anterior = lista.find((n) => n.id === id);
      if (!anterior || !naoLida(anterior)) return;
      const agora = new Date().toISOString();
      setLista((atual) => atual.map((n) => (n.id === id ? { ...n, lida_em: agora } : n)));
      setNaoLidas((atual) => Math.max(0, atual - 1));
      const { data, error } = await tabela().update({ lida_em: agora }).eq("id", id).select("id");
      // Sem erro e sem linha = a policy barrou em silêncio.
      if (error || !data || data.length === 0) {
        setLista((atual) => atual.map((n) => (n.id === id ? anterior : n)));
        setNaoLidas((atual) => atual + 1);
        throw new Error(error?.message ?? "Não foi possível marcar como lida.");
      }
    },
    [lista],
  );

  const marcarTodasComoLidas = useCallback(async () => {
    const anterior = lista;
    const antes = naoLidas;
    const agora = new Date().toISOString();
    setLista((atual) => atual.map((n) => (naoLida(n) ? { ...n, lida_em: agora } : n)));
    setNaoLidas(0);
    // A RLS limita ao próprio professor; `is null` evita reescrever a data das que já estavam lidas.
    const { error } = await tabela().update({ lida_em: agora }).is("lida_em", null);
    if (error) {
      setLista(anterior);
      setNaoLidas(antes);
      throw new Error(error.message);
    }
  }, [lista, naoLidas]);

  return { lista, naoLidas, disponivel, carregando, marcarComoLida, marcarTodasComoLidas };
}

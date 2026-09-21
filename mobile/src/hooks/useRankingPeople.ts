import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/database/supabase";
import { buildRankingProfileMap } from "@/utils/rankingProfiles";

export function useRankingPeople(
  classeId: number | null | undefined,
  ids: readonly string[],
  userId?: string,
  profile?: string | null,
  photo?: string | null,
) {
  const [rows, setRows] = useState<readonly Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setRows([]);
    if (!classeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("social_listar_pessoas", {
          p_classe_id: classeId,
        });
        if (active) setRows(error ? [] : (data ?? []));
      } catch {
        if (active) setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [classeId]);
  const profiles = useMemo(
    () =>
      buildRankingProfileMap(rows, ids, {
        alunoId: userId,
        perfilAtivo: profile,
      }),
    [rows, ids, userId, profile],
  );
  const photos = useMemo(() => {
    const result: Record<string, string> = {};
    for (const row of rows)
      if (typeof row.foto_url === "string" && row.foto_url)
        result[String(row.aluno_id)] = row.foto_url;
    if (userId && photo) result[userId] = photo;
    return result;
  }, [rows, userId, photo]);
  return { profiles, photos, loading };
}

import type { SupabaseClient } from '../../frontend/node_modules/@supabase/supabase-js';
export function materialDoAluno(client: SupabaseClient, uid: string): Promise<{
  profile: string;
  result: {
    total: number;
    itens: Array<{
      brainhex_profile_key?: string | null;
      materiais?: { markdown?: { arquivo_url?: string } } | null;
    }>;
  };
}>;

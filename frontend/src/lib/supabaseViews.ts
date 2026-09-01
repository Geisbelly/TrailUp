import { supabase } from "@/integrations/supabase/client";

// Views do Supabase nao tem tipagem gerada (Views nao entram no schema do
// client) — este builder minimo cobre so os encadeamentos que o console usa
// (.in(...) e .eq().eq().order()) contra o client generico.
type ViewSelectBuilder = {
  in: (column: string, values: ReadonlyArray<string | number>) => Promise<{ data: unknown[] | null }>;
  eq: (column: string, value: string | number) => {
    eq: (column: string, value: string | number) => {
      order: (column: string, options: { ascending: boolean }) => Promise<{ data: unknown[] | null }>;
    };
  };
};

type ViewClient = {
  from: (relation: string) => {
    select: (columns: string) => ViewSelectBuilder;
  };
};

export function selectView(viewName: string): ViewSelectBuilder {
  return (supabase as unknown as ViewClient).from(viewName).select("*");
}

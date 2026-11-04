import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, ok } from './supabase';
import type { Empresa, Papel } from './types';

interface Ctx {
  session: Session;
  empresa: Empresa;
  papel: Papel;
  sair: () => Promise<void>;
}

const EmpresaCtx = createContext<Ctx | null>(null);

export function useEmpresa() {
  const c = useContext(EmpresaCtx);
  if (!c) throw new Error('useEmpresa fora do provider');
  return c;
}

/** Garante sessão + empresa antes de mostrar o app. */
export function EmpresaGate({
  login, criar, children,
}: {
  login: ReactNode;
  criar: ReactNode;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      qc.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const membro = useQuery({
    queryKey: ['membro', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const linhas = ok(await supabase.from('membros').select('papel, empresa:empresas(*)').eq('user_id', session!.user.id).limit(1));
      return (linhas[0] ?? null) as unknown as { papel: Papel; empresa: Empresa } | null;
    },
  });

  if (session === undefined || (session && membro.isLoading)) return <Carregando />;
  if (!session) return <>{login}</>;
  if (membro.error) return <div className="p-8 font-medium text-vermelho">{String(membro.error)}</div>;
  if (!membro.data) return <>{criar}</>;

  const value: Ctx = {
    session,
    empresa: membro.data.empresa,
    papel: membro.data.papel,
    sair: async () => { await supabase.auth.signOut(); },
  };
  return <EmpresaCtx.Provider value={value}>{children}</EmpresaCtx.Provider>;
}

export function Carregando() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-azul-claro border-t-azul" />
    </div>
  );
}

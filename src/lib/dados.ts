import { useQuery } from '@tanstack/react-query';
import { supabase, ok } from './supabase';
import { useEmpresa } from './empresa';
import type { Cliente, EstoqueLinha, Forma, Mecanico, ServicoCat, Veiculo } from './types';

/** Consultas de cadastros usadas em várias telas. */
export function useFormas() {
  const { empresa } = useEmpresa();
  return useQuery({
    queryKey: ['formas', empresa.id],
    queryFn: async () =>
      ok(await supabase.from('formas_pagamento').select('*').eq('empresa_id', empresa.id).order('descricao')) as Forma[],
  });
}

export function useMecanicos(soAtivos = true) {
  const { empresa } = useEmpresa();
  return useQuery({
    queryKey: ['mecanicos', empresa.id, soAtivos],
    queryFn: async () => {
      let q = supabase.from('mecanicos').select('*').eq('empresa_id', empresa.id).order('nome');
      if (soAtivos) q = q.eq('ativo', true);
      return ok(await q) as Mecanico[];
    },
  });
}

export function useServicosCat() {
  const { empresa } = useEmpresa();
  return useQuery({
    queryKey: ['servicos_catalogo', empresa.id],
    queryFn: async () =>
      ok(await supabase.from('servicos_catalogo').select('*').eq('empresa_id', empresa.id).eq('ativo', true).order('descricao')) as ServicoCat[],
  });
}

export function useClientes() {
  const { empresa } = useEmpresa();
  return useQuery({
    queryKey: ['clientes', empresa.id],
    queryFn: async () =>
      ok(await supabase.from('clientes').select('*').eq('empresa_id', empresa.id).order('nome')) as Cliente[],
  });
}

export function useVeiculos(clienteId?: string | null) {
  const { empresa } = useEmpresa();
  return useQuery({
    queryKey: ['veiculos', empresa.id, clienteId ?? 'todos'],
    queryFn: async () => {
      let q = supabase.from('veiculos').select('*').eq('empresa_id', empresa.id).order('placa');
      if (clienteId) q = q.eq('cliente_id', clienteId);
      return ok(await q) as Veiculo[];
    },
  });
}

export function useEstoque() {
  const { empresa } = useEmpresa();
  return useQuery({
    queryKey: ['estoque', empresa.id],
    queryFn: async () =>
      ok(await supabase.from('v_estoque_atual').select('*').eq('empresa_id', empresa.id).order('nome')) as EstoqueLinha[],
  });
}

/** Chaves que mudam quando estoque/dinheiro mudam. */
export const CHAVES_MOVIMENTO = ['estoque', 'vendas', 'os', 'resumo', 'contas', 'painel', 'orcamentos', 'movimentos'];

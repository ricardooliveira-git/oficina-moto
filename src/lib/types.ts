export type Papel = 'dono' | 'balcao' | 'mecanico';
export type TipoVenda = 'normal' | 'troca';
export type StatusOS = 'aberta' | 'em_execucao' | 'aguardando_peca' | 'pronta' | 'entregue' | 'cancelada';
export type StatusOrc = 'aberto' | 'aprovado' | 'recusado' | 'convertido' | 'cancelado';

export interface Empresa { id: string; nome: string; cnpj: string | null; telefone: string | null; permite_estoque_negativo: boolean }
export interface Cliente {
  id: string; empresa_id: string; nome: string; cpf: string | null; whatsapp: string | null; cep: string | null;
  endereco: string | null; numero: string | null; bairro: string | null; complemento: string | null; observacoes: string | null;
}
export interface Veiculo {
  id: string; empresa_id: string; cliente_id: string | null; placa: string; marca: string | null; modelo: string | null;
  ano: number | null; cor: string | null; km_atual: number | null;
}
export interface Mecanico { id: string; nome: string; telefone: string | null; comissao_pct: number; ativo: boolean }
export interface Forma { id: string; descricao: string; gera_conta_receber: boolean; ativo: boolean }
export interface ServicoCat { id: string; descricao: string; preco: number; ativo: boolean }
export interface Produto {
  id: string; empresa_id: string; sku: string | null; codigo_barras: string | null; nome: string; custo: number;
  margem_pct: number; preco_venda: number; preco_troca: number; estoque_minimo: number; foto_path: string | null; ativo: boolean;
}
export interface EstoqueLinha {
  produto_id: string; nome: string; codigo_barras: string | null; estoque_minimo: number; saldo: number; custo: number;
  preco_venda: number; preco_troca: number; valor_estoque: number; abaixo_minimo: boolean;
}
export interface Pagamento { forma_id: string; valor: number }

export const STATUS_OS: Record<StatusOS, { nome: string; cor: string }> = {
  aberta: { nome: 'Aberta', cor: 'bg-sky-100 text-sky-700' },
  em_execucao: { nome: 'Em execução', cor: 'bg-amber-100 text-amber-700' },
  aguardando_peca: { nome: 'Aguardando peça', cor: 'bg-purple-100 text-purple-700' },
  pronta: { nome: 'Pronta', cor: 'bg-emerald-100 text-emerald-700' },
  entregue: { nome: 'Entregue', cor: 'bg-slate-200 text-slate-700' },
  cancelada: { nome: 'Cancelada', cor: 'bg-red-100 text-red-700' },
};

export const STATUS_ORC: Record<StatusOrc, { nome: string; cor: string }> = {
  aberto: { nome: 'Aberto', cor: 'bg-sky-100 text-sky-700' },
  aprovado: { nome: 'Aprovado', cor: 'bg-emerald-100 text-emerald-700' },
  recusado: { nome: 'Recusado', cor: 'bg-red-100 text-red-700' },
  convertido: { nome: 'Convertido', cor: 'bg-slate-200 text-slate-700' },
  cancelado: { nome: 'Cancelado', cor: 'bg-red-100 text-red-700' },
};

export const CATEGORIAS_DESPESA = {
  administrativa: 'Administrativa',
  pecas_insumos: 'Peças / Insumos',
  funcionarios: 'Funcionários',
  outras: 'Outras',
} as const;

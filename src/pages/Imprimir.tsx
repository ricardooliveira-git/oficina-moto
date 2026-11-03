import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { supabase, ok } from '../lib/supabase';
import { useEmpresa } from '../lib/empresa';
import { data, dataHora, dinheiro, numero, telefone } from '../lib/format';
import { Spinner } from '../components/ui';

interface Doc {
  titulo: string; numero: number | null; quando: string;
  cliente: { nome: string; whatsapp: string | null; endereco: string | null; numero: string | null; bairro: string | null } | null;
  veiculo: { placa: string; marca: string | null; modelo: string | null; ano: number | null } | null;
  linhas: { desc: string; qtd: number; unit: number; total: number; troca?: number | null }[];
  extras: [string, string][];
  totais: [string, number][];
  textos: [string, string | null][];
  pagamentos: { forma: string; valor: number; troco: number }[];
  assinatura: boolean;
}

/** Substitui os PDFs gerados pelos bots do AppSheet: abre pronto para imprimir ou "Salvar como PDF". */
export function Imprimir() {
  const { tipo, id } = useParams<{ tipo: 'venda' | 'os' | 'orcamento'; id: string }>();
  const { empresa } = useEmpresa();

  const q = useQuery({
    queryKey: ['imprimir', tipo, id],
    queryFn: async (): Promise<Doc> => {
      const cli = 'cliente:clientes(nome, whatsapp, endereco, numero, bairro)';
      if (tipo === 'venda') {
        const v = ok(await supabase.from('vendas').select(`*, ${cli}, itens:venda_itens(quantidade, preco_unitario, subtotal, produto:produtos(nome))`).eq('id', id!).single()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const pg = ok(await supabase.from('pagamentos').select('valor, troco, forma:formas_pagamento(descricao)').eq('origem', 'venda').eq('origem_id', id!).eq('estornado', false)) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
        return {
          titulo: v.tipo === 'troca' ? 'Venda com troca' : 'Comprovante de venda', numero: v.numero, quando: dataHora(v.finalizado_em ?? v.criado_em),
          cliente: v.cliente, veiculo: null,
          linhas: v.itens.map((i: any) => ({ desc: i.produto.nome, qtd: i.quantidade, unit: i.preco_unitario, total: i.subtotal })), // eslint-disable-line @typescript-eslint/no-explicit-any
          extras: v.status === 'cancelada' ? [['Situação', 'CANCELADA']] : v.status === 'a_receber' ? [['Situação', 'Com valor a receber']] : [],
          totais: [['Subtotal', v.subtotal], ...(Number(v.desconto) ? [['Desconto', -v.desconto] as [string, number]] : []), ['Total', v.total]],
          textos: [], pagamentos: pg.map((p) => ({ forma: p.forma.descricao, valor: p.valor, troco: p.troco })), assinatura: false,
        };
      }
      if (tipo === 'os') {
        const o = ok(await supabase.from('ordens_servico').select(`*, ${cli}, veiculo:veiculos(placa, marca, modelo, ano), mecanico:mecanicos(nome), itens:os_itens(tipo, descricao, quantidade, preco_unitario, subtotal)`).eq('id', id!).single()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const pg = ok(await supabase.from('pagamentos').select('valor, troco, forma:formas_pagamento(descricao)').eq('origem', 'os').eq('origem_id', id!).eq('estornado', false)) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
        const itens = [...o.itens].sort((a: any, b: any) => (a.tipo === b.tipo ? 0 : a.tipo === 'peca' ? -1 : 1)); // eslint-disable-line @typescript-eslint/no-explicit-any
        return {
          titulo: 'Ordem de serviço', numero: o.numero, quando: dataHora(o.data_entrada), cliente: o.cliente, veiculo: o.veiculo,
          linhas: itens.map((i: any) => ({ desc: (i.tipo === 'servico' ? 'Mão de obra: ' : '') + i.descricao, qtd: i.quantidade, unit: i.preco_unitario, total: i.subtotal })), // eslint-disable-line @typescript-eslint/no-explicit-any
          extras: [
            ['Km', o.km_entrada ? numero(o.km_entrada) : '—'], ['Mecânico', o.mecanico?.nome ?? '—'],
            ['Previsão', o.previsao ? data(o.previsao) : '—'], ['Entrega', o.data_entrega ? dataHora(o.data_entrega) : '—'],
          ],
          totais: [['Subtotal', o.subtotal], ...(Number(o.desconto) ? [['Desconto', -o.desconto] as [string, number]] : []), ['Total', o.total]],
          textos: [['Defeito relatado', o.defeito_relatado], ['Diagnóstico / serviço executado', o.diagnostico], ['Observações', o.observacao]],
          pagamentos: pg.map((p) => ({ forma: p.forma.descricao, valor: p.valor, troco: p.troco })), assinatura: true,
        };
      }
      const o = ok(await supabase.from('orcamentos').select(`*, ${cli}, veiculo:veiculos(placa, marca, modelo, ano), itens:orcamento_itens(tipo, descricao, quantidade, preco_normal, preco_troca, subtotal_normal, subtotal_troca)`).eq('id', id!).single()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const temTroca = Number(o.total_troca) !== Number(o.total_normal);
      return {
        titulo: 'Orçamento', numero: o.numero, quando: data(o.data), cliente: o.cliente, veiculo: o.veiculo,
        linhas: o.itens.map((i: any) => ({ desc: (i.tipo === 'servico' ? 'Mão de obra: ' : '') + i.descricao, qtd: i.quantidade, unit: i.preco_normal, total: i.subtotal_normal, troca: temTroca ? i.subtotal_troca : undefined })), // eslint-disable-line @typescript-eslint/no-explicit-any
        extras: [['Válido até', o.validade ? data(o.validade) : '—']],
        totais: [['Total', o.total_normal], ...(temTroca ? [['Total com troca da peça usada', o.total_troca] as [string, number]] : [])],
        textos: [['Observações', o.observacao]], pagamentos: [], assinatura: false,
      };
    },
  });

  if (q.isLoading) return <div className="flex justify-center p-10"><Spinner /></div>;
  if (q.error || !q.data) return <p className="p-8 text-red-600">Documento não encontrado.</p>;
  const d = q.data;
  const temTroca = d.linhas.some((l) => l.troca !== undefined);

  return (
    <div className="min-h-screen bg-slate-200 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[800px] justify-end gap-2 px-4">
        <button className="btn-primary" onClick={() => window.print()}><Printer size={16} /> Imprimir / Salvar PDF</button>
      </div>
      <article className="mx-auto max-w-[800px] bg-white p-8 text-sm shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-ink-900 pb-4">
          <div>
            <h1 className="text-xl font-bold">{empresa.nome}</h1>
            <p className="text-slate-600">{[empresa.cnpj && `CNPJ ${empresa.cnpj}`, empresa.telefone && telefone(empresa.telefone)].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase">{d.titulo}</p>
            {d.numero && <p className="text-2xl font-bold">Nº {d.numero}</p>}
            <p className="text-slate-600">{d.quando}</p>
          </div>
        </header>

        {(d.cliente || d.veiculo) && (
          <section className="grid grid-cols-2 gap-4 border-b border-slate-200 py-3">
            <div>
              <p className="text-xs uppercase text-slate-500">Cliente</p>
              <p className="font-semibold">{d.cliente?.nome ?? '—'}</p>
              {d.cliente?.whatsapp && <p>{telefone(d.cliente.whatsapp)}</p>}
              {d.cliente?.endereco && <p className="text-slate-600">{d.cliente.endereco}, {d.cliente.numero ?? 's/n'} — {d.cliente.bairro}</p>}
            </div>
            {d.veiculo && (
              <div>
                <p className="text-xs uppercase text-slate-500">Moto</p>
                <p className="font-semibold">{d.veiculo.placa}</p>
                <p>{[d.veiculo.marca, d.veiculo.modelo, d.veiculo.ano].filter(Boolean).join(' ')}</p>
              </div>
            )}
          </section>
        )}

        {d.extras.length > 0 && (
          <section className="flex flex-wrap gap-x-8 gap-y-1 border-b border-slate-200 py-3">
            {d.extras.map(([k, v]) => <p key={k}><span className="text-slate-500">{k}:</span> <b>{v}</b></p>)}
          </section>
        )}

        {d.textos.filter(([, v]) => v).map(([k, v]) => (
          <section key={k} className="border-b border-slate-200 py-3">
            <p className="text-xs uppercase text-slate-500">{k}</p>
            <p className="whitespace-pre-line">{v}</p>
          </section>
        ))}

        <table className="mt-3 w-full">
          <thead className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
            <tr><th className="py-1">Descrição</th><th className="py-1 text-center">Qtd</th><th className="py-1 text-right">Unit.</th><th className="py-1 text-right">Total</th>{temTroca && <th className="py-1 text-right">C/ troca</th>}</tr>
          </thead>
          <tbody>
            {d.linhas.map((l, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-1.5">{l.desc}</td><td className="py-1.5 text-center">{numero(l.qtd)}</td>
                <td className="py-1.5 text-right">{dinheiro(l.unit)}</td><td className="py-1.5 text-right">{dinheiro(l.total)}</td>
                {temTroca && <td className="py-1.5 text-right">{dinheiro(l.troca)}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        <section className="ml-auto mt-3 w-72 space-y-1">
          {d.totais.map(([k, v], i) => (
            <p key={k} className={`flex justify-between ${i === d.totais.length - 1 || k === 'Total' ? 'border-t border-slate-300 pt-1 text-lg font-bold' : ''}`}>
              <span>{k}</span><span>{dinheiro(v)}</span>
            </p>
          ))}
          {d.pagamentos.map((p, i) => (
            <p key={i} className="flex justify-between text-slate-600"><span>{p.forma}</span><span>{dinheiro(p.valor)}{Number(p.troco) > 0 && ` (troco ${dinheiro(p.troco)})`}</span></p>
          ))}
        </section>

        {d.assinatura && (
          <section className="mt-16 grid grid-cols-2 gap-10 text-center text-xs text-slate-600">
            <div className="border-t border-slate-400 pt-1">Assinatura do cliente</div>
            <div className="border-t border-slate-400 pt-1">{empresa.nome}</div>
          </section>
        )}
        <p className="mt-8 text-center text-xs text-slate-400">Documento sem valor fiscal</p>
      </article>
    </div>
  );
}

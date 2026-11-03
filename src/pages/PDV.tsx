import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Minus, Plus, Trash2, Printer, MessageCircle, CheckCircle2, ShoppingCart } from 'lucide-react';
import { supabase, ok } from '../lib/supabase';
import { useEmpresa } from '../lib/empresa';
import { CHAVES_MOVIMENTO, useClientes, useMecanicos } from '../lib/dados';
import { dinheiro, linkWhatsapp, num, numero } from '../lib/format';
import { Field, Modal, PageHeader, msgErro, useAviso } from '../components/ui';
import { ClienteSelect, ProdutoBusca } from '../components/Selects';
import { PagamentoModal } from '../components/Pagamento';
import type { EstoqueLinha, Pagamento, TipoVenda } from '../lib/types';

interface Item { produto_id: string; nome: string; quantidade: number; preco: number; saldo: number }
interface Carrinho { tipo: TipoVenda; itens: Item[]; cliente_id: string | null; mecanico_id: string | null; desconto: string }

const VAZIO: Carrinho = { tipo: 'normal', itens: [], cliente_id: null, mecanico_id: null, desconto: '' };

function lerCarrinho(): Carrinho {
  try { return { ...VAZIO, ...JSON.parse(localStorage.getItem('pdv-carrinho') || '{}') }; } catch { return VAZIO; }
}

/** Ponto de venda: substitui as telas Vendas, Vendas C/ Troca, Produto Venda e Carrinho do AppSheet. */
export function PDV() {
  const { empresa } = useEmpresa();
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: mecanicos = [] } = useMecanicos();
  const { data: clientes = [] } = useClientes();
  const [c, setC] = useState<Carrinho>(lerCarrinho);
  const [pagando, setPagando] = useState(false);
  const [feita, setFeita] = useState<{ id: string; numero: number; total: number; cliente_id: string | null } | null>(null);

  useEffect(() => { try { localStorage.setItem('pdv-carrinho', JSON.stringify(c)); } catch { /* ignore */ } }, [c]);

  const subtotal = c.itens.reduce((a, i) => a + i.quantidade * i.preco, 0);
  const desconto = Math.min(num(c.desconto), subtotal);
  const total = Math.round((subtotal - desconto) * 100) / 100;

  function adicionar(p: EstoqueLinha) {
    const preco = Number(c.tipo === 'troca' ? p.preco_troca : p.preco_venda);
    setC((v) => {
      const ja = v.itens.find((i) => i.produto_id === p.produto_id);
      if (ja) return { ...v, itens: v.itens.map((i) => (i === ja ? { ...i, quantidade: i.quantidade + 1 } : i)) };
      return { ...v, itens: [...v.itens, { produto_id: p.produto_id, nome: p.nome, quantidade: 1, preco, saldo: Number(p.saldo) }] };
    });
    if (Number(p.saldo) <= 0) avisar(`${p.nome} está sem estoque`, 'erro');
  }

  const altera = (id: string, fn: (i: Item) => Item | null) =>
    setC((v) => ({ ...v, itens: v.itens.map((i) => (i.produto_id === id ? fn(i) : i)).filter(Boolean) as Item[] }));

  const finalizar = useMutation({
    mutationFn: async (pagamentos: Pagamento[]) => {
      const venda = ok(await supabase.from('vendas').insert({
        empresa_id: empresa.id, tipo: c.tipo, cliente_id: c.cliente_id, mecanico_id: c.tipo === 'troca' ? c.mecanico_id : null,
      }).select('id').single()) as { id: string };
      try {
        ok(await supabase.from('venda_itens').insert(
          c.itens.map((i) => ({ venda_id: venda.id, produto_id: i.produto_id, quantidade: i.quantidade, preco_unitario: i.preco })),
        ));
        if (desconto > 0) ok(await supabase.from('vendas').update({ desconto }).eq('id', venda.id));
        return ok(await supabase.rpc('finalizar_venda', { p_venda: venda.id, p_pagamentos: pagamentos })) as {
          id: string; numero: number; total: number; cliente_id: string | null;
        };
      } catch (e) {
        await supabase.from('vendas').delete().eq('id', venda.id); // não deixa carrinho órfão
        throw e;
      }
    },
    onSuccess: (v) => {
      CHAVES_MOVIMENTO.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setPagando(false); setFeita(v); setC({ ...VAZIO, tipo: c.tipo });
    },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  const clienteFeita = clientes.find((x) => x.id === feita?.cliente_id);

  return (
    <>
      <PageHeader
        titulo="Vender"
        acoes={
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
            {(['normal', 'troca'] as const).map((t) => (
              <button
                key={t}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold ${c.tipo === t ? 'bg-ink-900 text-white' : 'text-slate-600'}`}
                onClick={() => setC((v) => ({ ...v, tipo: t, itens: [] }))}
                title={c.itens.length ? 'Trocar o tipo esvazia o carrinho' : ''}
              >
                {t === 'normal' ? 'Venda' : 'Venda c/ troca'}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-4">
          <ProdutoBusca onEscolher={adicionar} tipo={c.tipo} />
          <div className="card overflow-hidden">
            {!c.itens.length ? (
              <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
                <ShoppingCart size={36} />
                <p className="text-sm">Busque um produto ou leia o código de barras.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {c.itens.map((i) => (
                  <li key={i.produto_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{i.nome}</p>
                      <p className={`text-xs ${i.quantidade > i.saldo ? 'text-red-600' : 'text-slate-500'}`}>
                        {dinheiro(i.preco)} un. · estoque {numero(i.saldo)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="btn-ghost px-2 py-1" onClick={() => altera(i.produto_id, (x) => (x.quantidade > 1 ? { ...x, quantidade: x.quantidade - 1 } : null))}><Minus size={14} /></button>
                      <input
                        className="input w-16 py-1 text-center" inputMode="decimal" value={i.quantidade}
                        onChange={(e) => altera(i.produto_id, (x) => ({ ...x, quantidade: Math.max(num(e.target.value), 0) }))}
                      />
                      <button className="btn-ghost px-2 py-1" onClick={() => altera(i.produto_id, (x) => ({ ...x, quantidade: x.quantidade + 1 }))}><Plus size={14} /></button>
                    </div>
                    <input
                      className="input w-24 py-1 text-right" inputMode="decimal" title="Preço unitário"
                      value={String(i.preco).replace('.', ',')}
                      onChange={(e) => altera(i.produto_id, (x) => ({ ...x, preco: num(e.target.value) }))}
                    />
                    <p className="w-24 text-right font-semibold">{dinheiro(i.quantidade * i.preco)}</p>
                    <button className="text-slate-400 hover:text-red-600" onClick={() => altera(i.produto_id, () => null)} aria-label="Remover"><Trash2 size={16} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="card h-fit space-y-4 p-4 lg:sticky lg:top-6">
          <Field label="Cliente"><ClienteSelect value={c.cliente_id} onChange={(id) => setC({ ...c, cliente_id: id })} /></Field>
          {c.tipo === 'troca' && (
            <Field label="Mecânico">
              <select className="input" value={c.mecanico_id ?? ''} onChange={(e) => setC({ ...c, mecanico_id: e.target.value || null })}>
                <option value="">—</option>
                {mecanicos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </Field>
          )}
          <Field label="Desconto (R$)"><input className="input" inputMode="decimal" value={c.desconto} onChange={(e) => setC({ ...c, desconto: e.target.value })} /></Field>
          <dl className="space-y-1 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{dinheiro(subtotal)}</dd></div>
            {desconto > 0 && <div className="flex justify-between text-red-600"><dt>Desconto</dt><dd>-{dinheiro(desconto)}</dd></div>}
            <div className="flex justify-between pt-1 text-xl font-bold"><dt>Total</dt><dd>{dinheiro(total)}</dd></div>
          </dl>
          <button className="btn-primary w-full py-3 text-base" disabled={!c.itens.length || c.itens.some((i) => i.quantidade <= 0)} onClick={() => setPagando(true)}>
            Receber {dinheiro(total)}
          </button>
          {c.itens.length > 0 && <button className="w-full text-sm text-slate-500 hover:underline" onClick={() => setC({ ...VAZIO, tipo: c.tipo })}>Limpar carrinho</button>}
        </aside>
      </div>

      <PagamentoModal
        aberto={pagando} onFechar={() => setPagando(false)} total={total} temCliente={!!c.cliente_id}
        salvando={finalizar.isPending} onConfirmar={(p) => finalizar.mutate(p)}
      />

      <Modal aberto={!!feita} onFechar={() => setFeita(null)} titulo="Venda concluída">
        <div className="flex flex-col items-center gap-2 text-center">
          <CheckCircle2 size={48} className="text-emerald-500" />
          <p className="text-lg font-semibold">Venda #{feita?.numero} · {dinheiro(feita?.total)}</p>
          <p className="text-sm text-slate-500">Estoque baixado automaticamente.</p>
        </div>
        <div className="mt-5 grid gap-2">
          <Link className="btn-dark" to={`/imprimir/venda/${feita?.id}`} target="_blank"><Printer size={16} /> Imprimir cupom</Link>
          {clienteFeita?.whatsapp && (
            <a className="btn-wa" target="_blank" rel="noreferrer"
              href={linkWhatsapp(clienteFeita.whatsapp, `Olá, ${clienteFeita.nome.split(' ')[0]}! Obrigado pela compra na ${empresa.nome}. Venda #${feita?.numero}: ${dinheiro(feita?.total)}.`)}>
              <MessageCircle size={16} /> Enviar no WhatsApp
            </a>
          )}
          <button className="btn-primary" onClick={() => setFeita(null)}>Nova venda</button>
        </div>
      </Modal>
    </>
  );
}

/** Fecha uma venda que veio de um orçamento (já está gravada como carrinho no banco). */
export function VendaPendente() {
  const { id } = useParams();
  const qc = useQueryClient();
  const avisar = useAviso();
  const nav = useNavigate();
  const [pagando, setPagando] = useState(false);

  const venda = useQuery({
    queryKey: ['vendas', 'pendente', id],
    queryFn: async () =>
      ok(await supabase.from('vendas').select('id, tipo, status, total, cliente_id, cliente:clientes(nome), itens:venda_itens(id, quantidade, preco_unitario, subtotal, produto:produtos(nome))').eq('id', id!).single()) as unknown as {
        id: string; tipo: TipoVenda; status: string; total: number; cliente_id: string | null; cliente: { nome: string } | null;
        itens: { id: string; quantidade: number; preco_unitario: number; subtotal: number; produto: { nome: string } }[];
      },
  });

  const finalizar = useMutation({
    mutationFn: async (p: Pagamento[]) => ok(await supabase.rpc('finalizar_venda', { p_venda: id, p_pagamentos: p })) as { numero: number },
    onSuccess: (v) => { CHAVES_MOVIMENTO.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); avisar(`Venda #${v.numero} concluída`); nav('/vendas'); },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });
  const descartar = useMutation({
    mutationFn: async () => ok(await supabase.from('vendas').delete().eq('id', id!).eq('status', 'carrinho')),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendas'] }); nav('/orcamentos'); },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  const v = venda.data;
  if (!v) return null;
  return (
    <>
      <PageHeader titulo="Fechar venda do orçamento" sub={`${v.cliente?.nome ?? 'Sem cliente'} · ${v.tipo === 'troca' ? 'com troca' : 'venda'}`} />
      <div className="card max-w-xl">
        <ul className="divide-y divide-slate-100">
          {v.itens.map((i) => (
            <li key={i.id} className="flex justify-between px-4 py-2 text-sm">
              <span>{numero(i.quantidade)} × {i.produto.nome}</span><b>{dinheiro(i.subtotal)}</b>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <span className="text-lg font-bold">{dinheiro(v.total)}</span>
          {v.status === 'carrinho' ? (
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => descartar.mutate()}>Descartar</button>
              <button className="btn-primary" onClick={() => setPagando(true)}>Receber</button>
            </div>
          ) : <span className="badge bg-emerald-100 text-emerald-700">Já finalizada</span>}
        </div>
      </div>
      <PagamentoModal aberto={pagando} onFechar={() => setPagando(false)} total={Number(v.total)} temCliente={!!v.cliente_id}
        salvando={finalizar.isPending} onConfirmar={(p) => finalizar.mutate(p)} />
    </>
  );
}

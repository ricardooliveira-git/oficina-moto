import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, MessageCircle } from 'lucide-react';
import { supabase, ok } from '../lib/supabase';
import { useEmpresa } from '../lib/empresa';
import { CHAVES_MOVIMENTO, useFormas } from '../lib/dados';
import { data, dinheiro, hoje, inicioMes, linkWhatsapp, num } from '../lib/format';
import { Field, Modal, PageHeader, Spinner, Stat, Vazio, msgErro, useAviso } from '../components/ui';
import { CATEGORIAS_DESPESA } from '../lib/types';

type Aba = 'resumo' | 'despesas' | 'receber';

export function Financeiro() {
  const [aba, setAba] = useState<Aba>('resumo');
  const [de, setDe] = useState(inicioMes());
  const [ate, setAte] = useState(hoje());
  return (
    <>
      <PageHeader titulo="Financeiro" />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="segmentado">
          {([['resumo', 'Resumo'], ['despesas', 'Despesas'], ['receber', 'A receber']] as const).map(([k, n]) => (
            <button key={k} className={`segmento ${aba === k ? 'segmento-ativo' : ''}`} onClick={() => setAba(k)}>{n}</button>
          ))}
        </div>
        {aba !== 'receber' && (
          <>
            <Field label="De"><input type="date" className="input" value={de} onChange={(e) => setDe(e.target.value)} /></Field>
            <Field label="Até"><input type="date" className="input" value={ate} onChange={(e) => setAte(e.target.value)} /></Field>
          </>
        )}
      </div>
      {aba === 'resumo' && <Resumo de={de} ate={ate} />}
      {aba === 'despesas' && <Despesas de={de} ate={ate} />}
      {aba === 'receber' && <Receber />}
    </>
  );
}

function Resumo({ de, ate }: { de: string; ate: string }) {
  const { empresa } = useEmpresa();
  const q = useQuery({
    queryKey: ['resumo', empresa.id, de, ate],
    queryFn: async () =>
      ok(await supabase.from('v_resumo_diario').select('*').eq('empresa_id', empresa.id).gte('data', de).lte('data', ate).order('data', { ascending: false })) as {
        data: string; servicos: number; vendas: number; vendas_troca: number; despesas: number;
      }[],
  });
  const l = q.data ?? [];
  const t = l.reduce((a, r) => ({
    s: a.s + Number(r.servicos), v: a.v + Number(r.vendas), vt: a.vt + Number(r.vendas_troca), d: a.d + Number(r.despesas),
  }), { s: 0, v: 0, vt: 0, d: 0 });
  const saldo = t.s + t.v + t.vt - t.d;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <Stat titulo="Serviços (OS)" valor={dinheiro(t.s)} />
        <Stat titulo="Vendas" valor={dinheiro(t.v)} />
        <Stat titulo="Vendas c/ troca" valor={dinheiro(t.vt)} />
        <Stat titulo="Despesas" valor={dinheiro(t.d)} />
        <Stat titulo="Saldo" valor={<span className={saldo < 0 ? 'text-vermelho' : ''}><span className="numero">{dinheiro(saldo)}</span></span>} destaque />
      </div>
      <div className="cartao overflow-x-auto">
        {q.isLoading ? <div className="flex justify-center p-10"><Spinner /></div> : !l.length ? <Vazio texto="Sem movimento no período." /> : (
          <table className="w-full min-w-[600px]">
            <thead className="border-b border-linha bg-nevoa">
              <tr><th className="th">Dia</th><th className="th text-right">Serviços</th><th className="th text-right">Vendas</th><th className="th text-right">C/ troca</th><th className="th text-right">Despesas</th><th className="th text-right">Saldo</th></tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {l.map((r) => {
                const s = Number(r.servicos) + Number(r.vendas) + Number(r.vendas_troca) - Number(r.despesas);
                return (
                  <tr key={r.data}>
                    <td className="numero td font-medium">{data(r.data)}</td>
                    <td className="td numero text-right">{dinheiro(r.servicos)}</td>
                    <td className="td numero text-right">{dinheiro(r.vendas)}</td>
                    <td className="td numero text-right">{dinheiro(r.vendas_troca)}</td>
                    <td className="td numero text-right text-vermelho">{Number(r.despesas) ? `-${dinheiro(r.despesas)}` : '—'}</td>
                    <td className={`td numero text-right font-semibold ${s < 0 ? 'text-vermelho' : ''}`}><span className="numero">{dinheiro(s)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-sm text-tinta-suave">Vendas a receber entram no dia da venda; o recebimento do fiado aparece na aba "A receber".</p>
    </>
  );
}

function Despesas({ de, ate }: { de: string; ate: string }) {
  const { empresa } = useEmpresa();
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: formas = [] } = useFormas();
  const [nova, setNova] = useState(false);
  const [f, setF] = useState({ data_pagamento: hoje(), valor: '', forma_id: '', categoria: 'administrativa', descricao: '', observacao: '' });

  const q = useQuery({
    queryKey: ['resumo', 'despesas', empresa.id, de, ate],
    queryFn: async () =>
      ok(await supabase.from('despesas').select('*, forma:formas_pagamento(descricao)').eq('empresa_id', empresa.id).gte('data_pagamento', de).lte('data_pagamento', ate).order('data_pagamento', { ascending: false })) as unknown as {
        id: string; data_pagamento: string; valor: number; categoria: keyof typeof CATEGORIAS_DESPESA; descricao: string; observacao: string | null; forma: { descricao: string } | null;
      }[],
  });

  const salvar = useMutation({
    mutationFn: async () => ok(await supabase.from('despesas').insert({
      empresa_id: empresa.id, data_pagamento: f.data_pagamento, valor: num(f.valor), forma_id: f.forma_id || null,
      categoria: f.categoria, descricao: f.descricao.trim(), observacao: f.observacao || null,
    })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['resumo'] }); avisar('Despesa lançada'); setNova(false); setF({ ...f, valor: '', descricao: '', observacao: '' }); },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });
  const excluir = useMutation({
    mutationFn: async (id: string) => ok(await supabase.from('despesas').delete().eq('id', id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['resumo'] }); avisar('Despesa excluída'); },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  const l = q.data ?? [];
  const porCat = Object.entries(CATEGORIAS_DESPESA).map(([k, n]) => ({ n, v: l.filter((d) => d.categoria === k).reduce((a, d) => a + Number(d.valor), 0) })).filter((c) => c.v > 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tinta-suave">
          Total <span className="numero">{dinheiro(l.reduce((a, d) => a + Number(d.valor), 0))}</span>
          {porCat.map((c) => <span key={c.n} className="ml-3 text-tinta-suave">{c.n}: <span className="numero">{dinheiro(c.v)}</span></span>)}
        </p>
        <button className="btn-primary" onClick={() => setNova(true)}><Plus size={18} /> Nova despesa</button>
      </div>
      <div className="cartao overflow-x-auto">
        {q.isLoading ? <div className="flex justify-center p-10"><Spinner /></div> : !l.length ? <Vazio texto="Nenhuma despesa no período." /> : (
          <table className="w-full min-w-[600px]">
            <thead className="border-b border-linha bg-nevoa">
              <tr><th className="th">Data</th><th className="th">Descrição</th><th className="th">Categoria</th><th className="th">Pago com</th><th className="th text-right">Valor</th><th className="th"></th></tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {l.map((d) => (
                <tr key={d.id}>
                  <td className="numero td">{data(d.data_pagamento)}</td>
                  <td className="td">{d.descricao}{d.observacao && <span className="block text-sm text-tinta-suave">{d.observacao}</span>}</td>
                  <td className="td">{CATEGORIAS_DESPESA[d.categoria]}</td>
                  <td className="td">{d.forma?.descricao ?? '—'}</td>
                  <td className="td numero text-right font-semibold">{dinheiro(d.valor)}</td>
                  <td className="td"><button className="icone-acao" onClick={() => excluir.mutate(d.id)} aria-label="Excluir"><Trash2 size={18} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal aberto={nova} onFechar={() => setNova(false)} titulo="Nova despesa">
        <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="grid grid-cols-2 gap-3">
          <Field label="Descrição *" className="col-span-2"><input className="input" required autoFocus value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Field>
          <Field label="Valor (R$) *"><input className="input" required inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Field>
          <Field label="Data do pagamento"><input type="date" className="input" value={f.data_pagamento} onChange={(e) => setF({ ...f, data_pagamento: e.target.value })} /></Field>
          <Field label="Categoria">
            <select className="input" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
              {Object.entries(CATEGORIAS_DESPESA).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </Field>
          <Field label="Pago com">
            <select className="input" value={f.forma_id} onChange={(e) => setF({ ...f, forma_id: e.target.value })}>
              <option value="">—</option>
              {formas.filter((x) => !x.gera_conta_receber).map((x) => <option key={x.id} value={x.id}>{x.descricao}</option>)}
            </select>
          </Field>
          <Field label="Observação" className="col-span-2"><input className="input" value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></Field>
          <button className="btn-primary col-span-2" disabled={salvar.isPending || num(f.valor) <= 0}>{salvar.isPending && <Spinner />} Lançar</button>
        </form>
      </Modal>
    </>
  );
}

interface Conta {
  id: string; origem: 'venda' | 'os' | 'manual'; origem_id: string | null; valor: number; valor_pago: number; vencimento: string; status: string; criado_em: string;
  cliente: { nome: string; whatsapp: string | null } | null;
}

function Receber() {
  const { empresa } = useEmpresa();
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: formas = [] } = useFormas();
  const [conta, setConta] = useState<Conta | null>(null);
  const [valor, setValor] = useState('');
  const [forma, setForma] = useState('');

  const q = useQuery({
    queryKey: ['contas', empresa.id, 'lista'],
    queryFn: async () =>
      ok(await supabase.from('contas_receber').select('*, cliente:clientes(nome, whatsapp)').eq('empresa_id', empresa.id).in('status', ['aberta', 'parcial']).order('vencimento')) as unknown as Conta[],
  });

  const receber = useMutation({
    mutationFn: async () => ok(await supabase.rpc('receber_conta', { p_conta: conta!.id, p_valor: num(valor), p_forma: forma })),
    onSuccess: () => { CHAVES_MOVIMENTO.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); avisar('Recebimento registrado'); setConta(null); },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  const l = q.data ?? [];
  const recebiveis = formas.filter((f) => !f.gera_conta_receber && f.ativo);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat titulo="Total a receber" valor={dinheiro(l.reduce((a, c) => a + Number(c.valor) - Number(c.valor_pago), 0))} destaque />
        <Stat titulo="Vencidas" valor={l.filter((c) => c.vencimento < hoje()).length} />
      </div>
      <div className="cartao">
        {q.isLoading ? <div className="flex justify-center p-10"><Spinner /></div> : !l.length ? <Vazio texto="Nenhuma conta em aberto." /> : (
          <ul className="divide-y divide-linha">
            {l.map((c) => {
              const resta = Number(c.valor) - Number(c.valor_pago);
              const vencida = c.vencimento < hoje();
              const venceHoje = c.vencimento === hoje();
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-40 flex-1">
                    <p className="font-medium">{c.cliente?.nome ?? '—'}</p>
                    <p className={`text-sm ${vencida ? 'font-semibold text-vermelho' : venceHoje ? 'font-semibold text-ambar' : 'text-tinta-suave'}`}>
                      {c.origem === 'os' ? 'OS' : 'Venda'} de <span className="numero">{data(c.criado_em)}</span> · vence <span className="numero">{data(c.vencimento)}</span>
                      {Number(c.valor_pago) > 0 && ` · já pagou ${dinheiro(c.valor_pago)}`}
                    </p>
                  </div>
                  <b className="numero">{dinheiro(resta)}</b>
                  {c.cliente?.whatsapp && (
                    <a className="btn-wa px-3" target="_blank" rel="noreferrer" title="Cobrar no WhatsApp"
                      href={linkWhatsapp(c.cliente.whatsapp, `Olá, ${c.cliente.nome.split(' ')[0]}! Aqui é da ${empresa.nome}. Consta em aberto o valor de ${dinheiro(resta)}${vencida ? `, vencido em ${data(c.vencimento)}` : `, com vencimento em ${data(c.vencimento)}`}. Podemos combinar o pagamento?`)}>
                      <MessageCircle size={18} />
                    </a>
                  )}
                  <button className="btn-primary" onClick={() => { setConta(c); setValor(resta.toFixed(2).replace('.', ',')); setForma(recebiveis.find((f) => f.descricao === 'Pix')?.id ?? recebiveis[0]?.id ?? ''); }}>
                    Receber
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal aberto={!!conta} onFechar={() => setConta(null)} titulo={`Receber de ${conta?.cliente?.nome ?? ''}`}>
        <form onSubmit={(e) => { e.preventDefault(); receber.mutate(); }} className="grid gap-3">
          <Field label="Valor (R$)"><input className="input" inputMode="decimal" autoFocus value={valor} onChange={(e) => setValor(e.target.value)} /></Field>
          <Field label="Forma">
            <select className="input" value={forma} onChange={(e) => setForma(e.target.value)}>
              {recebiveis.map((f) => <option key={f.id} value={f.id}>{f.descricao}</option>)}
            </select>
          </Field>
          <button className="btn-primary" disabled={receber.isPending || num(valor) <= 0 || !forma}>{receber.isPending && <Spinner />} Confirmar recebimento</button>
        </form>
      </Modal>
    </>
  );
}

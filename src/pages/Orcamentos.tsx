import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Printer, MessageCircle, Trash2, ArrowLeft, Wrench, ShoppingCart } from 'lucide-react';
import { supabase, ok } from '../lib/supabase';
import { useEmpresa } from '../lib/empresa';
import { useServicosCat, useVeiculos } from '../lib/dados';
import { data, dinheiro, linkWhatsapp, num } from '../lib/format';
import { Field, Modal, PageHeader, Spinner, Vazio, msgErro, useAviso } from '../components/ui';
import { ClienteSelect, ProdutoBusca } from '../components/Selects';
import { ServicoForm } from './OS';
import { STATUS_ORC, type StatusOrc } from '../lib/types';

interface OrcResumo {
  id: string; numero: number; status: StatusOrc; data: string; validade: string | null; total_normal: number; total_troca: number;
  cliente: { nome: string } | null; veiculo: { placa: string } | null;
}

export function ListaOrcamentos() {
  const { empresa } = useEmpresa();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<'' | StatusOrc>('');

  const q = useQuery({
    queryKey: ['orcamentos', empresa.id, status],
    queryFn: async () => {
      let s = supabase.from('orcamentos').select('id, numero, status, data, validade, total_normal, total_troca, cliente:clientes(nome), veiculo:veiculos(placa)')
        .eq('empresa_id', empresa.id).order('numero', { ascending: false }).limit(200);
      if (status) s = s.eq('status', status);
      return ok(await s) as unknown as OrcResumo[];
    },
  });

  return (
    <>
      <PageHeader titulo="Orçamentos" acoes={<button className="btn-primary" onClick={() => setParams({ novo: '1' })}><Plus size={18} /> Novo orçamento</button>} />
      <div className="mb-4">
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="">Todos</option>
          {Object.entries(STATUS_ORC).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
        </select>
      </div>
      <div className="cartao">
        {q.isLoading ? <div className="flex justify-center p-10"><Spinner /></div> : !q.data?.length ? <Vazio texto="Nenhum orçamento." /> : (
          <ul className="divide-y divide-linha">
            {q.data.map((o) => (
              <li key={o.id}>
                <Link to={`/orcamentos/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-nevoa">
                  <span className="text-sm"><b className="numero">#{o.numero}</b> · {o.cliente?.nome ?? 'Sem cliente'}{o.veiculo && ` · ${o.veiculo.placa}`} · <span className="numero">{data(o.data)}</span></span>
                  <span className="flex items-center gap-3 text-sm">
                    <span className={`badge ${STATUS_ORC[o.status].cor}`}>{STATUS_ORC[o.status].nome}</span>
                    <b className="numero">{dinheiro(o.total_normal)}</b>
                    {Number(o.total_troca) !== Number(o.total_normal) && <span className="text-tinta-suave">c/ troca <span className="numero">{dinheiro(o.total_troca)}</span></span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <NovoOrcamento aberto={params.get('novo') === '1'} onFechar={() => setParams({})} />
    </>
  );
}

function NovoOrcamento({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { empresa } = useEmpresa();
  const nav = useNavigate();
  const avisar = useAviso();
  const [cliente, setCliente] = useState<string | null>(null);
  const [veiculo, setVeiculo] = useState('');
  const [validade, setValidade] = useState('7');
  const { data: motos = [] } = useVeiculos(cliente);

  const criar = useMutation({
    mutationFn: async () => {
      const v = new Date(); v.setDate(v.getDate() + Number(validade || 7));
      return ok(await supabase.from('orcamentos').insert({
        empresa_id: empresa.id, cliente_id: cliente, veiculo_id: veiculo || null, validade: v.toISOString().slice(0, 10),
      }).select('id').single()) as { id: string };
    },
    onSuccess: (o) => { onFechar(); setCliente(null); setVeiculo(''); nav(`/orcamentos/${o.id}`); },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Novo orçamento">
      <form onSubmit={(e) => { e.preventDefault(); criar.mutate(); }} className="grid gap-3">
        <Field label="Cliente"><ClienteSelect value={cliente} onChange={(id) => { setCliente(id); setVeiculo(''); }} placeholder="Sem cliente (balcão)" /></Field>
        <Field label="Moto">
          <select className="input" value={veiculo} disabled={!cliente} onChange={(e) => setVeiculo(e.target.value)}>
            <option value="">—</option>
            {motos.map((m) => <option key={m.id} value={m.id}>{m.placa} {m.modelo ?? ''}</option>)}
          </select>
        </Field>
        <Field label="Validade (dias)"><input className="input" inputMode="numeric" value={validade} onChange={(e) => setValidade(e.target.value)} /></Field>
        <button className="btn-primary" disabled={criar.isPending}>{criar.isPending && <Spinner />} Criar e adicionar itens</button>
      </form>
    </Modal>
  );
}

interface Orc {
  id: string; numero: number; status: StatusOrc; data: string; validade: string | null; cliente_id: string | null; observacao: string | null;
  total_normal: number; total_troca: number; convertido_em: 'venda' | 'os' | null; convertido_id: string | null;
  cliente: { nome: string; whatsapp: string | null } | null; veiculo: { placa: string; modelo: string | null } | null;
}
interface ItemOrc { id: string; tipo: 'peca' | 'servico'; descricao: string; quantidade: number; preco_normal: number; preco_troca: number | null; subtotal_normal: number; subtotal_troca: number }

export function DetalheOrcamento() {
  const { id } = useParams();
  const { empresa } = useEmpresa();
  const qc = useQueryClient();
  const avisar = useAviso();
  const nav = useNavigate();
  const { data: servicos = [] } = useServicosCat();
  const [addServico, setAddServico] = useState(false);
  const [converter, setConverter] = useState(false);

  const orc = useQuery({
    queryKey: ['orcamentos', 'detalhe', id],
    queryFn: async () => ok(await supabase.from('orcamentos').select('*, cliente:clientes(nome, whatsapp), veiculo:veiculos(placa, modelo)').eq('id', id!).single()) as unknown as Orc,
  });
  const itens = useQuery({
    queryKey: ['orcamentos', 'itens', id],
    queryFn: async () => ok(await supabase.from('orcamento_itens').select('*').eq('orcamento_id', id!).order('tipo')) as ItemOrc[],
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: ['orcamentos'] });
  const err = (e: unknown) => avisar(msgErro(e), 'erro');

  const addItem = useMutation({ mutationFn: async (i: Record<string, unknown>) => ok(await supabase.from('orcamento_itens').insert({ orcamento_id: id, ...i })), onSuccess: recarregar, onError: err });
  const alterar = useMutation({ mutationFn: async ({ itemId, d }: { itemId: string; d: Record<string, unknown> }) => ok(await supabase.from('orcamento_itens').update(d).eq('id', itemId)), onSuccess: recarregar, onError: err });
  const remover = useMutation({ mutationFn: async (itemId: string) => ok(await supabase.from('orcamento_itens').delete().eq('id', itemId)), onSuccess: recarregar, onError: err });
  const status = useMutation({ mutationFn: async (s: StatusOrc) => ok(await supabase.from('orcamentos').update({ status: s }).eq('id', id!)), onSuccess: recarregar, onError: err });
  const salvarObs = useMutation({ mutationFn: async (t: string) => ok(await supabase.from('orcamentos').update({ observacao: t }).eq('id', id!)), onSuccess: recarregar, onError: err });

  const converte = useMutation({
    mutationFn: async ({ destino, tipo }: { destino: 'os' | 'venda'; tipo: 'normal' | 'troca' }) =>
      ({ destino, novo: ok(await supabase.rpc('converter_orcamento', { p_orcamento: id, p_destino: destino, p_tipo_venda: tipo })) as string }),
    onSuccess: ({ destino, novo }) => {
      ['orcamentos', 'os', 'vendas'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      if (destino === 'os') nav(`/os/${novo}`);
      else { avisar('Venda criada. Finalize o pagamento em Vendas pendentes.'); nav(`/pdv/orcamento/${novo}`); }
    },
    onError: err,
  });

  if (orc.isLoading) return <div className="flex justify-center p-10"><Spinner /></div>;
  if (!orc.data) return <Vazio texto="Orçamento não encontrado." />;
  const o = orc.data;
  const editavel = o.status === 'aberto' || o.status === 'aprovado';
  const lista = itens.data ?? [];
  const temTroca = Number(o.total_troca) !== Number(o.total_normal);

  const textoWhats = [
    `Olá${o.cliente ? ', ' + o.cliente.nome.split(' ')[0] : ''}! Segue o orçamento #${o.numero} da ${empresa.nome}${o.veiculo ? ` para a ${o.veiculo.modelo ?? 'moto'} ${o.veiculo.placa}` : ''}:`,
    ...lista.map((i) => `• ${Number(i.quantidade) !== 1 ? `${i.quantidade}x ` : ''}${i.descricao}: ${dinheiro(i.subtotal_normal)}`),
    `Total: ${dinheiro(o.total_normal)}${temTroca ? ` (com troca da peça usada: ${dinheiro(o.total_troca)})` : ''}`,
    o.validade ? `Válido até ${data(o.validade)}.` : '',
  ].filter(Boolean).join('\n');

  return (
    <>
      <button className="mb-3 flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta" onClick={() => nav('/orcamentos')}><ArrowLeft size={18} /> Orçamentos</button>
      <PageHeader
        titulo={`Orçamento #${o.numero}`}
        sub={`${o.cliente?.nome ?? 'Sem cliente'}${o.veiculo ? ` · ${o.veiculo.placa} ${o.veiculo.modelo ?? ''}` : ''} · ${data(o.data)}${o.validade ? ` · válido até ${data(o.validade)}` : ''}`}
        acoes={
          <>
            <Link className="btn-ghost" to={`/imprimir/orcamento/${o.id}`} target="_blank"><Printer size={18} /> Imprimir</Link>
            {o.cliente?.whatsapp && <a className="btn-wa" target="_blank" rel="noreferrer" href={linkWhatsapp(o.cliente.whatsapp, textoWhats)}><MessageCircle size={18} /> Enviar</a>}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className={`badge px-3 py-1.5 text-sm ${STATUS_ORC[o.status].cor}`}>{STATUS_ORC[o.status].nome}</span>
        {o.status === 'convertido' && o.convertido_id && (
          <Link className="text-sm text-azul-escuro hover:underline" to={o.convertido_em === 'os' ? `/os/${o.convertido_id}` : '/vendas'}>
            Ver {o.convertido_em === 'os' ? 'OS' : 'venda'}
          </Link>
        )}
        {o.status === 'aberto' && (
          <>
            <button className="btn-ghost" onClick={() => status.mutate('aprovado')}>Cliente aprovou</button>
            <button className="btn-ghost" onClick={() => status.mutate('recusado')}>Cliente recusou</button>
          </>
        )}
        {editavel && lista.length > 0 && <button className="btn-primary" onClick={() => setConverter(true)}>Converter em OS ou venda</button>}
      </div>

      <section className="cartao">
        <div className="flex items-center justify-between border-b border-linha px-4 py-3">
          <h2 className="text-lg font-bold">Itens</h2>
          {editavel && <button className="btn-ghost" onClick={() => setAddServico(true)}><Plus size={18} /> Mão de obra</button>}
        </div>
        {editavel && (
          <div className="p-3">
            <ProdutoBusca mostrarSemSaldo onEscolher={(p) => addItem.mutate({ tipo: 'peca', produto_id: p.produto_id, descricao: p.nome, quantidade: 1, preco_normal: p.preco_venda, preco_troca: p.preco_troca })} />
          </div>
        )}
        {!lista.length ? <p className="px-4 py-6 text-sm text-tinta-suave">Adicione peças e serviços.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead className="border-y border-linha bg-nevoa">
                <tr><th className="th">Item</th><th className="th text-center">Qtd</th><th className="th text-right">Preço</th><th className="th text-right">C/ troca</th><th className="th text-right">Subtotal</th><th className="th"></th></tr>
              </thead>
              <tbody className="divide-y divide-linha">
                {lista.map((i) => (
                  <tr key={i.id}>
                    <td className="td">{i.tipo === 'servico' && <Wrench size={13} className="mr-1 inline text-tinta-suave" />}{i.descricao}</td>
                    <td className="td"><input className="input mx-auto w-16 text-center" disabled={!editavel} defaultValue={String(i.quantidade).replace('.', ',')}
                      onBlur={(e) => num(e.target.value) > 0 && num(e.target.value) !== Number(i.quantidade) && alterar.mutate({ itemId: i.id, d: { quantidade: num(e.target.value) } })} /></td>
                    <td className="td"><input className="input ml-auto w-24 text-right" disabled={!editavel} defaultValue={String(i.preco_normal).replace('.', ',')}
                      onBlur={(e) => num(e.target.value) !== Number(i.preco_normal) && alterar.mutate({ itemId: i.id, d: { preco_normal: num(e.target.value) } })} /></td>
                    <td className="td"><input className="input ml-auto w-24 text-right" disabled={!editavel || i.tipo === 'servico'} defaultValue={i.preco_troca === null ? '' : String(i.preco_troca).replace('.', ',')}
                      onBlur={(e) => alterar.mutate({ itemId: i.id, d: { preco_troca: e.target.value ? num(e.target.value) : null } })} /></td>
                    <td className="td numero text-right font-semibold">{dinheiro(i.subtotal_normal)}</td>
                    <td className="td">{editavel && <button className="icone-acao" onClick={() => remover.mutate(i.id)} aria-label="Remover"><Trash2 size={18} /></button>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-linha">
                <tr><td className="td font-semibold" colSpan={4}>Total</td><td className="td numero text-right text-lg font-bold">{dinheiro(o.total_normal)}</td><td /></tr>
                {temTroca && <tr><td className="td text-tinta-suave" colSpan={4}>Total com troca da peça usada</td><td className="td numero text-right font-semibold">{dinheiro(o.total_troca)}</td><td /></tr>}
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="cartao mt-4 p-4">
        <Field label="Observações (saem na impressão)">
          <textarea className="input" rows={2} disabled={!editavel} defaultValue={o.observacao ?? ''} onBlur={(e) => e.target.value !== (o.observacao ?? '') && salvarObs.mutate(e.target.value)} />
        </Field>
      </section>

      <Modal aberto={addServico} onFechar={() => setAddServico(false)} titulo="Adicionar mão de obra">
        <ServicoForm servicos={servicos} semMecanico onAdicionar={(i) => {
          addItem.mutate({ tipo: 'servico', servico_id: i.servico_id, descricao: i.descricao, quantidade: i.quantidade, preco_normal: i.preco_unitario, preco_troca: null });
          setAddServico(false);
        }} />
      </Modal>

      <Modal aberto={converter} onFechar={() => setConverter(false)} titulo="Converter orçamento">
        <div className="grid gap-3">
          <button className="btn-dark justify-start py-3" disabled={converte.isPending} onClick={() => converte.mutate({ destino: 'os', tipo: 'normal' })}>
            <Wrench size={18} /> Abrir ordem de serviço (peças + mão de obra)
          </button>
          {temTroca && (
            <button className="btn-ghost justify-start py-3" disabled={converte.isPending} onClick={() => converte.mutate({ destino: 'os', tipo: 'troca' })}>
              <Wrench size={18} /> Abrir OS com preço de troca
            </button>
          )}
          <button className="btn-primary justify-start py-3" disabled={converte.isPending} onClick={() => converte.mutate({ destino: 'venda', tipo: 'normal' })}>
            <ShoppingCart size={18} /> Venda de balcão (só as peças)
          </button>
          {temTroca && (
            <button className="btn-ghost justify-start py-3" disabled={converte.isPending} onClick={() => converte.mutate({ destino: 'venda', tipo: 'troca' })}>
              <ShoppingCart size={18} /> Venda com troca (só as peças)
            </button>
          )}
          {converte.isPending && <Spinner className="mx-auto" />}
        </div>
      </Modal>
    </>
  );
}

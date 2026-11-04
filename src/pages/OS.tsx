import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Printer, MessageCircle, Trash2, ArrowLeft, Ban, Wrench, Package, CheckCircle2 } from 'lucide-react';
import { supabase, ok } from '../lib/supabase';
import { useEmpresa } from '../lib/empresa';
import { CHAVES_MOVIMENTO, useMecanicos, useServicosCat, useVeiculos, useClientes } from '../lib/dados';
import { data, dataHora, dinheiro, hoje, linkWhatsapp, num, numero } from '../lib/format';
import { Field, Modal, PageHeader, Spinner, Vazio, msgErro, useAviso } from '../components/ui';
import { ClienteSelect, ProdutoBusca } from '../components/Selects';
import { PagamentoModal } from '../components/Pagamento';
import { ClienteForm, VeiculoForm } from './Clientes';
import { STATUS_OS, type Pagamento, type StatusOS, type Veiculo } from '../lib/types';

interface OSResumo {
  id: string; numero: number; status: StatusOS; total: number; previsao: string | null; data_entrada: string; pago: boolean;
  defeito_relatado: string | null;
  cliente: { nome: string } | null; veiculo: { placa: string; modelo: string | null } | null; mecanico: { nome: string } | null;
}

const ATIVAS: StatusOS[] = ['aberta', 'em_execucao', 'aguardando_peca', 'pronta'];

export function ListaOS() {
  const { empresa } = useEmpresa();
  const [params, setParams] = useSearchParams();
  const [ver, setVer] = useState<'quadro' | 'encerradas'>('quadro');

  const q = useQuery({
    queryKey: ['os', empresa.id, 'lista', ver],
    queryFn: async () => {
      let s = supabase.from('ordens_servico')
        .select('id, numero, status, total, previsao, data_entrada, pago, defeito_relatado, cliente:clientes(nome), veiculo:veiculos(placa, modelo), mecanico:mecanicos(nome)')
        .eq('empresa_id', empresa.id);
      s = ver === 'quadro' ? s.in('status', ATIVAS).order('numero') : s.in('status', ['entregue', 'cancelada']).order('numero', { ascending: false }).limit(100);
      return ok(await s) as unknown as OSResumo[];
    },
  });

  const lista = q.data ?? [];

  return (
    <>
      <PageHeader
        titulo="Ordens de serviço"
        acoes={
          <>
            <div className="segmentado">
              <button className={`segmento ${ver === 'quadro' ? 'segmento-ativo' : ''}`} onClick={() => setVer('quadro')}>Na oficina</button>
              <button className={`segmento ${ver === 'encerradas' ? 'segmento-ativo' : ''}`} onClick={() => setVer('encerradas')}>Encerradas</button>
            </div>
            <button className="btn-primary" onClick={() => setParams({ nova: '1' })}><Plus size={18} /> Nova OS</button>
          </>
        }
      />

      {q.isLoading ? <div className="flex justify-center p-10"><Spinner /></div> : ver === 'quadro' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ATIVAS.map((st) => (
            <section key={st} className="rounded-3xl bg-linha p-3">
              <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">
                {STATUS_OS[st].nome}<span className="badge numero bg-papel text-tinta-suave">{lista.filter((o) => o.status === st).length}</span>
              </h2>
              <div className="space-y-2">
                {lista.filter((o) => o.status === st).map((o) => <CartaoOS key={o.id} o={o} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="cartao">
          {!lista.length ? <Vazio texto="Nenhuma OS encerrada." /> : (
            <ul className="divide-y divide-linha">
              {lista.map((o) => (
                <li key={o.id}>
                  <Link to={`/os/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-nevoa">
                    <span className="text-sm">
                      <b className="numero">#{o.numero}</b> · {o.cliente?.nome ?? 'Sem cliente'} · {o.veiculo?.placa ?? ''} · <span className="numero">{data(o.data_entrada)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`badge ${STATUS_OS[o.status].cor}`}>{STATUS_OS[o.status].nome}</span>
                      <b className="numero text-sm">{dinheiro(o.total)}</b>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <NovaOS aberto={params.get('nova') === '1'} clienteInicial={params.get('cliente')} onFechar={() => setParams({})} />
    </>
  );
}

function CartaoOS({ o }: { o: OSResumo }) {
  const atrasada = o.previsao && o.previsao < hoje();
  const paraHoje = o.previsao === hoje();
  return (
    <Link to={`/os/${o.id}`} className="block rounded-2xl bg-papel p-3 shadow-sm ring-1 ring-linha hover:ring-azul">
      <div className="flex justify-between text-sm text-tinta-suave">
        <span className="numero font-semibold text-tinta">#{o.numero}</span>
        {o.previsao && <span className={atrasada ? 'font-semibold text-vermelho' : paraHoje ? 'font-semibold text-ambar' : ''}>prev. <span className="numero">{data(o.previsao)}</span></span>}
      </div>
      <p className="mt-1 font-medium">{o.veiculo ? `${o.veiculo.placa} · ${o.veiculo.modelo ?? ''}` : 'Sem moto'}</p>
      <p className="text-sm text-tinta-suave">{o.cliente?.nome ?? 'Sem cliente'}</p>
      {o.defeito_relatado && <p className="mt-1 line-clamp-2 text-sm text-tinta-suave">{o.defeito_relatado}</p>}
      <div className="mt-2 flex justify-between text-sm">
        <span className="text-tinta-suave">{o.mecanico?.nome ?? ''}</span>
        <b className="numero">{dinheiro(o.total)}</b>
      </div>
    </Link>
  );
}

function NovaOS({ aberto, onFechar, clienteInicial }: { aberto: boolean; onFechar: () => void; clienteInicial: string | null }) {
  const { empresa } = useEmpresa();
  const nav = useNavigate();
  const avisar = useAviso();
  const qc = useQueryClient();
  const { data: mecanicos = [] } = useMecanicos();
  const [f, setF] = useState({ cliente_id: null as string | null, veiculo_id: '', km: '', defeito: '', mecanico_id: '', previsao: '' });
  const [novoCliente, setNovoCliente] = useState<object | null>(null);
  const [novaMoto, setNovaMoto] = useState<Partial<Veiculo> | null>(null);
  const { data: motos = [] } = useVeiculos(f.cliente_id);

  useEffect(() => { if (aberto) setF((v) => ({ ...v, cliente_id: clienteInicial, veiculo_id: '' })); }, [aberto, clienteInicial]);
  useEffect(() => { if (motos.length === 1 && !f.veiculo_id) setF((v) => ({ ...v, veiculo_id: motos[0].id })); }, [motos, f.veiculo_id]);

  const criar = useMutation({
    mutationFn: async () => {
      const os = ok(await supabase.from('ordens_servico').insert({
        empresa_id: empresa.id, cliente_id: f.cliente_id, veiculo_id: f.veiculo_id || null, km_entrada: f.km ? Number(f.km) : null,
        defeito_relatado: f.defeito || null, mecanico_id: f.mecanico_id || null, previsao: f.previsao || null,
      }).select('id').single()) as { id: string };
      if (f.veiculo_id && f.km) await supabase.from('veiculos').update({ km_atual: Number(f.km) }).eq('id', f.veiculo_id);
      return os;
    },
    onSuccess: (os) => {
      qc.invalidateQueries({ queryKey: ['os'] });
      setF({ cliente_id: null, veiculo_id: '', km: '', defeito: '', mecanico_id: '', previsao: '' });
      onFechar(); nav(`/os/${os.id}`);
    },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Nova ordem de serviço">
      <form onSubmit={(e) => { e.preventDefault(); criar.mutate(); }} className="grid grid-cols-2 gap-3">
        <Field label="Cliente" className="col-span-2">
          <div className="flex gap-2">
            <div className="flex-1"><ClienteSelect value={f.cliente_id} onChange={(id) => setF({ ...f, cliente_id: id, veiculo_id: '' })} placeholder="Escolha o cliente" /></div>
            <button type="button" className="btn-ghost px-3" onClick={() => setNovoCliente({})} title="Novo cliente"><Plus size={18} /></button>
          </div>
        </Field>
        <Field label="Moto" className="col-span-2">
          <div className="flex gap-2">
            <select className="input" value={f.veiculo_id} onChange={(e) => setF({ ...f, veiculo_id: e.target.value })} disabled={!f.cliente_id}>
              <option value="">{f.cliente_id ? 'Escolha a moto' : 'Escolha o cliente primeiro'}</option>
              {motos.map((m) => <option key={m.id} value={m.id}>{m.placa} {m.modelo ?? ''}</option>)}
            </select>
            <button type="button" className="btn-ghost px-3" disabled={!f.cliente_id} onClick={() => setNovaMoto({ cliente_id: f.cliente_id })} title="Nova moto"><Plus size={18} /></button>
          </div>
        </Field>
        <Field label="Km de entrada"><input className="input" inputMode="numeric" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} /></Field>
        <Field label="Previsão de entrega"><input className="input" type="date" value={f.previsao} onChange={(e) => setF({ ...f, previsao: e.target.value })} /></Field>
        <Field label="Mecânico" className="col-span-2">
          <select className="input" value={f.mecanico_id} onChange={(e) => setF({ ...f, mecanico_id: e.target.value })}>
            <option value="">—</option>
            {mecanicos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </Field>
        <Field label="Defeito relatado pelo cliente" className="col-span-2">
          <textarea className="input" rows={3} value={f.defeito} onChange={(e) => setF({ ...f, defeito: e.target.value })} placeholder="Barulho no motor, revisão dos 10 mil km…" />
        </Field>
        <button className="btn-primary col-span-2" disabled={criar.isPending}>{criar.isPending && <Spinner />} Abrir OS</button>
      </form>
      <ClienteForm cliente={novoCliente} onFechar={() => setNovoCliente(null)} onSalvo={(c) => setF((v) => ({ ...v, cliente_id: c.id, veiculo_id: '' }))} />
      <VeiculoForm veiculo={novaMoto} onFechar={() => setNovaMoto(null)} onSalvo={(m) => setF((v) => ({ ...v, veiculo_id: m.id }))} />
    </Modal>
  );
}

interface OSCompleta {
  id: string; numero: number; status: StatusOS; cliente_id: string | null; veiculo_id: string | null; mecanico_id: string | null;
  km_entrada: number | null; defeito_relatado: string | null; diagnostico: string | null; observacao: string | null;
  data_entrada: string; previsao: string | null; data_entrega: string | null; subtotal: number; desconto: number; total: number; pago: boolean;
  cliente: { nome: string; whatsapp: string | null } | null; veiculo: { placa: string; modelo: string | null; marca: string | null } | null;
}
interface ItemOS { id: string; tipo: 'peca' | 'servico'; descricao: string; quantidade: number; preco_unitario: number; subtotal: number; mecanico_id: string | null }

export function DetalheOS() {
  const { id } = useParams();
  const { empresa, papel } = useEmpresa();
  const qc = useQueryClient();
  const avisar = useAviso();
  const nav = useNavigate();
  const { data: mecanicos = [] } = useMecanicos();
  const { data: servicos = [] } = useServicosCat();
  const { data: clientes = [] } = useClientes();
  const [addServico, setAddServico] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [textos, setTextos] = useState({ diagnostico: '', observacao: '', desconto: '' });

  const os = useQuery({
    queryKey: ['os', 'detalhe', id],
    queryFn: async () =>
      ok(await supabase.from('ordens_servico').select('*, cliente:clientes(nome, whatsapp), veiculo:veiculos(placa, modelo, marca)').eq('id', id!).single()) as unknown as OSCompleta,
  });
  const itens = useQuery({
    queryKey: ['os', 'itens', id],
    queryFn: async () => ok(await supabase.from('os_itens').select('*').eq('os_id', id!).order('tipo').order('descricao')) as ItemOS[],
  });

  useEffect(() => {
    if (os.data) setTextos({ diagnostico: os.data.diagnostico ?? '', observacao: os.data.observacao ?? '', desconto: Number(os.data.desconto) ? String(os.data.desconto).replace('.', ',') : '' });
  }, [os.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const recarregar = () => { qc.invalidateQueries({ queryKey: ['os'] }); };

  const atualizar = useMutation({
    mutationFn: async (dados: Record<string, unknown>) => ok(await supabase.from('ordens_servico').update(dados).eq('id', id!)),
    onSuccess: recarregar,
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  const addItem = useMutation({
    mutationFn: async (item: Record<string, unknown>) => ok(await supabase.from('os_itens').insert({ os_id: id, ...item })),
    onSuccess: recarregar,
    onError: (e) => avisar(msgErro(e), 'erro'),
  });
  const alterarItem = useMutation({
    mutationFn: async ({ itemId, dados }: { itemId: string; dados: Record<string, unknown> }) => ok(await supabase.from('os_itens').update(dados).eq('id', itemId)),
    onSuccess: recarregar,
    onError: (e) => avisar(msgErro(e), 'erro'),
  });
  const removerItem = useMutation({
    mutationFn: async (itemId: string) => ok(await supabase.from('os_itens').delete().eq('id', itemId)),
    onSuccess: recarregar,
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  const finalizar = useMutation({
    mutationFn: async (p: Pagamento[]) => ok(await supabase.rpc('finalizar_os', { p_os: id, p_pagamentos: p })),
    onSuccess: () => { CHAVES_MOVIMENTO.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); setPagando(false); avisar('OS entregue e peças baixadas do estoque'); },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });
  const cancela = useMutation({
    mutationFn: async () => ok(await supabase.rpc('cancelar_documento', { p_origem: 'os', p_id: id, p_motivo: 'Cancelada' })),
    onSuccess: () => { CHAVES_MOVIMENTO.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); setCancelar(false); avisar('OS cancelada'); },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  if (os.isLoading) return <div className="flex justify-center p-10"><Spinner /></div>;
  if (!os.data) return <Vazio texto="OS não encontrada." />;
  const o = os.data;
  const encerrada = o.status === 'entregue' || o.status === 'cancelada';
  const lista = itens.data ?? [];
  const pecas = lista.filter((i) => i.tipo === 'peca');
  const maoObra = lista.filter((i) => i.tipo === 'servico');
  const whats = o.cliente?.whatsapp ?? clientes.find((c) => c.id === o.cliente_id)?.whatsapp;
  const primeiroNome = o.cliente?.nome.split(' ')[0] ?? '';
  const moto = o.veiculo ? `${o.veiculo.modelo ?? 'sua moto'} (${o.veiculo.placa})` : 'sua moto';

  return (
    <>
      <button className="no-print mb-3 flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta" onClick={() => nav('/os')}><ArrowLeft size={18} /> Ordens de serviço</button>
      <PageHeader
        titulo={`OS #${o.numero}`}
        sub={`${o.cliente?.nome ?? 'Sem cliente'} · ${o.veiculo ? `${o.veiculo.placa} ${o.veiculo.modelo ?? ''}` : 'sem moto'} · entrada ${dataHora(o.data_entrada)}`}
        acoes={
          <>
            <Link className="btn-ghost" to={`/imprimir/os/${o.id}`} target="_blank"><Printer size={18} /> Imprimir</Link>
            {whats && (
              <a className="btn-wa" target="_blank" rel="noreferrer"
                href={linkWhatsapp(whats, o.status === 'pronta'
                  ? `Olá, ${primeiroNome}! ${moto} está pronta para retirada na ${empresa.nome}. Total: ${dinheiro(o.total)}.`
                  : `Olá, ${primeiroNome}! Aqui é da ${empresa.nome}, sobre a OS #${o.numero} da ${moto}.`)}>
                <MessageCircle size={18} /> {o.status === 'pronta' ? 'Avisar que está pronta' : 'WhatsApp'}
              </a>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {!encerrada && (
            <div className="flex flex-wrap gap-2">
              {(['aberta', 'em_execucao', 'aguardando_peca', 'pronta'] as StatusOS[]).map((st) => (
                <button
                  key={st}
                  className={`pilula ${o.status === st ? STATUS_OS[st].cor + ' ring-2 ring-offset-1 ring-current' : 'bg-papel text-tinta-suave ring-1 ring-linha'}`}
                  onClick={() => atualizar.mutate({ status: st })}
                >
                  {STATUS_OS[st].nome}
                </button>
              ))}
            </div>
          )}
          {encerrada && <span className={`badge px-3 py-1.5 text-sm ${STATUS_OS[o.status].cor}`}>{STATUS_OS[o.status].nome}{o.data_entrega && ` em ${dataHora(o.data_entrega)}`}{o.status === 'entregue' && !o.pago && ' · com valor a receber'}</span>}

          <section className="cartao">
            <h2 className="flex items-center gap-2 border-b border-linha px-4 py-3 text-lg font-bold"><Package size={18} /> Peças</h2>
            {!encerrada && <div className="p-3"><ProdutoBusca onEscolher={(p) => addItem.mutate({ tipo: 'peca', produto_id: p.produto_id, descricao: p.nome, quantidade: 1, preco_unitario: p.preco_venda })} /></div>}
            <TabelaItens itens={pecas} encerrada={encerrada} mecanicos={mecanicos}
              onAlterar={(itemId, dados) => alterarItem.mutate({ itemId, dados })} onRemover={(i) => removerItem.mutate(i)} />
          </section>

          <section className="cartao">
            <div className="flex items-center justify-between border-b border-linha px-4 py-3">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Wrench size={18} /> Mão de obra</h2>
              {!encerrada && <button className="btn-ghost" onClick={() => setAddServico(true)}><Plus size={18} /> Serviço</button>}
            </div>
            <TabelaItens itens={maoObra} encerrada={encerrada} mecanicos={mecanicos} comMecanico
              onAlterar={(itemId, dados) => alterarItem.mutate({ itemId, dados })} onRemover={(i) => removerItem.mutate(i)} />
          </section>

          <section className="cartao grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Defeito relatado" className="sm:col-span-2"><p className="text-sm">{o.defeito_relatado || '—'}</p></Field>
            <Field label="Diagnóstico / serviço executado">
              <textarea className="input" rows={3} disabled={encerrada} value={textos.diagnostico}
                onChange={(e) => setTextos({ ...textos, diagnostico: e.target.value })}
                onBlur={() => textos.diagnostico !== (o.diagnostico ?? '') && atualizar.mutate({ diagnostico: textos.diagnostico })} />
            </Field>
            <Field label="Observações (saem na impressão)">
              <textarea className="input" rows={3} disabled={encerrada} value={textos.observacao}
                onChange={(e) => setTextos({ ...textos, observacao: e.target.value })}
                onBlur={() => textos.observacao !== (o.observacao ?? '') && atualizar.mutate({ observacao: textos.observacao })} />
            </Field>
          </section>
        </div>

        <aside className="cartao h-fit space-y-3 p-4 lg:sticky lg:top-6">
          <Field label="Mecânico responsável">
            <select className="input" disabled={encerrada} value={o.mecanico_id ?? ''} onChange={(e) => atualizar.mutate({ mecanico_id: e.target.value || null })}>
              <option value="">—</option>
              {mecanicos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </Field>
          <Field label="Previsão de entrega">
            <input type="date" className="input" disabled={encerrada} value={o.previsao ?? ''} onChange={(e) => atualizar.mutate({ previsao: e.target.value || null })} />
          </Field>
          <p className="text-sm text-tinta-suave">Km de entrada: {o.km_entrada ? numero(o.km_entrada) : '—'}</p>
          <Field label="Desconto (R$)">
            <input className="input" inputMode="decimal" disabled={encerrada} value={textos.desconto}
              onChange={(e) => setTextos({ ...textos, desconto: e.target.value })}
              onBlur={() => num(textos.desconto) !== Number(o.desconto) && atualizar.mutate({ desconto: num(textos.desconto) })} />
          </Field>
          <dl className="space-y-1 border-t border-linha pt-3 text-sm">
            <div className="flex justify-between"><dt>Peças</dt><dd className="numero">{dinheiro(pecas.reduce((a, i) => a + Number(i.subtotal), 0))}</dd></div>
            <div className="flex justify-between"><dt>Mão de obra</dt><dd className="numero">{dinheiro(maoObra.reduce((a, i) => a + Number(i.subtotal), 0))}</dd></div>
            {Number(o.desconto) > 0 && <div className="flex justify-between text-vermelho"><dt>Desconto</dt><dd className="numero">-{dinheiro(o.desconto)}</dd></div>}
            <div className="flex justify-between pt-1 text-xl font-bold"><dt>Total</dt><dd className="numero">{dinheiro(o.total)}</dd></div>
          </dl>
          {!encerrada && (
            <>
              <button className="btn-primary w-full py-3" disabled={!lista.length} onClick={() => setPagando(true)}>
                <CheckCircle2 size={18} /> Entregar e receber
              </button>
              {papel !== 'mecanico' && <button className="btn-danger w-full" onClick={() => setCancelar(true)}><Ban size={18} /> Cancelar OS</button>}
            </>
          )}
          {o.status === 'entregue' && papel !== 'mecanico' && (
            <button className="w-full text-sm text-vermelho hover:underline" onClick={() => setCancelar(true)}>Cancelar (estorna estoque e pagamentos)</button>
          )}
        </aside>
      </div>

      <Modal aberto={addServico} onFechar={() => setAddServico(false)} titulo="Adicionar mão de obra">
        <ServicoForm servicos={servicos} mecanicoPadrao={o.mecanico_id}
          onAdicionar={(item) => { addItem.mutate({ tipo: 'servico', ...item }); setAddServico(false); }} />
      </Modal>

      <PagamentoModal aberto={pagando} onFechar={() => setPagando(false)} total={Number(o.total)} temCliente={!!o.cliente_id}
        salvando={finalizar.isPending} onConfirmar={(p) => finalizar.mutate(p)} />

      <Modal aberto={cancelar} onFechar={() => setCancelar(false)} titulo={`Cancelar OS #${o.numero}`}>
        <p className="text-sm text-tinta-suave">As peças que já saíram do estoque voltam e os pagamentos são estornados.</p>
        <button className="btn-danger mt-4 w-full" disabled={cancela.isPending} onClick={() => cancela.mutate()}>{cancela.isPending && <Spinner />} Confirmar cancelamento</button>
      </Modal>
    </>
  );
}

function TabelaItens({
  itens, encerrada, mecanicos, comMecanico, onAlterar, onRemover,
}: {
  itens: ItemOS[]; encerrada: boolean; mecanicos: { id: string; nome: string }[]; comMecanico?: boolean;
  onAlterar: (id: string, dados: Record<string, unknown>) => void; onRemover: (id: string) => void;
}) {
  if (!itens.length) return <p className="px-4 py-4 text-sm text-tinta-suave">Nenhum item.</p>;
  return (
    <ul className="divide-y divide-linha">
      {itens.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
          <span className="min-w-40 flex-1 text-sm font-medium">{i.descricao}</span>
          {comMecanico && (
            <select className="input w-36" disabled={encerrada} value={i.mecanico_id ?? ''} onChange={(e) => onAlterar(i.id, { mecanico_id: e.target.value || null })}>
              <option value="">mecânico</option>
              {mecanicos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          )}
          <input className="input w-16 text-center" disabled={encerrada} inputMode="decimal" defaultValue={String(i.quantidade).replace('.', ',')}
            onBlur={(e) => num(e.target.value) > 0 && num(e.target.value) !== Number(i.quantidade) && onAlterar(i.id, { quantidade: num(e.target.value) })} />
          <input className="input w-24 text-right" disabled={encerrada} inputMode="decimal" defaultValue={String(i.preco_unitario).replace('.', ',')}
            onBlur={(e) => num(e.target.value) !== Number(i.preco_unitario) && onAlterar(i.id, { preco_unitario: num(e.target.value) })} />
          <span className="numero w-24 text-right text-sm font-semibold">{dinheiro(i.subtotal)}</span>
          {!encerrada && <button className="icone-acao" onClick={() => onRemover(i.id)} aria-label="Remover"><Trash2 size={18} /></button>}
        </li>
      ))}
    </ul>
  );
}

export function ServicoForm({
  servicos, mecanicoPadrao, onAdicionar, semMecanico,
}: {
  servicos: { id: string; descricao: string; preco: number }[]; mecanicoPadrao?: string | null; semMecanico?: boolean;
  onAdicionar: (item: { servico_id: string | null; descricao: string; quantidade: number; preco_unitario: number; mecanico_id?: string | null }) => void;
}) {
  const { data: mecanicos = [] } = useMecanicos();
  const [servicoId, setServicoId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [preco, setPreco] = useState('');
  const [mec, setMec] = useState(mecanicoPadrao ?? '');

  return (
    <form className="grid gap-3" onSubmit={(e) => {
      e.preventDefault();
      onAdicionar({ servico_id: servicoId || null, descricao: descricao.trim(), quantidade: 1, preco_unitario: num(preco), ...(semMecanico ? {} : { mecanico_id: mec || null }) });
    }}>
      <Field label="Serviço da tabela">
        <select className="input" value={servicoId} onChange={(e) => {
          const s = servicos.find((x) => x.id === e.target.value);
          setServicoId(e.target.value);
          if (s) { setDescricao(s.descricao); setPreco(String(s.preco).replace('.', ',')); }
        }}>
          <option value="">Outro (digitar)</option>
          {servicos.map((s) => <option key={s.id} value={s.id}>{s.descricao} · {dinheiro(s.preco)}</option>)}
        </select>
      </Field>
      <Field label="Descrição *"><input className="input" required value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Field>
      <Field label="Valor (R$) *"><input className="input" required inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} /></Field>
      {!semMecanico && (
        <Field label="Mecânico">
          <select className="input" value={mec} onChange={(e) => setMec(e.target.value)}>
            <option value="">—</option>
            {mecanicos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </Field>
      )}
      <button className="btn-primary">Adicionar</button>
    </form>
  );
}

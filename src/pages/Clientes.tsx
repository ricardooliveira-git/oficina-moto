import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, MessageCircle, Pencil, Bike, Trash2 } from 'lucide-react';
import { supabase, ok } from '../lib/supabase';
import { useEmpresa } from '../lib/empresa';
import { useClientes, useVeiculos } from '../lib/dados';
import { dinheiro, data, linkWhatsapp, placa, soDigitos, telefone } from '../lib/format';
import { Busca, Field, Modal, PageHeader, Spinner, Vazio, msgErro, useAviso } from '../components/ui';
import type { Cliente, Veiculo } from '../lib/types';
import { STATUS_OS, type StatusOS } from '../lib/types';

export function Clientes() {
  const { data: clientes = [], isLoading } = useClientes();
  const { data: veiculos = [] } = useVeiculos();
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Partial<Cliente> | null>(null);
  const [aberto, setAberto] = useState<Cliente | null>(null);

  const lista = useMemo(() => {
    const t = busca.toLowerCase().trim();
    const d = soDigitos(busca);
    const tPlaca = placa(busca);
    return clientes.filter((c) => {
      if (!t) return true;
      if (c.nome.toLowerCase().includes(t)) return true;
      if (d.length >= 3 && (soDigitos(c.whatsapp).includes(d) || soDigitos(c.cpf).includes(d))) return true;
      return tPlaca.length >= 3 && veiculos.some((v) => v.cliente_id === c.id && v.placa.includes(tPlaca));
    });
  }, [clientes, veiculos, busca]);

  return (
    <>
      <PageHeader
        titulo="Clientes e motos"
        sub={`${clientes.length} cliente(s), ${veiculos.length} moto(s)`}
        acoes={<button className="btn-primary" onClick={() => setEditando({})}><Plus size={16} /> Novo cliente</button>}
      />
      <div className="mb-4"><Busca valor={busca} onChange={setBusca} placeholder="Nome, telefone, CPF ou placa" /></div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-10"><Spinner /></div>
        ) : !lista.length ? (
          <Vazio texto={busca ? 'Nenhum cliente encontrado.' : 'Cadastre o primeiro cliente.'} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {lista.map((c) => {
              const motos = veiculos.filter((v) => v.cliente_id === c.id);
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setAberto(c)}>
                    <p className="font-medium">{c.nome}</p>
                    <p className="truncate text-xs text-slate-500">
                      {telefone(c.whatsapp) || 'sem telefone'}
                      {motos.length > 0 && ` · ${motos.map((m) => `${m.placa}${m.modelo ? ' ' + m.modelo : ''}`).join(', ')}`}
                    </p>
                  </button>
                  {c.whatsapp && (
                    <a className="btn-wa px-3" href={linkWhatsapp(c.whatsapp)} target="_blank" rel="noreferrer" aria-label="WhatsApp">
                      <MessageCircle size={16} />
                    </a>
                  )}
                  <button className="btn-ghost px-3" onClick={() => setEditando(c)} aria-label="Editar"><Pencil size={16} /></button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ClienteForm cliente={editando} onFechar={() => setEditando(null)} />
      {aberto && <ClienteDetalhe cliente={aberto} onFechar={() => setAberto(null)} onEditar={() => { setEditando(aberto); setAberto(null); }} />}
    </>
  );
}

export function ClienteForm({ cliente, onFechar, onSalvo }: { cliente: Partial<Cliente> | null; onFechar: () => void; onSalvo?: (c: Cliente) => void }) {
  const { empresa } = useEmpresa();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [f, setF] = useState<Partial<Cliente>>({});
  const [chave, setChave] = useState<unknown>(null);
  if (cliente !== chave) { setChave(cliente); setF(cliente ?? {}); }

  const salvar = useMutation({
    mutationFn: async () => {
      const dados = {
        empresa_id: empresa.id, nome: f.nome?.trim(), cpf: f.cpf || null, whatsapp: soDigitos(f.whatsapp) || null,
        cep: f.cep || null, endereco: f.endereco || null, numero: f.numero || null, bairro: f.bairro || null,
        complemento: f.complemento || null, observacoes: f.observacoes || null,
      };
      const q = f.id
        ? supabase.from('clientes').update(dados).eq('id', f.id).select().single()
        : supabase.from('clientes').insert(dados).select().single();
      return ok(await q) as Cliente;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      avisar('Cliente salvo');
      onSalvo?.(c);
      onFechar();
    },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  async function buscarCep() {
    const cep = soDigitos(f.cep);
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json());
      if (!r.erro) setF((v) => ({ ...v, endereco: r.logradouro, bairro: r.bairro, complemento: v.complemento || r.complemento }));
    } catch { /* sem internet: segue manual */ }
  }

  const set = (k: keyof Cliente) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal aberto={!!cliente} onFechar={onFechar} titulo={f.id ? 'Editar cliente' : 'Novo cliente'}>
      <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="grid grid-cols-2 gap-3">
        <Field label="Nome *" className="col-span-2"><input className="input" required autoFocus value={f.nome ?? ''} onChange={set('nome')} /></Field>
        <Field label="WhatsApp (com DDD)"><input className="input" inputMode="tel" value={f.whatsapp ?? ''} onChange={set('whatsapp')} placeholder="19 99999-8888" /></Field>
        <Field label="CPF"><input className="input" inputMode="numeric" value={f.cpf ?? ''} onChange={set('cpf')} /></Field>
        <Field label="CEP"><input className="input" inputMode="numeric" value={f.cep ?? ''} onChange={set('cep')} onBlur={buscarCep} /></Field>
        <Field label="Número"><input className="input" value={f.numero ?? ''} onChange={set('numero')} /></Field>
        <Field label="Endereço" className="col-span-2"><input className="input" value={f.endereco ?? ''} onChange={set('endereco')} /></Field>
        <Field label="Bairro"><input className="input" value={f.bairro ?? ''} onChange={set('bairro')} /></Field>
        <Field label="Complemento"><input className="input" value={f.complemento ?? ''} onChange={set('complemento')} /></Field>
        <Field label="Observações" className="col-span-2"><textarea className="input" rows={2} value={f.observacoes ?? ''} onChange={set('observacoes')} /></Field>
        <button className="btn-primary col-span-2 mt-2" disabled={salvar.isPending}>{salvar.isPending && <Spinner />} Salvar</button>
      </form>
    </Modal>
  );
}

function ClienteDetalhe({ cliente, onFechar, onEditar }: { cliente: Cliente; onFechar: () => void; onEditar: () => void }) {
  const { empresa } = useEmpresa();
  const { data: motos = [] } = useVeiculos(cliente.id);
  const [moto, setMoto] = useState<Partial<Veiculo> | null>(null);
  const qc = useQueryClient();
  const avisar = useAviso();

  const historico = useQuery({
    queryKey: ['os', empresa.id, 'cliente', cliente.id],
    queryFn: async () => {
      const [os, vendas, contas] = await Promise.all([
        supabase.from('ordens_servico').select('id, numero, status, total, data_entrada, veiculo:veiculos(placa)').eq('cliente_id', cliente.id).order('data_entrada', { ascending: false }).limit(20),
        supabase.from('vendas').select('id, numero, total, data, status').eq('cliente_id', cliente.id).neq('status', 'carrinho').order('data', { ascending: false }).limit(20),
        supabase.from('contas_receber').select('valor, valor_pago').eq('cliente_id', cliente.id).in('status', ['aberta', 'parcial']),
      ]);
      return {
        os: ok(os) as unknown as { id: string; numero: number; status: StatusOS; total: number; data_entrada: string; veiculo: { placa: string } | null }[],
        vendas: ok(vendas) as { id: string; numero: number; total: number; data: string; status: string }[],
        devendo: (ok(contas) as { valor: number; valor_pago: number }[]).reduce((a, c) => a + Number(c.valor) - Number(c.valor_pago), 0),
      };
    },
  });

  const excluirMoto = useMutation({
    mutationFn: async (id: string) => ok(await supabase.from('veiculos').update({ cliente_id: null }).eq('id', id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['veiculos'] }); avisar('Moto desvinculada do cliente'); },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  return (
    <Modal aberto onFechar={onFechar} titulo={cliente.nome} largura="max-w-2xl">
      <div className="mb-4 flex flex-wrap gap-2">
        {cliente.whatsapp && (
          <a className="btn-wa" href={linkWhatsapp(cliente.whatsapp, `Olá, ${cliente.nome.split(' ')[0]}! Aqui é da ${empresa.nome}.`)} target="_blank" rel="noreferrer">
            <MessageCircle size={16} /> WhatsApp
          </a>
        )}
        <button className="btn-ghost" onClick={onEditar}><Pencil size={16} /> Editar</button>
        <Link className="btn-dark" to={`/os?nova=1&cliente=${cliente.id}`}><Plus size={16} /> Nova OS</Link>
      </div>
      <p className="text-sm text-slate-600">
        {telefone(cliente.whatsapp)}{cliente.endereco && ` · ${cliente.endereco}, ${cliente.numero ?? 's/n'} — ${cliente.bairro ?? ''}`}
      </p>
      {historico.data && historico.data.devendo > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">Deve {dinheiro(historico.data.devendo)} (ver Financeiro → A receber)</p>
      )}

      <div className="mt-5 flex items-center justify-between">
        <h3 className="font-semibold">Motos</h3>
        <button className="btn-ghost py-1.5" onClick={() => setMoto({ cliente_id: cliente.id })}><Plus size={14} /> Moto</button>
      </div>
      <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {motos.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <Bike size={18} className="text-slate-400" />
            <span className="flex-1"><b>{m.placa}</b> {[m.marca, m.modelo, m.ano, m.cor].filter(Boolean).join(' · ')}{m.km_atual ? ` · ${m.km_atual.toLocaleString('pt-BR')} km` : ''}</span>
            <button className="text-slate-400 hover:text-slate-700" onClick={() => setMoto(m)} aria-label="Editar moto"><Pencil size={15} /></button>
            <button className="text-slate-400 hover:text-red-600" onClick={() => excluirMoto.mutate(m.id)} aria-label="Remover moto"><Trash2 size={15} /></button>
          </li>
        ))}
        {!motos.length && <li className="px-3 py-3 text-sm text-slate-500">Nenhuma moto cadastrada.</li>}
      </ul>

      <h3 className="mt-5 font-semibold">Histórico</h3>
      <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
        {historico.data?.os.map((o) => (
          <li key={o.id}>
            <Link to={`/os/${o.id}`} className="flex justify-between px-3 py-2 hover:bg-slate-50">
              <span>OS #{o.numero} · {data(o.data_entrada)} {o.veiculo && `· ${o.veiculo.placa}`} <span className={`badge ml-1 ${STATUS_OS[o.status].cor}`}>{STATUS_OS[o.status].nome}</span></span>
              <b>{dinheiro(o.total)}</b>
            </Link>
          </li>
        ))}
        {historico.data?.vendas.map((v) => (
          <li key={v.id} className="flex justify-between px-3 py-2">
            <span>Venda #{v.numero} · {data(v.data)} {v.status === 'cancelada' && <span className="badge ml-1 bg-red-100 text-red-700">Cancelada</span>}</span>
            <b>{dinheiro(v.total)}</b>
          </li>
        ))}
        {historico.data && !historico.data.os.length && !historico.data.vendas.length && (
          <li className="px-3 py-3 text-slate-500">Sem atendimentos ainda.</li>
        )}
      </ul>

      <VeiculoForm veiculo={moto} onFechar={() => setMoto(null)} />
    </Modal>
  );
}

export function VeiculoForm({ veiculo, onFechar, onSalvo }: { veiculo: Partial<Veiculo> | null; onFechar: () => void; onSalvo?: (v: Veiculo) => void }) {
  const { empresa } = useEmpresa();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [f, setF] = useState<Partial<Veiculo>>({});
  const [chave, setChave] = useState<unknown>(null);
  if (veiculo !== chave) { setChave(veiculo); setF(veiculo ?? {}); }

  const salvar = useMutation({
    mutationFn: async () => {
      const dados = {
        empresa_id: empresa.id, cliente_id: f.cliente_id ?? null, placa: placa(f.placa ?? ''), marca: f.marca || null,
        modelo: f.modelo || null, ano: f.ano ? Number(f.ano) : null, cor: f.cor || null, km_atual: f.km_atual ? Number(f.km_atual) : null,
      };
      const q = f.id
        ? supabase.from('veiculos').update(dados).eq('id', f.id).select().single()
        : supabase.from('veiculos').insert(dados).select().single();
      return ok(await q) as Veiculo;
    },
    onSuccess: (v) => { qc.invalidateQueries({ queryKey: ['veiculos'] }); avisar('Moto salva'); onSalvo?.(v); onFechar(); },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  const set = (k: keyof Veiculo) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal aberto={!!veiculo} onFechar={onFechar} titulo={f.id ? 'Editar moto' : 'Nova moto'}>
      <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="grid grid-cols-2 gap-3">
        <Field label="Placa *"><input className="input uppercase" required minLength={7} maxLength={8} autoFocus value={f.placa ?? ''} onChange={(e) => setF({ ...f, placa: placa(e.target.value) })} /></Field>
        <Field label="Marca"><input className="input" list="marcas" value={f.marca ?? ''} onChange={set('marca')} /></Field>
        <Field label="Modelo"><input className="input" value={f.modelo ?? ''} onChange={set('modelo')} placeholder="CG 160 Fan" /></Field>
        <Field label="Ano"><input className="input" inputMode="numeric" value={f.ano ?? ''} onChange={set('ano')} /></Field>
        <Field label="Cor"><input className="input" value={f.cor ?? ''} onChange={set('cor')} /></Field>
        <Field label="Km atual"><input className="input" inputMode="numeric" value={f.km_atual ?? ''} onChange={set('km_atual')} /></Field>
        <datalist id="marcas">{['Honda', 'Yamaha', 'Suzuki', 'Kawasaki', 'BMW', 'Triumph', 'Dafra', 'Shineray', 'Haojue', 'Royal Enfield'].map((m) => <option key={m} value={m} />)}</datalist>
        <button className="btn-primary col-span-2 mt-2" disabled={salvar.isPending}>{salvar.isPending && <Spinner />} Salvar</button>
      </form>
    </Modal>
  );
}

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil } from 'lucide-react';
import { supabase, ok } from '../lib/supabase';
import { useEmpresa } from '../lib/empresa';
import { useFormas, useMecanicos } from '../lib/dados';
import { dinheiro, num, telefone } from '../lib/format';
import { Field, Modal, PageHeader, Spinner, msgErro, useAviso } from '../components/ui';
import { useQuery } from '@tanstack/react-query';
import type { ServicoCat } from '../lib/types';

/** Substitui "Cadastros", "Cadastro de Serviços", "Cadastro Mecanico" e "Forma Pagamento" do AppSheet. */
export function Cadastros() {
  const { empresa, papel } = useEmpresa();
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: mecanicos = [] } = useMecanicos(false);
  const { data: formas = [] } = useFormas();
  const servicos = useQuery({
    queryKey: ['servicos_catalogo', empresa.id, 'todos'],
    queryFn: async () => ok(await supabase.from('servicos_catalogo').select('*').eq('empresa_id', empresa.id).order('descricao')) as ServicoCat[],
  });

  const [modal, setModal] = useState<{ tabela: 'mecanicos' | 'servicos_catalogo' | 'formas_pagamento'; dados: Record<string, unknown> } | null>(null);
  const [emp, setEmp] = useState({ nome: empresa.nome, cnpj: empresa.cnpj ?? '', telefone: empresa.telefone ?? '', neg: empresa.permite_estoque_negativo });

  const salvar = useMutation({
    mutationFn: async () => {
      const { tabela, dados } = modal!;
      const { id, ...resto } = dados as { id?: string } & Record<string, unknown>;
      const payload = { ...resto, empresa_id: empresa.id };
      return ok(await (id ? supabase.from(tabela).update(payload).eq('id', id) : supabase.from(tabela).insert(payload)));
    },
    onSuccess: () => {
      ['mecanicos', 'servicos_catalogo', 'formas'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      avisar('Salvo'); setModal(null);
    },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  const salvarEmpresa = useMutation({
    mutationFn: async () => ok(await supabase.from('empresas').update({
      nome: emp.nome.trim(), cnpj: emp.cnpj || null, telefone: emp.telefone || null, permite_estoque_negativo: emp.neg,
    }).eq('id', empresa.id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['membro'] }); avisar('Dados da oficina salvos'); },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  const d = modal?.dados ?? {};
  const set = (k: string, v: unknown) => setModal((m) => m && { ...m, dados: { ...m.dados, [k]: v } });

  return (
    <>
      <PageHeader titulo="Cadastros" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Bloco titulo="Tabela de serviços (mão de obra)" onNovo={() => setModal({ tabela: 'servicos_catalogo', dados: { ativo: true } })}>
          {servicos.data?.map((s) => (
            <Linha key={s.id} inativo={!s.ativo} onEditar={() => setModal({ tabela: 'servicos_catalogo', dados: { ...s } })}>
              <span>{s.descricao}</span><b>{dinheiro(s.preco)}</b>
            </Linha>
          ))}
        </Bloco>

        <Bloco titulo="Mecânicos" onNovo={() => setModal({ tabela: 'mecanicos', dados: { ativo: true, comissao_pct: 0 } })}>
          {mecanicos.map((m) => (
            <Linha key={m.id} inativo={!m.ativo} onEditar={() => setModal({ tabela: 'mecanicos', dados: { ...m } })}>
              <span>{m.nome} <span className="text-xs text-slate-500">{telefone(m.telefone)}</span></span>
              {Number(m.comissao_pct) > 0 && <span className="text-sm text-slate-500">comissão {Number(m.comissao_pct)}%</span>}
            </Linha>
          ))}
        </Bloco>

        <Bloco titulo="Formas de pagamento" onNovo={() => setModal({ tabela: 'formas_pagamento', dados: { ativo: true, gera_conta_receber: false } })}>
          {formas.map((f) => (
            <Linha key={f.id} inativo={!f.ativo} onEditar={() => setModal({ tabela: 'formas_pagamento', dados: { ...f } })}>
              <span>{f.descricao}</span>
              {f.gera_conta_receber && <span className="badge bg-amber-100 text-amber-700">gera fiado</span>}
            </Linha>
          ))}
        </Bloco>

        {papel === 'dono' && (
          <section className="card p-4">
            <h2 className="mb-3 font-semibold">Dados da oficina</h2>
            <form onSubmit={(e) => { e.preventDefault(); salvarEmpresa.mutate(); }} className="grid gap-3">
              <Field label="Nome"><input className="input" required value={emp.nome} onChange={(e) => setEmp({ ...emp, nome: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="CNPJ"><input className="input" value={emp.cnpj} onChange={(e) => setEmp({ ...emp, cnpj: e.target.value })} /></Field>
                <Field label="Telefone"><input className="input" value={emp.telefone} onChange={(e) => setEmp({ ...emp, telefone: e.target.value })} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={emp.neg} onChange={(e) => setEmp({ ...emp, neg: e.target.checked })} />
                Permitir vender sem estoque (saldo negativo)
              </label>
              <button className="btn-primary" disabled={salvarEmpresa.isPending}>{salvarEmpresa.isPending && <Spinner />} Salvar</button>
            </form>
          </section>
        )}
      </div>

      <Modal aberto={!!modal} onFechar={() => setModal(null)}
        titulo={modal?.tabela === 'mecanicos' ? 'Mecânico' : modal?.tabela === 'servicos_catalogo' ? 'Serviço' : 'Forma de pagamento'}>
        <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="grid gap-3">
          {modal?.tabela === 'mecanicos' && (
            <>
              <Field label="Nome *"><input className="input" required autoFocus value={String(d.nome ?? '')} onChange={(e) => set('nome', e.target.value)} /></Field>
              <Field label="Telefone"><input className="input" value={String(d.telefone ?? '')} onChange={(e) => set('telefone', e.target.value)} /></Field>
              <Field label="Comissão sobre mão de obra (%)"><input className="input" inputMode="decimal" value={String(d.comissao_pct ?? '')} onChange={(e) => set('comissao_pct', num(e.target.value))} /></Field>
            </>
          )}
          {modal?.tabela === 'servicos_catalogo' && (
            <>
              <Field label="Descrição *"><input className="input" required autoFocus value={String(d.descricao ?? '')} onChange={(e) => set('descricao', e.target.value)} placeholder="Troca de óleo" /></Field>
              <Field label="Preço (R$) *"><input className="input" required inputMode="decimal" defaultValue={d.preco !== undefined ? String(d.preco).replace('.', ',') : ''} onChange={(e) => set('preco', num(e.target.value))} /></Field>
            </>
          )}
          {modal?.tabela === 'formas_pagamento' && (
            <>
              <Field label="Descrição *"><input className="input" required autoFocus value={String(d.descricao ?? '')} onChange={(e) => set('descricao', e.target.value)} /></Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!d.gera_conta_receber} onChange={(e) => set('gera_conta_receber', e.target.checked)} />
                Não entra no caixa: vira conta a receber (fiado)
              </label>
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d.ativo !== false} onChange={(e) => set('ativo', e.target.checked)} /> Ativo
          </label>
          <button className="btn-primary" disabled={salvar.isPending}>{salvar.isPending && <Spinner />} Salvar</button>
        </form>
      </Modal>
    </>
  );
}

function Bloco({ titulo, onNovo, children }: { titulo: string; onNovo: () => void; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="font-semibold">{titulo}</h2>
        <button className="btn-ghost py-1.5" onClick={onNovo}><Plus size={14} /> Novo</button>
      </div>
      <ul className="divide-y divide-slate-100">{children}</ul>
    </section>
  );
}

function Linha({ children, onEditar, inativo }: { children: React.ReactNode; onEditar: () => void; inativo?: boolean }) {
  return (
    <li className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${inativo ? 'opacity-50' : ''}`}>
      <div className="flex flex-1 items-center justify-between gap-3">{children}</div>
      <button className="text-slate-400 hover:text-slate-700" onClick={onEditar} aria-label="Editar"><Pencil size={15} /></button>
    </li>
  );
}

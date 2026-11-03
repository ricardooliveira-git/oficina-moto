import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, PackagePlus, ClipboardCheck, History, Pencil, ImageOff } from 'lucide-react';
import { supabase, ok } from '../lib/supabase';
import { useEmpresa } from '../lib/empresa';
import { CHAVES_MOVIMENTO, useEstoque } from '../lib/dados';
import { dataHora, dinheiro, num, numero } from '../lib/format';
import { Busca, Field, Modal, PageHeader, Spinner, Stat, Vazio, msgErro, useAviso } from '../components/ui';
import type { EstoqueLinha, Produto } from '../lib/types';

const urlFoto = (path: string | null) => (path ? supabase.storage.from('produtos').getPublicUrl(path).data.publicUrl : null);

export function Estoque() {
  const { empresa } = useEmpresa();
  const { data: estoque = [], isLoading } = useEstoque();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'baixo' | 'zerado'>('todos');
  const [produto, setProduto] = useState<Partial<Produto> | null>(null);
  const [entrada, setEntrada] = useState<EstoqueLinha | null>(null);
  const [ajuste, setAjuste] = useState<EstoqueLinha | null>(null);
  const [historico, setHistorico] = useState<EstoqueLinha | null>(null);

  const fotos = useQuery({
    queryKey: ['produtos-fotos', empresa.id],
    queryFn: async () =>
      Object.fromEntries((ok(await supabase.from('produtos').select('id, foto_path').eq('empresa_id', empresa.id)) as { id: string; foto_path: string | null }[]).map((p) => [p.id, p.foto_path])),
  });

  const lista = useMemo(() => {
    const t = busca.toLowerCase().trim();
    return estoque
      .filter((p) => !t || p.nome.toLowerCase().includes(t) || p.codigo_barras === busca.trim())
      .filter((p) => filtro === 'todos' || (filtro === 'baixo' ? p.abaixo_minimo : Number(p.saldo) <= 0));
  }, [estoque, busca, filtro]);

  const valorTotal = estoque.reduce((a, p) => a + Math.max(Number(p.valor_estoque), 0), 0);

  async function editar(id: string) {
    const p = ok(await supabase.from('produtos').select('*').eq('id', id).single()) as Produto;
    setProduto(p);
  }

  return (
    <>
      <PageHeader
        titulo="Estoque"
        sub="O saldo é a soma das entradas, vendas, OS e ajustes — nada é calculado à mão"
        acoes={<button className="btn-primary" onClick={() => setProduto({ margem_pct: 50 })}><Plus size={16} /> Novo produto</button>}
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat titulo="Produtos" valor={estoque.length} />
        <Stat titulo="Valor em estoque (custo)" valor={dinheiro(valorTotal)} />
        <Stat titulo="Abaixo do mínimo" valor={estoque.filter((p) => p.abaixo_minimo).length} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Busca valor={busca} onChange={setBusca} placeholder="Nome ou código de barras" />
        <select className="input w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
          <option value="todos">Todos</option>
          <option value="baixo">Abaixo do mínimo</option>
          <option value="zerado">Sem estoque</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center p-10"><Spinner /></div>
        ) : !lista.length ? (
          <Vazio texto={estoque.length ? 'Nenhum produto encontrado.' : 'Cadastre seus produtos e dê entrada no estoque.'} />
        ) : (
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th w-12"></th><th className="th">Produto</th><th className="th text-right">Saldo</th>
                <th className="th text-right">Custo</th><th className="th text-right">Venda</th><th className="th text-right">C/ troca</th>
                <th className="th text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((p) => {
                const foto = urlFoto(fotos.data?.[p.produto_id] ?? null);
                return (
                  <tr key={p.produto_id} className="hover:bg-slate-50">
                    <td className="td">
                      {foto ? <img src={foto} alt="" className="h-9 w-9 rounded-md object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-300"><ImageOff size={16} /></div>}
                    </td>
                    <td className="td">
                      <p className="font-medium">{p.nome}</p>
                      {p.codigo_barras && <p className="text-xs text-slate-500">{p.codigo_barras}</p>}
                    </td>
                    <td className={`td text-right font-semibold ${Number(p.saldo) <= 0 ? 'text-red-600' : p.abaixo_minimo ? 'text-amber-600' : ''}`}>
                      {numero(p.saldo)}
                    </td>
                    <td className="td text-right">{dinheiro(p.custo)}</td>
                    <td className="td text-right">{dinheiro(p.preco_venda)}</td>
                    <td className="td text-right">{dinheiro(p.preco_troca)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button className="btn-primary px-2 py-1.5" title="Entrada" onClick={() => setEntrada(p)}><PackagePlus size={16} /></button>
                        <button className="btn-ghost px-2 py-1.5" title="Ajuste de inventário" onClick={() => setAjuste(p)}><ClipboardCheck size={16} /></button>
                        <button className="btn-ghost px-2 py-1.5" title="Movimentos" onClick={() => setHistorico(p)}><History size={16} /></button>
                        <button className="btn-ghost px-2 py-1.5" title="Editar" onClick={() => editar(p.produto_id)}><Pencil size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ProdutoForm produto={produto} onFechar={() => setProduto(null)} />
      <EntradaModal produto={entrada} onFechar={() => setEntrada(null)} />
      <AjusteModal produto={ajuste} onFechar={() => setAjuste(null)} />
      <MovimentosModal produto={historico} onFechar={() => setHistorico(null)} />
    </>
  );
}

function ProdutoForm({ produto, onFechar }: { produto: Partial<Produto> | null; onFechar: () => void }) {
  const { empresa } = useEmpresa();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [f, setF] = useState<Record<string, string>>({});
  const [foto, setFoto] = useState<File | null>(null);
  const [chave, setChave] = useState<unknown>(null);
  if (produto !== chave) {
    setChave(produto);
    setFoto(null);
    const br = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
    setF({
      nome: produto?.nome ?? '', codigo_barras: produto?.codigo_barras ?? '', sku: produto?.sku ?? '',
      custo: br(produto?.custo), margem_pct: br(produto?.margem_pct), preco_venda: br(produto?.preco_venda),
      preco_troca: br(produto?.preco_troca), estoque_minimo: br(produto?.estoque_minimo), estoque_inicial: '',
    });
  }

  const sugerido = num(f.custo) * (1 + num(f.margem_pct) / 100);

  const salvar = useMutation({
    mutationFn: async () => {
      const dados = {
        empresa_id: empresa.id, nome: f.nome.trim(), codigo_barras: f.codigo_barras.trim() || null, sku: f.sku.trim() || null,
        custo: num(f.custo), margem_pct: num(f.margem_pct),
        preco_venda: f.preco_venda ? num(f.preco_venda) : Math.round(sugerido * 100) / 100,
        preco_troca: f.preco_troca ? num(f.preco_troca) : null,
        estoque_minimo: num(f.estoque_minimo),
      };
      const salvo = ok(await (produto?.id
        ? supabase.from('produtos').update(dados).eq('id', produto.id).select().single()
        : supabase.from('produtos').insert(dados).select().single())) as Produto;
      if (foto) {
        const ext = foto.name.split('.').pop() || 'jpg';
        const path = `${empresa.id}/${salvo.id}-${Date.now()}.${ext}`;
        const up = await supabase.storage.from('produtos').upload(path, foto, { upsert: true });
        if (up.error) throw new Error('Produto salvo, mas a foto não subiu: ' + up.error.message);
        ok(await supabase.from('produtos').update({ foto_path: path }).eq('id', salvo.id));
      }
      if (!produto?.id && num(f.estoque_inicial) > 0) {
        ok(await supabase.rpc('registrar_entrada', { p_produto: salvo.id, p_quantidade: num(f.estoque_inicial), p_custo: num(f.custo), p_obs: 'Estoque inicial' }));
      }
    },
    onSuccess: () => {
      CHAVES_MOVIMENTO.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      qc.invalidateQueries({ queryKey: ['produtos-fotos'] });
      avisar('Produto salvo'); onFechar();
    },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal aberto={!!produto} onFechar={onFechar} titulo={produto?.id ? 'Editar produto' : 'Novo produto'}>
      <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="grid grid-cols-2 gap-3">
        <Field label="Nome *" className="col-span-2"><input className="input" required autoFocus value={f.nome ?? ''} onChange={set('nome')} /></Field>
        <Field label="Código de barras"><input className="input" value={f.codigo_barras ?? ''} onChange={set('codigo_barras')} /></Field>
        <Field label="Código interno (SKU)"><input className="input" value={f.sku ?? ''} onChange={set('sku')} /></Field>
        <Field label="Custo (R$) *"><input className="input" required inputMode="decimal" value={f.custo ?? ''} onChange={set('custo')} /></Field>
        <Field label="Margem (%)"><input className="input" inputMode="decimal" value={f.margem_pct ?? ''} onChange={set('margem_pct')} /></Field>
        <Field label="Preço de venda (R$)"><input className="input" inputMode="decimal" value={f.preco_venda ?? ''} onChange={set('preco_venda')} placeholder={sugerido ? sugerido.toFixed(2).replace('.', ',') : ''} /></Field>
        <Field label="Preço com troca (R$)"><input className="input" inputMode="decimal" value={f.preco_troca ?? ''} onChange={set('preco_troca')} placeholder="igual ao de venda" /></Field>
        <Field label="Estoque mínimo"><input className="input" inputMode="decimal" value={f.estoque_minimo ?? ''} onChange={set('estoque_minimo')} /></Field>
        {!produto?.id && <Field label="Estoque inicial"><input className="input" inputMode="decimal" value={f.estoque_inicial ?? ''} onChange={set('estoque_inicial')} /></Field>}
        <Field label="Foto" className="col-span-2"><input className="input" type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} /></Field>
        <p className="col-span-2 text-xs text-slate-500">
          Sem preço de venda, o sistema usa custo + margem ({dinheiro(sugerido)}). O preço com troca é o cobrado quando o cliente entrega a peça velha.
        </p>
        <button className="btn-primary col-span-2" disabled={salvar.isPending}>{salvar.isPending && <Spinner />} Salvar</button>
      </form>
    </Modal>
  );
}

function EntradaModal({ produto, onFechar }: { produto: EstoqueLinha | null; onFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [qtd, setQtd] = useState('');
  const [custo, setCusto] = useState('');
  const [obs, setObs] = useState('');
  const [chave, setChave] = useState<unknown>(null);
  if (produto !== chave) { setChave(produto); setQtd(''); setObs(''); setCusto(produto ? String(produto.custo).replace('.', ',') : ''); }

  const salvar = useMutation({
    mutationFn: async () =>
      ok(await supabase.rpc('registrar_entrada', { p_produto: produto!.produto_id, p_quantidade: num(qtd), p_custo: custo ? num(custo) : null, p_obs: obs || null })),
    onSuccess: () => { CHAVES_MOVIMENTO.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); avisar(`Entrada de ${qtd} registrada`); onFechar(); },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  return (
    <Modal aberto={!!produto} onFechar={onFechar} titulo={`Entrada · ${produto?.nome ?? ''}`}>
      <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="grid grid-cols-2 gap-3">
        <p className="col-span-2 text-sm text-slate-500">Saldo atual: <b>{numero(produto?.saldo)}</b></p>
        <Field label="Quantidade *"><input className="input" required autoFocus inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} /></Field>
        <Field label="Custo unitário (R$)"><input className="input" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} /></Field>
        <Field label="Observação (nota, fornecedor)" className="col-span-2"><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
        <button className="btn-primary col-span-2" disabled={salvar.isPending || num(qtd) <= 0}>{salvar.isPending && <Spinner />} Dar entrada</button>
      </form>
    </Modal>
  );
}

function AjusteModal({ produto, onFechar }: { produto: EstoqueLinha | null; onFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [contado, setContado] = useState('');
  const [obs, setObs] = useState('');
  const [chave, setChave] = useState<unknown>(null);
  if (produto !== chave) { setChave(produto); setContado(''); setObs(''); }

  const salvar = useMutation({
    mutationFn: async () => ok(await supabase.rpc('ajustar_estoque', { p_produto: produto!.produto_id, p_saldo_contado: num(contado), p_obs: obs || null })),
    onSuccess: () => { CHAVES_MOVIMENTO.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); avisar('Estoque ajustado'); onFechar(); },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  const dif = contado === '' ? 0 : num(contado) - Number(produto?.saldo ?? 0);
  return (
    <Modal aberto={!!produto} onFechar={onFechar} titulo={`Inventário · ${produto?.nome ?? ''}`}>
      <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="space-y-3">
        <p className="text-sm text-slate-500">O sistema diz que há <b>{numero(produto?.saldo)}</b>. Informe quanto você contou na prateleira.</p>
        <Field label="Quantidade contada *"><input className="input" required autoFocus inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} /></Field>
        <Field label="Motivo"><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Inventário, perda, avaria…" /></Field>
        {contado !== '' && (
          <p className={`text-sm font-medium ${dif === 0 ? 'text-slate-500' : dif > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {dif === 0 ? 'Sem diferença.' : `Ajuste de ${dif > 0 ? '+' : ''}${numero(dif)}`}
          </p>
        )}
        <button className="btn-primary w-full" disabled={salvar.isPending || contado === ''}>{salvar.isPending && <Spinner />} Ajustar</button>
      </form>
    </Modal>
  );
}

const TIPO_MOV = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', estorno: 'Estorno' } as const;
const ORIGEM = { venda: 'Venda', os: 'OS', orcamento: 'Orçamento', manual: 'Manual' } as const;

function MovimentosModal({ produto, onFechar }: { produto: EstoqueLinha | null; onFechar: () => void }) {
  const movs = useQuery({
    queryKey: ['movimentos', produto?.produto_id],
    enabled: !!produto,
    queryFn: async () =>
      ok(await supabase.from('movimentos_estoque').select('*').eq('produto_id', produto!.produto_id).order('criado_em', { ascending: false }).limit(100)) as {
        id: string; tipo: keyof typeof TIPO_MOV; quantidade: number; custo_unitario: number | null; origem: keyof typeof ORIGEM; observacao: string | null; criado_em: string;
      }[],
  });
  return (
    <Modal aberto={!!produto} onFechar={onFechar} titulo={`Movimentos · ${produto?.nome ?? ''}`} largura="max-w-2xl">
      {movs.isLoading ? <Spinner /> : (
        <table className="w-full text-sm">
          <thead><tr><th className="th">Data</th><th className="th">Tipo</th><th className="th">Origem</th><th className="th text-right">Qtd</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {movs.data?.map((m) => (
              <tr key={m.id}>
                <td className="td">{dataHora(m.criado_em)}</td>
                <td className="td">{TIPO_MOV[m.tipo]}{m.observacao && <span className="block text-xs text-slate-500">{m.observacao}</span>}</td>
                <td className="td">{ORIGEM[m.origem]}</td>
                <td className={`td text-right font-semibold ${Number(m.quantidade) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {Number(m.quantidade) > 0 ? '+' : ''}{numero(m.quantidade)}
                </td>
              </tr>
            ))}
            {!movs.data?.length && <tr><td colSpan={4} className="td text-center text-slate-500">Sem movimentos.</td></tr>}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

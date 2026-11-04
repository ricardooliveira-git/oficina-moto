import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Printer, Ban } from 'lucide-react';
import { supabase, ok } from '../lib/supabase';
import { useEmpresa } from '../lib/empresa';
import { CHAVES_MOVIMENTO } from '../lib/dados';
import { data, dinheiro, hoje, inicioMes } from '../lib/format';
import { Field, Modal, PageHeader, Spinner, Stat, Vazio, msgErro, useAviso } from '../components/ui';

interface Linha { venda_id: string; numero: number; tipo: 'normal' | 'troca'; status: string; data: string; cliente: string | null; total: number; formas: string | null }

/** Extrato de vendas (substitui "Extrato de vendas" e "Venda" do AppSheet). */
export function Vendas() {
  const { empresa, papel } = useEmpresa();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [de, setDe] = useState(inicioMes());
  const [ate, setAte] = useState(hoje());
  const [tipo, setTipo] = useState<'' | 'normal' | 'troca'>('');
  const [cancelar, setCancelar] = useState<Linha | null>(null);
  const [motivo, setMotivo] = useState('');

  const q = useQuery({
    queryKey: ['vendas', empresa.id, de, ate, tipo],
    queryFn: async () => {
      let s = supabase.from('v_extrato_vendas').select('*').eq('empresa_id', empresa.id).gte('data', de).lte('data', ate).order('numero', { ascending: false });
      if (tipo) s = s.eq('tipo', tipo);
      return ok(await s) as Linha[];
    },
  });

  const cancela = useMutation({
    mutationFn: async () => ok(await supabase.rpc('cancelar_documento', { p_origem: 'venda', p_id: cancelar!.venda_id, p_motivo: motivo || 'Cancelada' })),
    onSuccess: () => { CHAVES_MOVIMENTO.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); avisar('Venda cancelada e estoque devolvido'); setCancelar(null); setMotivo(''); },
    onError: (e) => avisar(msgErro(e), 'erro'),
  });

  const linhas = q.data ?? [];
  const total = linhas.reduce((a, l) => a + Number(l.total), 0);

  return (
    <>
      <PageHeader titulo="Vendas" sub="Vendas finalizadas no período" acoes={<Link to="/pdv" className="btn-primary">Nova venda</Link>} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="De"><input type="date" className="input" value={de} onChange={(e) => setDe(e.target.value)} /></Field>
        <Field label="Até"><input type="date" className="input" value={ate} onChange={(e) => setAte(e.target.value)} /></Field>
        <Field label="Tipo">
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="">Todas</option><option value="normal">Venda</option><option value="troca">Com troca</option>
          </select>
        </Field>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat titulo="Vendas" valor={linhas.length} />
        <Stat titulo="Total" valor={dinheiro(total)} destaque />
        <Stat titulo="Ticket médio" valor={dinheiro(linhas.length ? total / linhas.length : 0)} />
      </div>

      <div className="cartao overflow-x-auto">
        {q.isLoading ? <div className="flex justify-center p-10"><Spinner /></div> : !linhas.length ? <Vazio texto="Nenhuma venda no período." /> : (
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-linha bg-nevoa">
              <tr><th className="th">Nº</th><th className="th">Data</th><th className="th">Cliente</th><th className="th">Pagamento</th><th className="th text-right">Total</th><th className="th"></th></tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {linhas.map((l) => (
                <tr key={l.venda_id}>
                  <td className="td font-semibold"><span className="numero">#{l.numero}</span>{l.tipo === 'troca' && <span className="badge ml-2 bg-ciano-claro text-ciano-escuro">troca</span>}</td>
                  <td className="numero td">{data(l.data)}</td>
                  <td className="td">{l.cliente ?? '—'}</td>
                  <td className="td">
                    {l.formas ?? '—'}
                    {l.status === 'a_receber' && <span className="badge ml-2 bg-ambar-claro text-ambar">a receber</span>}
                  </td>
                  <td className="td numero text-right font-semibold">{dinheiro(l.total)}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <Link to={`/imprimir/venda/${l.venda_id}`} target="_blank" className="btn-ghost px-2" title="Imprimir"><Printer size={18} /></Link>
                      {papel !== 'mecanico' && <button className="btn-danger px-2" title="Cancelar" onClick={() => setCancelar(l)}><Ban size={18} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal aberto={!!cancelar} onFechar={() => setCancelar(null)} titulo={`Cancelar venda #${cancelar?.numero}`}>
        <p className="mb-3 text-sm text-tinta-suave">Os produtos voltam para o estoque e os pagamentos são estornados. Nada é apagado: fica o registro.</p>
        <Field label="Motivo"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
        <button className="btn-danger mt-4 w-full" disabled={cancela.isPending} onClick={() => cancela.mutate()}>{cancela.isPending && <Spinner />} Cancelar venda</button>
      </Modal>
    </>
  );
}

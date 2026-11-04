import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal, Spinner } from './ui';
import { useFormas } from '../lib/dados';
import { dinheiro, num } from '../lib/format';
import type { Pagamento } from '../lib/types';

/**
 * Recebe o pagamento de uma venda ou OS em uma ou mais formas.
 * O que faltar vira conta a receber (exige cliente) — mesma regra do "Receber depois" do AppSheet.
 */
export function PagamentoModal({
  aberto, onFechar, total, temCliente, onConfirmar, salvando,
}: {
  aberto: boolean;
  onFechar: () => void;
  total: number;
  temCliente: boolean;
  onConfirmar: (p: Pagamento[]) => void;
  salvando: boolean;
}) {
  const { data: formas = [] } = useFormas();
  const ativas = formas.filter((f) => f.ativo);
  const [linhas, setLinhas] = useState<{ forma_id: string; valor: string }[]>([]);

  useEffect(() => {
    if (aberto && ativas.length) {
      const padrao = ativas.find((f) => f.descricao === 'Pix') ?? ativas[0];
      setLinhas([{ forma_id: padrao.id, valor: total.toFixed(2).replace('.', ',') }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, ativas.length, total]);

  const calc = useMemo(() => {
    let pago = 0, receber = 0;
    for (const l of linhas) {
      const f = formas.find((x) => x.id === l.forma_id);
      if (f?.gera_conta_receber) receber += num(l.valor);
      else pago += num(l.valor);
    }
    const troco = Math.max(pago - total, 0);
    const falta = Math.max(total - pago, 0);
    return { pago, receber, troco, falta };
  }, [linhas, formas, total]);

  const bloqueado = calc.falta > 0.004 && !temCliente;

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Receber pagamento">
      <div className="mb-4 fundo-heroi rounded-2xl p-4 text-white">
        <p className="text-sm font-semibold text-white/70">Total</p>
        <p className="numero text-3xl font-bold">{dinheiro(total)}</p>
      </div>

      <div className="space-y-2">
        {linhas.map((l, i) => (
          <div key={i} className="flex gap-2">
            <select
              className="input"
              value={l.forma_id}
              onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, forma_id: e.target.value } : x)))}
            >
              {ativas.map((f) => <option key={f.id} value={f.id}>{f.descricao}</option>)}
            </select>
            <input
              className="input w-36 text-right"
              inputMode="decimal"
              value={l.valor}
              onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
            />
            {linhas.length > 1 && (
              <button className="btn-ghost px-2" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))} aria-label="Remover">
                <Trash2 size={18} />
              </button>
            )}
          </div>
        ))}
        <button
          className="btn-ghost w-full"
          onClick={() => setLinhas([...linhas, { forma_id: ativas[0]?.id ?? '', valor: calc.falta.toFixed(2).replace('.', ',') }])}
        >
          <Plus size={18} /> Dividir em outra forma
        </button>
      </div>

      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between"><dt>Recebido agora</dt><dd className="numero font-semibold">{dinheiro(calc.pago)}</dd></div>
        {calc.troco > 0 && <div className="flex justify-between text-zap-escuro"><dt>Troco</dt><dd className="numero font-bold">{dinheiro(calc.troco)}</dd></div>}
        {calc.falta > 0.004 && (
          <div className="flex justify-between text-ambar"><dt>Fica a receber (fiado)</dt><dd className="numero font-bold">{dinheiro(calc.falta)}</dd></div>
        )}
      </dl>
      {bloqueado && <p className="mt-3 rounded-2xl bg-ambar-claro p-3 text-sm text-ambar">Para deixar valor a receber, escolha o cliente antes.</p>}

      <button
        className="btn-primary mt-5 w-full py-3 text-base"
        disabled={salvando || bloqueado || !linhas.length}
        onClick={() =>
          onConfirmar(linhas.filter((l) => num(l.valor) > 0).map((l) => ({ forma_id: l.forma_id, valor: num(l.valor) })))
        }
      >
        {salvando && <Spinner />} Confirmar
      </button>
    </Modal>
  );
}

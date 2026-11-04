import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ShoppingCart, Wrench, FileText, AlertTriangle } from 'lucide-react';
import { supabase, ok } from '../lib/supabase';
import { useEmpresa } from '../lib/empresa';
import { useEstoque } from '../lib/dados';
import { dinheiro, hoje, inicioMes, numero, data } from '../lib/format';
import { Stat } from '../components/ui';
import { STATUS_OS, type StatusOS } from '../lib/types';

export function Painel() {
  const { empresa } = useEmpresa();
  const { data: estoque = [] } = useEstoque();

  const resumo = useQuery({
    queryKey: ['resumo', empresa.id, 'painel'],
    queryFn: async () =>
      ok(await supabase.from('v_resumo_diario').select('*').eq('empresa_id', empresa.id).gte('data', inicioMes())) as {
        data: string; servicos: number; vendas: number; vendas_troca: number; despesas: number;
      }[],
  });

  const os = useQuery({
    queryKey: ['os', empresa.id, 'painel'],
    queryFn: async () =>
      ok(await supabase.from('ordens_servico')
        .select('id, numero, status, previsao, cliente:clientes(nome), veiculo:veiculos(placa, modelo)')
        .eq('empresa_id', empresa.id).not('status', 'in', '(entregue,cancelada)').order('numero')) as unknown as {
        id: string; numero: number; status: StatusOS; previsao: string | null;
        cliente: { nome: string } | null; veiculo: { placa: string; modelo: string | null } | null;
      }[],
  });

  const contas = useQuery({
    queryKey: ['contas', empresa.id, 'painel'],
    queryFn: async () =>
      ok(await supabase.from('contas_receber').select('valor, valor_pago, vencimento')
        .eq('empresa_id', empresa.id).in('status', ['aberta', 'parcial'])) as { valor: number; valor_pago: number; vencimento: string }[],
  });

  const dHoje = resumo.data?.find((r) => r.data === hoje());
  const entradasHoje = dHoje ? Number(dHoje.servicos) + Number(dHoje.vendas) + Number(dHoje.vendas_troca) : 0;
  const mes = (resumo.data ?? []).reduce(
    (a, r) => ({ ent: a.ent + Number(r.servicos) + Number(r.vendas) + Number(r.vendas_troca), des: a.des + Number(r.despesas) }),
    { ent: 0, des: 0 },
  );
  const aReceber = (contas.data ?? []).reduce((a, c) => a + Number(c.valor) - Number(c.valor_pago), 0);
  const vencidas = (contas.data ?? []).filter((c) => c.vencimento < hoje()).length;
  const baixo = estoque.filter((e) => e.abaixo_minimo);

  return (
    <>
      <header className="fundo-heroi relative mb-6 overflow-hidden rounded-3xl p-5 text-white sm:p-6">
        <div className="grade-tecnica pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Painel</h1>
            <p className="mt-1 text-sm text-white/70">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/pdv" className="btn-primary"><ShoppingCart size={18} /> Nova venda</Link>
            <Link to="/os?nova=1" className="btn-ghost"><Wrench size={18} /> Nova OS</Link>
            <Link to="/orcamentos?novo=1" className="btn-ghost"><FileText size={18} /> Orçamento</Link>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat titulo="Entradas hoje" valor={dinheiro(entradasHoje)} detalhe={dHoje ? `Despesas ${dinheiro(dHoje.despesas)}` : 'Nenhum lançamento'} destaque />
        <Stat titulo="Saldo do mês" valor={dinheiro(mes.ent - mes.des)} detalhe={`Entradas ${dinheiro(mes.ent)}`} />
        <Stat titulo="A receber (fiado)" valor={dinheiro(aReceber)} detalhe={vencidas ? `${vencidas} vencida(s)` : 'Nada vencido'} />
        <Stat titulo="Motos na oficina" valor={os.data?.length ?? 0} detalhe={`${os.data?.filter((o) => o.status === 'pronta').length ?? 0} pronta(s) para entregar`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="cartao">
          <div className="flex items-center justify-between border-b border-linha px-4 py-3">
            <h2 className="text-lg font-bold">Ordens de serviço em andamento</h2>
            <Link to="/os" className="text-sm text-azul-escuro hover:underline">Ver todas</Link>
          </div>
          <ul className="divide-y divide-linha">
            {(os.data ?? []).slice(0, 8).map((o) => (
              <li key={o.id}>
                <Link to={`/os/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-nevoa">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium"><span className="numero">#{o.numero}</span> · {o.cliente?.nome ?? 'Sem cliente'}</p>
                    <p className="text-sm text-tinta-suave">
                      {o.veiculo ? `${o.veiculo.placa} ${o.veiculo.modelo ?? ''}` : 'Sem moto'}
                      {o.previsao && ` · previsão ${data(o.previsao)}`}
                    </p>
                  </div>
                  <span className={`badge ${STATUS_OS[o.status].cor}`}>{STATUS_OS[o.status].nome}</span>
                </Link>
              </li>
            ))}
            {!os.data?.length && <li className="px-4 py-8 text-center text-[15px] text-tinta-suave">Nenhuma moto na oficina agora.</li>}
          </ul>
        </section>

        <section className="cartao">
          <div className="flex items-center justify-between border-b border-linha px-4 py-3">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              {baixo.length > 0 && <AlertTriangle size={18} className="text-ambar-vivo" />} Estoque baixo
            </h2>
            <Link to="/estoque" className="text-sm text-azul-escuro hover:underline">Estoque</Link>
          </div>
          <ul className="divide-y divide-linha">
            {baixo.slice(0, 8).map((p) => (
              <li key={p.produto_id} className="flex justify-between px-4 py-3 text-sm">
                <span>{p.nome}</span>
                <span className={Number(p.saldo) <= 0 ? 'font-semibold text-vermelho' : 'text-ambar'}>
                  <span className="numero">{numero(p.saldo)}</span> / mín. <span className="numero">{numero(p.estoque_minimo)}</span>
                </span>
              </li>
            ))}
            {!baixo.length && <li className="px-4 py-8 text-center text-[15px] text-tinta-suave">Nenhum produto abaixo do mínimo.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}

import { useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useClientes, useEstoque } from '../lib/dados';
import { dinheiro, numero, soDigitos } from '../lib/format';
import type { EstoqueLinha } from '../lib/types';

/** Busca de cliente por nome, telefone ou CPF. */
export function ClienteSelect({
  value, onChange, placeholder = 'Consumidor (sem cliente)',
}: {
  value: string | null; onChange: (id: string | null) => void; placeholder?: string;
}) {
  const { data: clientes = [] } = useClientes();
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const atual = clientes.find((c) => c.id === value);

  const lista = useMemo(() => {
    const t = texto.toLowerCase().trim();
    const d = soDigitos(texto);
    return clientes
      .filter((c) => !t || c.nome.toLowerCase().includes(t) || (d && (soDigitos(c.whatsapp).includes(d) || soDigitos(c.cpf).includes(d))))
      .slice(0, 30);
  }, [clientes, texto]);

  return (
    <div className="relative">
      <input
        className="input"
        placeholder={atual ? atual.nome : placeholder}
        value={aberto ? texto : atual?.nome ?? ''}
        onFocus={() => { setAberto(true); setTexto(''); }}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onChange={(e) => setTexto(e.target.value)}
      />
      {aberto && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-linha bg-papel shadow-lg">
          <button type="button" className="block w-full px-3 py-2 text-left text-sm text-tinta-suave hover:bg-nevoa" onMouseDown={() => onChange(null)}>
            {placeholder}
          </button>
          {lista.map((c) => (
            <button
              type="button"
              key={c.id}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-azul-claro"
              onMouseDown={() => onChange(c.id)}
            >
              <span className="font-medium">{c.nome}</span>
              {c.whatsapp && <span className="ml-2 text-sm text-tinta-suave">{c.whatsapp}</span>}
            </button>
          ))}
          {!lista.length && <p className="px-3 py-2 text-sm text-tinta-suave">Nenhum cliente encontrado</p>}
        </div>
      )}
    </div>
  );
}

/** Busca de produto por nome ou código de barras (Enter adiciona o primeiro). */
export function ProdutoBusca({
  onEscolher, tipo = 'normal', mostrarSemSaldo = false,
}: {
  onEscolher: (p: EstoqueLinha) => void; tipo?: 'normal' | 'troca'; mostrarSemSaldo?: boolean;
}) {
  const { data: estoque = [] } = useEstoque();
  const [texto, setTexto] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const lista = useMemo(() => {
    const t = texto.toLowerCase().trim();
    if (!t) return [];
    return estoque
      .filter((p) => p.nome.toLowerCase().includes(t) || p.codigo_barras === texto.trim())
      .sort((a, b) => (mostrarSemSaldo ? 0 : Number(Number(b.saldo) > 0) - Number(Number(a.saldo) > 0)))
      .slice(0, 12);
  }, [estoque, texto, mostrarSemSaldo]);

  const escolher = (p: EstoqueLinha) => { onEscolher(p); setTexto(''); ref.current?.focus(); };

  return (
    <div className="relative">
      <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave" />
      <input
        ref={ref}
        className="input pl-10"
        placeholder="Nome do produto ou código de barras"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && lista[0]) { e.preventDefault(); escolher(lista[0]); } }}
      />
      {lista.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-2xl border border-linha bg-papel shadow-lg">
          {lista.map((p) => {
            const sem = Number(p.saldo) <= 0;
            return (
              <button
                type="button"
                key={p.produto_id}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-azul-claro"
                onClick={() => escolher(p)}
              >
                <span>
                  <span className="font-medium">{p.nome}</span>
                  <span className={`ml-2 text-sm ${sem ? 'text-vermelho' : 'text-tinta-suave'}`}>estoque <span className="numero">{numero(p.saldo)}</span></span>
                </span>
                <span className="numero font-semibold">{dinheiro(tipo === 'troca' ? p.preco_troca : p.preco_venda)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

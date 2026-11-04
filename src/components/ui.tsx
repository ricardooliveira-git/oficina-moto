import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

export function PageHeader({ titulo, sub, acoes }: { titulo: string; sub?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-tinta">{titulo}</h1>
        {sub && <p className="mt-0.5 text-sm text-tinta-suave">{sub}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Modal({
  aberto, onFechar, titulo, children, largura = 'max-w-lg',
}: {
  aberto: boolean; onFechar: () => void; titulo: string; children: ReactNode; largura?: string;
}) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={onFechar}>
      <div
        className={`max-h-[92vh] w-full ${largura} modal-entra overflow-y-auto rounded-t-3xl bg-papel shadow-xl sm:rounded-3xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-linha bg-papel px-5 py-3">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <button onClick={onFechar} className="flex min-h-10 min-w-10 items-center justify-center rounded-2xl text-tinta-suave hover:bg-nevoa" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Vazio({ texto, acao }: { texto: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center text-sm text-tinta-suave">
      <p>{texto}</p>
      {acao}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} size={18} />;
}

export function Busca({ valor, onChange, placeholder = 'Buscar…' }: { valor: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input className="input max-w-sm" value={valor} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

export function Stat({ titulo, valor, detalhe, destaque }: { titulo: string; valor: ReactNode; detalhe?: ReactNode; destaque?: boolean }) {
  return (
    <div className={`cartao p-4 ${destaque ? 'border-azul-claro bg-azul-claro' : ''}`}>
      <p className="text-sm font-semibold text-tinta-suave">{titulo}</p>
      <p className="numero mt-1 text-xl font-bold text-tinta sm:text-2xl">{valor}</p>
      {detalhe && <p className="mt-1 text-sm text-tinta-suave">{detalhe}</p>}
    </div>
  );
}

/* ---------------- avisos (toast) ---------------- */
type Aviso = { id: number; texto: string; tipo: 'ok' | 'erro' };
const AvisoCtx = createContext<(texto: string, tipo?: 'ok' | 'erro') => void>(() => {});
export const useAviso = () => useContext(AvisoCtx);

export function AvisoProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Aviso[]>([]);
  const avisar = useCallback((texto: string, tipo: 'ok' | 'erro' = 'ok') => {
    const id = Date.now() + Math.random();
    setLista((l) => [...l, { id, texto, tipo }]);
    setTimeout(() => setLista((l) => l.filter((a) => a.id !== id)), tipo === 'erro' ? 6000 : 3000);
  }, []);
  return (
    <AvisoCtx.Provider value={avisar}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {lista.map((a) => (
          <div
            key={a.id}
            className={`entra pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
              a.tipo === 'ok' ? 'bg-noite' : 'bg-vermelho'
            }`}
          >
            {a.tipo === 'ok' ? <CheckCircle2 size={18} className="shrink-0 text-ciano" /> : <AlertTriangle size={18} className="shrink-0" />}
            {a.texto}
          </div>
        ))}
      </div>
    </AvisoCtx.Provider>
  );
}

/** Erro → texto amigável */
export const msgErro = (e: unknown) => (e instanceof Error ? e.message : String(e));

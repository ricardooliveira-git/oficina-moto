import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

export function PageHeader({ titulo, sub, acoes }: { titulo: string; sub?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">{titulo}</h1>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
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
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={onFechar}>
      <div
        className={`max-h-[92vh] w-full ${largura} overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button onClick={onFechar} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Vazio({ texto, acao }: { texto: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center text-sm text-slate-500">
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
    <div className={`card p-4 ${destaque ? 'border-brand-200 bg-brand-50' : ''}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-ink-900">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-slate-500">{detalhe}</p>}
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
            className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
              a.tipo === 'ok' ? 'bg-ink-900' : 'bg-red-600'
            }`}
          >
            {a.tipo === 'ok' ? <CheckCircle2 size={18} className="shrink-0 text-emerald-400" /> : <AlertTriangle size={18} className="shrink-0" />}
            {a.texto}
          </div>
        ))}
      </div>
    </AvisoCtx.Provider>
  );
}

/** Erro → texto amigável */
export const msgErro = (e: unknown) => (e instanceof Error ? e.message : String(e));

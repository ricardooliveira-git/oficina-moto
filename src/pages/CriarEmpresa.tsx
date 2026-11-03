import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bike } from 'lucide-react';
import { supabase, traduzErro } from '../lib/supabase';
import { Spinner } from '../components/ui';

/** Primeiro acesso: cria a oficina e as formas de pagamento padrão (Dinheiro, Pix, Cartão, Receber depois). */
export function CriarEmpresa() {
  const qc = useQueryClient();
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro('');
    const { error } = await supabase.rpc('criar_empresa', { p_nome: nome.trim() });
    setSalvando(false);
    if (error) return setErro(traduzErro(error.message));
    qc.invalidateQueries({ queryKey: ['membro'] });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-900 px-4">
      <form onSubmit={criar} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white"><Bike size={26} /></div>
        <h1 className="text-lg font-semibold">Bem-vindo! Qual o nome da oficina?</h1>
        <p className="mb-4 mt-1 text-sm text-slate-500">Ele aparece nos cupons, orçamentos e ordens de serviço.</p>
        <input className="input mb-3" required autoFocus placeholder="Ex.: Moto Center do Zé" value={nome} onChange={(e) => setNome(e.target.value)} />
        {erro && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
        <button className="btn-primary w-full" disabled={salvando || !nome.trim()}>{salvando && <Spinner />} Começar</button>
        <button type="button" className="mt-3 w-full text-sm text-slate-500 hover:underline" onClick={() => supabase.auth.signOut()}>
          Sair
        </button>
      </form>
    </div>
  );
}

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
    <div className="fundo-heroi relative flex min-h-screen items-center justify-center px-4">
      <div className="grade-tecnica pointer-events-none absolute inset-0" aria-hidden="true" />
      <form onSubmit={criar} className="cartao entra relative w-full max-w-sm p-6">
        <div className="mb-4 flex h-12 w-12 items-center justify-center degrade-primario rounded-2xl text-white"><Bike size={26} /></div>
        <h1 className="text-lg font-bold">Bem-vindo! Qual o nome da oficina?</h1>
        <p className="mb-4 mt-1 text-sm text-tinta-suave">Ele aparece nos cupons, orçamentos e ordens de serviço.</p>
        <input className="input mb-3" required autoFocus placeholder="Ex.: Moto Center do Zé" value={nome} onChange={(e) => setNome(e.target.value)} />
        {erro && <p className="mb-3 rounded-2xl bg-vermelho-claro p-3 text-sm font-medium text-vermelho">{erro}</p>}
        <button className="btn-primary w-full" disabled={salvando || !nome.trim()}>{salvando && <Spinner />} Começar</button>
        <button type="button" className="mt-3 w-full text-sm text-tinta-suave hover:underline" onClick={() => supabase.auth.signOut()}>
          Sair
        </button>
      </form>
    </div>
  );
}

import { useState } from 'react';
import { Bike } from 'lucide-react';
import { supabase, traduzErro } from '../lib/supabase';
import { Spinner } from '../components/ui';

export function Login() {
  const [modo, setModo] = useState<'entrar' | 'criar' | 'esqueci'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState<{ t: string; erro?: boolean } | null>(null);
  const [carregando, setCarregando] = useState(false);

  const voltar = window.location.origin + window.location.pathname;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true); setMsg(null);
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else if (modo === 'criar') {
        const { data, error } = await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: voltar } });
        if (error) throw error;
        if (!data.session) setMsg({ t: 'Conta criada. Abra o link que enviamos para o seu e-mail e depois entre aqui.' });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: voltar });
        if (error) throw error;
        setMsg({ t: 'Enviamos um link para redefinir a senha.' });
      }
    } catch (err) {
      setMsg({ t: traduzErro(err instanceof Error ? err.message : String(err)), erro: true });
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-900 px-4">
      <div className="mb-8 flex items-center gap-3 text-white">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600"><Bike size={28} /></div>
        <div>
          <p className="text-2xl font-bold">Oficina Moto</p>
          <p className="text-sm text-slate-400">Estoque, vendas, OS e orçamentos</p>
        </div>
      </div>
      <form onSubmit={enviar} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="mb-4 text-lg font-semibold">
          {modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Recuperar senha'}
        </h1>
        <label className="label">E-mail</label>
        <input className="input mb-3" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {modo !== 'esqueci' && (
          <>
            <label className="label">Senha</label>
            <input
              className="input mb-4" type="password" required minLength={6}
              autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
              value={senha} onChange={(e) => setSenha(e.target.value)}
            />
          </>
        )}
        {msg && <p className={`mb-3 rounded-lg p-3 text-sm ${msg.erro ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{msg.t}</p>}
        <button className="btn-primary w-full py-2.5" disabled={carregando}>
          {carregando && <Spinner />}
          {modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}
        </button>
        <div className="mt-4 flex justify-between text-sm">
          {modo !== 'entrar' ? (
            <button type="button" className="text-brand-700 hover:underline" onClick={() => setModo('entrar')}>Já tenho conta</button>
          ) : (
            <button type="button" className="text-brand-700 hover:underline" onClick={() => setModo('criar')}>Criar conta</button>
          )}
          {modo === 'entrar' && (
            <button type="button" className="text-slate-500 hover:underline" onClick={() => setModo('esqueci')}>Esqueci a senha</button>
          )}
        </div>
      </form>
    </div>
  );
}

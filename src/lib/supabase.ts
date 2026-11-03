import { createClient } from '@supabase/supabase-js';

// Valores públicos (URL + chave publicável). A segurança dos dados vem das políticas RLS do banco.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://nkrhkuruuskotdugbyne.supabase.co';
const key = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_b1s2XIv6GYUiq-BaAzGMDA_HvxgQra4';

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Lança o erro do Supabase em português amigável, ou devolve os dados. */
export function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(traduzErro(res.error.message));
  return res.data as T;
}

export function traduzErro(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (msg.includes('User already registered')) return 'Este e-mail já tem cadastro. Use "Entrar".';
  if (msg.includes('Password should be')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (msg.includes('duplicate key') && msg.includes('placa')) return 'Já existe uma moto com essa placa.';
  if (msg.includes('duplicate key') && msg.includes('codigo_barras')) return 'Já existe um produto com esse código de barras.';
  if (msg.includes('row-level security')) return 'Sem permissão para esta operação.';
  return msg;
}

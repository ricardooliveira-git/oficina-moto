const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const dinheiro = (v: number | string | null | undefined) => brl.format(Number(v ?? 0));

export const numero = (v: number | string | null | undefined, casas = 0) =>
  Number(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: casas === 0 ? 3 : casas, minimumFractionDigits: casas });

/** 'AAAA-MM-DD' ou ISO → 'DD/MM/AAAA' sem deslocar fuso. */
export function data(v: string | null | undefined) {
  if (!v) return '';
  const [a, m, d] = v.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function dataHora(v: string | null | undefined) {
  if (!v) return '';
  return new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export const hoje = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const inicioMes = () => hoje().slice(0, 8) + '01';

export const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

export function telefone(s: string | null | undefined) {
  const d = soDigitos(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s ?? '';
}

export function placa(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

/** Link do WhatsApp com mensagem pronta (substitui as ações "Whatapp PC/SmartPhone" do AppSheet). */
export function linkWhatsapp(tel: string | null | undefined, mensagem = '') {
  let d = soDigitos(tel);
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}`;
}

export const num = (v: string | number | null | undefined) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

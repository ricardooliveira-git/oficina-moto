import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Wrench, FileText, Users, Package, Wallet, Settings, Receipt, LogOut, Bike,
} from 'lucide-react';
import { useEmpresa } from '../lib/empresa';

const MENU = [
  { to: '/', nome: 'Painel', icone: LayoutDashboard, fim: true },
  { to: '/pdv', nome: 'Vender', icone: ShoppingCart },
  { to: '/os', nome: 'Ordens de serviço', curto: 'OS', icone: Wrench },
  { to: '/orcamentos', nome: 'Orçamentos', icone: FileText },
  { to: '/vendas', nome: 'Vendas', icone: Receipt },
  { to: '/clientes', nome: 'Clientes e motos', curto: 'Clientes', icone: Users },
  { to: '/estoque', nome: 'Estoque', icone: Package },
  { to: '/financeiro', nome: 'Financeiro', icone: Wallet },
  { to: '/cadastros', nome: 'Cadastros', icone: Settings },
];

const MOBILE = ['/', '/pdv', '/os', '/estoque', '/clientes'];

export function Layout() {
  const { empresa, session, sair } = useEmpresa();
  return (
    <div className="min-h-screen lg:pl-64">
      {/* lateral (desktop) */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 flex-col bg-ink-900 text-slate-300 lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white"><Bike size={22} /></div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">{empresa.nome}</p>
            <p className="text-xs text-slate-400">Oficina Moto</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {MENU.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.fim}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-brand-600 text-white' : 'hover:bg-ink-800 hover:text-white'
                }`
              }
            >
              <m.icone size={18} /> {m.nome}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink-800 px-5 py-4 text-xs">
          <p className="truncate text-slate-400">{session.user.email}</p>
          <button onClick={sair} className="mt-2 flex items-center gap-2 text-slate-300 hover:text-white">
            <LogOut size={14} /> Sair
          </button>
        </div>
      </aside>

      {/* topo (celular) */}
      <header className="no-print sticky top-0 z-20 flex items-center justify-between bg-ink-900 px-4 py-3 text-white lg:hidden">
        <div className="flex items-center gap-2 font-semibold"><Bike size={20} className="text-brand-500" /> {empresa.nome}</div>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-sm text-slate-300">Menu</summary>
          <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white p-2 text-slate-800 shadow-xl">
            {MENU.map((m) => (
              <NavLink key={m.to} to={m.to} end={m.fim} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
                <m.icone size={16} /> {m.nome}
              </NavLink>
            ))}
            <button onClick={sair} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
              <LogOut size={16} /> Sair
            </button>
          </div>
        </details>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 pb-28 lg:px-8 lg:pb-10">
        <Outlet />
      </main>

      {/* barra inferior (celular) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white lg:hidden">
        {MENU.filter((m) => MOBILE.includes(m.to)).map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            end={m.fim}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-brand-600' : 'text-slate-500'}`
            }
          >
            <m.icone size={20} /> {m.curto ?? m.nome}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

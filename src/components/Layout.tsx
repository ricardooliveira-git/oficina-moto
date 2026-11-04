import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen lg:pl-64">
      {/* lateral (desktop) */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 flex-col bg-noite text-white/70 lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center degrade-primario rounded-2xl text-white"><Bike size={22} /></div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">{empresa.nome}</p>
            <p className="text-sm text-white/70">Oficina Moto</p>
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3">
          {MENU.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.fim}
              className={({ isActive }) =>
                `flex items-center min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition ${
                  isActive ? 'degrade-primario text-white' : 'hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <m.icone size={18} /> {m.nome}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-sm">
          <p className="truncate text-white/70">{session.user.email}</p>
          <button onClick={sair} className="mt-2 flex min-h-10 items-center gap-2 hover:text-white">
            <LogOut size={18} /> Sair
          </button>
        </div>
      </aside>

      {/* topo (celular) */}
      <header className="no-print sticky top-0 z-20 flex items-center justify-between bg-noite px-4 py-3 text-white lg:hidden">
        <div className="flex items-center gap-2 font-semibold"><Bike size={20} className="text-ciano" /> {empresa.nome}</div>
        <details className="relative">
          <summary className="cursor-pointer list-none flex min-h-10 items-center rounded-2xl px-3 text-sm font-semibold text-white/70">Menu</summary>
          <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-papel p-2 text-tinta shadow-xl">
            {MENU.map((m) => (
              <NavLink key={m.to} to={m.to} end={m.fim} className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm hover:bg-nevoa">
                <m.icone size={18} /> {m.nome}
              </NavLink>
            ))}
            <button onClick={sair} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm text-vermelho hover:bg-vermelho-claro">
              <LogOut size={18} /> Sair
            </button>
          </div>
        </details>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 pb-28 lg:px-8 lg:pb-10">
        <div key={pathname} className="entra"><Outlet /></div>
      </main>

      {/* barra inferior (celular) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-linha bg-papel pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MENU.filter((m) => MOBILE.includes(m.to)).map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            end={m.fim}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-azul' : 'text-tinta-suave'}`
            }
          >
            <m.icone size={20} /> {m.curto ?? m.nome}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

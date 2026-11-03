import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EmpresaGate } from './lib/empresa';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { CriarEmpresa } from './pages/CriarEmpresa';
import { Painel } from './pages/Painel';
import { PDV, VendaPendente } from './pages/PDV';
import { Vendas } from './pages/Vendas';
import { ListaOS, DetalheOS } from './pages/OS';
import { ListaOrcamentos, DetalheOrcamento } from './pages/Orcamentos';
import { Clientes } from './pages/Clientes';
import { Estoque } from './pages/Estoque';
import { Financeiro } from './pages/Financeiro';
import { Cadastros } from './pages/Cadastros';
import { Imprimir } from './pages/Imprimir';

// HashRouter: as rotas funcionam no GitHub Pages sem configurar redirecionamento 404.
export default function App() {
  return (
    <HashRouter>
      <EmpresaGate login={<Login />} criar={<CriarEmpresa />}>
        <Routes>
          <Route path="/imprimir/:tipo/:id" element={<Imprimir />} />
          <Route element={<Layout />}>
            <Route index element={<Painel />} />
            <Route path="pdv" element={<PDV />} />
            <Route path="pdv/orcamento/:id" element={<VendaPendente />} />
            <Route path="vendas" element={<Vendas />} />
            <Route path="os" element={<ListaOS />} />
            <Route path="os/:id" element={<DetalheOS />} />
            <Route path="orcamentos" element={<ListaOrcamentos />} />
            <Route path="orcamentos/:id" element={<DetalheOrcamento />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="estoque" element={<Estoque />} />
            <Route path="financeiro" element={<Financeiro />} />
            <Route path="cadastros" element={<Cadastros />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </EmpresaGate>
    </HashRouter>
  );
}

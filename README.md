# Oficina Moto

Sistema para oficina de motos: **estoque com entrada e saída automática, PDV (venda normal e com troca), ordens de serviço, orçamentos, clientes e motos, financeiro e fiado, com WhatsApp**.
Substitui o app AppSheet *OficinaMoto*, com as melhorias levantadas na migração.

- **Front-end:** React 18 + TypeScript + Vite + Tailwind + TanStack Query
- **Banco:** Supabase (PostgreSQL 15+), regras de negócio em PL/pgSQL e RLS por empresa
- **Hospedagem:** GitHub Pages, com deploy automático a cada push na `main`

## Rodar no VS Code

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

O projeto já aponta para o Supabase `nkrhkuruuskotdugbyne`. Para usar outro projeto, copie `.env.example` para `.env.local` e troque a URL e a chave publicável.

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor local com recarga automática |
| `npm run build` | Checa os tipos e gera a versão de produção em `dist/` |
| `npm run lint` | ESLint |

## Banco de dados

O schema completo está em [`supabase/migrations/001_oficina_moto.sql`](supabase/migrations/001_oficina_moto.sql) e já foi aplicado no projeto Supabase. Para recriar em um projeto novo, cole o arquivo no **SQL Editor** e rode.

Regras importantes (todas no banco, chamadas pelo app com `supabase.rpc`):

| Função | O que faz |
| --- | --- |
| `criar_empresa(nome)` | Primeiro acesso: cria a oficina, o usuário como dono e as formas de pagamento padrão |
| `registrar_entrada` / `ajustar_estoque` | Entrada de mercadoria e inventário |
| `finalizar_venda(venda, pagamentos)` | Baixa o estoque, registra pagamento e troco, abre fiado se faltar valor, numera a venda |
| `finalizar_os(os, pagamentos)` | O mesmo para a OS: baixa as peças e recebe |
| `converter_orcamento(orc, 'os' \| 'venda', tipo)` | Transforma o orçamento em OS ou venda |
| `cancelar_documento` | Estorna estoque e pagamentos sem apagar nada |
| `receber_conta` | Baixa total ou parcial de fiado |

O estoque é um **livro de movimentos** (`movimentos_estoque`). O saldo é sempre a soma (view `v_estoque_atual`) e venda sem saldo é bloqueada, a menos que a oficina permita estoque negativo em *Cadastros*.

## Publicação

Cada push na `main` roda `.github/workflows/deploy.yml`, que faz o build e publica no GitHub Pages:
**https://ricardooliveira-git.github.io/oficina-moto/**

No Supabase, em *Authentication → URL Configuration*, o **Site URL** deve ser esse endereço para os links de confirmação de e-mail voltarem ao sistema.

## Estrutura

```
src/
  lib/          supabase, formatação, tipos, contexto da empresa, consultas
  components/   layout, modais, pagamento, buscas de cliente e produto
  pages/        Painel, PDV, Vendas, OS, Orçamentos, Clientes, Estoque, Financeiro, Cadastros, Imprimir
supabase/migrations/   schema do banco
```

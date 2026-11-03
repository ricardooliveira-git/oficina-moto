-- =====================================================================
-- Oficina Moto — schema inicial (substitui o app AppSheet OficinaMoto)
-- PostgreSQL 15 / Supabase
-- Rode num projeto novo: supabase/migrations/001_oficina_moto.sql
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type papel_usuario      as enum ('dono', 'balcao', 'mecanico');
create type tipo_venda         as enum ('normal', 'troca');
create type status_venda       as enum ('carrinho', 'paga', 'a_receber', 'cancelada');
create type status_os          as enum ('aberta', 'em_execucao', 'aguardando_peca', 'pronta', 'entregue', 'cancelada');
create type status_orcamento   as enum ('aberto', 'aprovado', 'recusado', 'convertido', 'cancelado');
create type tipo_item          as enum ('peca', 'servico');
create type tipo_movimento     as enum ('entrada', 'saida', 'ajuste', 'estorno');
create type origem_documento   as enum ('venda', 'os', 'orcamento', 'manual');
create type status_conta       as enum ('aberta', 'parcial', 'quitada', 'cancelada');
create type categoria_despesa  as enum ('administrativa', 'pecas_insumos', 'funcionarios', 'outras');

-- ---------------------------------------------------------------------
-- Empresas e usuários (multiempresa desde o início)
-- ---------------------------------------------------------------------
create table empresas (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  cnpj            text,
  telefone        text,
  permite_estoque_negativo boolean not null default false,
  criado_em       timestamptz not null default now()
);

create table membros (
  empresa_id      uuid not null references empresas(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  papel           papel_usuario not null default 'balcao',
  mecanico_id     uuid,                     -- preenchido quando papel = mecanico
  primary key (empresa_id, user_id)
);

-- empresas do usuário logado (usado nas políticas RLS)
create or replace function minhas_empresas() returns setof uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from membros where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------
create table clientes (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  nome            text not null,
  cpf             text,
  whatsapp        text,                     -- só dígitos com DDD, ex. 19999998888
  cep             text,
  endereco        text,
  numero          text,
  bairro          text,
  complemento     text,
  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index on clientes (empresa_id, nome);

create table veiculos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  cliente_id      uuid references clientes(id) on delete set null,
  placa           text not null,
  marca           text,
  modelo          text,
  ano             int,
  cor             text,
  km_atual        int,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (empresa_id, placa)
);

create table mecanicos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  nome            text not null,
  telefone        text,
  comissao_pct    numeric(5,2) not null default 0,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);
alter table membros add constraint membros_mecanico_fk
  foreign key (mecanico_id) references mecanicos(id) on delete set null;

create table formas_pagamento (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references empresas(id) on delete cascade,
  descricao           text not null,        -- Cartão, Dinheiro, Pix, Receber depois
  gera_conta_receber  boolean not null default false,
  taxa_pct            numeric(5,2) not null default 0,
  ativo               boolean not null default true,
  unique (empresa_id, descricao)
);

create table servicos_catalogo (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  descricao       text not null,
  preco           numeric(12,2) not null default 0,
  tempo_min       int,
  ativo           boolean not null default true
);

create table produtos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  sku             text,
  codigo_barras   text,
  nome            text not null,
  custo           numeric(12,2) not null default 0,
  margem_pct      numeric(7,2)  not null default 0,   -- 50 = 50%
  preco_venda     numeric(12,2),
  preco_troca     numeric(12,2),
  estoque_minimo  numeric(12,3) not null default 0,
  foto_path       text,                               -- caminho no Storage
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (empresa_id, codigo_barras)
);
create index on produtos (empresa_id, nome);

-- ---------------------------------------------------------------------
-- Estoque: livro de movimentos (o saldo é sempre a soma)
-- ---------------------------------------------------------------------
create table movimentos_estoque (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  produto_id      uuid not null references produtos(id),
  tipo            tipo_movimento not null,
  quantidade      numeric(12,3) not null,   -- positivo entra, negativo sai
  custo_unitario  numeric(12,2),
  origem          origem_documento not null default 'manual',
  origem_id       uuid,
  observacao      text,
  criado_por      uuid default auth.uid(),
  criado_em       timestamptz not null default now(),
  check (quantidade <> 0)
);
create index on movimentos_estoque (produto_id);
create index on movimentos_estoque (origem, origem_id);

-- ---------------------------------------------------------------------
-- Numeração sequencial por empresa (substitui MAXROW()+1)
-- ---------------------------------------------------------------------
create table contadores (
  empresa_id      uuid not null references empresas(id) on delete cascade,
  tipo            origem_documento not null,
  ultimo          bigint not null default 0,
  primary key (empresa_id, tipo)
);

create or replace function proximo_numero(p_empresa uuid, p_tipo origem_documento)
returns bigint language plpgsql as $$
declare v bigint;
begin
  insert into contadores (empresa_id, tipo, ultimo) values (p_empresa, p_tipo, 1)
  on conflict (empresa_id, tipo) do update set ultimo = contadores.ultimo + 1
  returning ultimo into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Documentos: vendas, ordens de serviço, orçamentos
-- ---------------------------------------------------------------------
create table vendas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  numero          bigint,
  tipo            tipo_venda not null default 'normal',
  status          status_venda not null default 'carrinho',
  cliente_id      uuid references clientes(id),
  mecanico_id     uuid references mecanicos(id),     -- usado na venda com troca
  data            date not null default current_date,
  subtotal        numeric(12,2) not null default 0,
  desconto        numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  orcamento_id    uuid,
  pdf_path        text,
  criado_por      uuid default auth.uid(),
  criado_em       timestamptz not null default now(),
  finalizado_em   timestamptz,
  unique (empresa_id, numero)
);

create table venda_itens (
  id              uuid primary key default gen_random_uuid(),
  venda_id        uuid not null references vendas(id) on delete cascade,
  produto_id      uuid not null references produtos(id),
  quantidade      numeric(12,3) not null check (quantidade > 0),
  preco_unitario  numeric(12,2) not null,
  custo_unitario  numeric(12,2) not null default 0,
  subtotal        numeric(12,2) not null default 0
);
create index on venda_itens (venda_id);

create table ordens_servico (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  numero          bigint,
  status          status_os not null default 'aberta',
  cliente_id      uuid references clientes(id),
  veiculo_id      uuid references veiculos(id),
  mecanico_id     uuid references mecanicos(id),
  km_entrada      int,
  defeito_relatado text,
  diagnostico     text,
  observacao      text,
  data_entrada    timestamptz not null default now(),
  previsao        date,
  data_entrega    timestamptz,
  subtotal        numeric(12,2) not null default 0,
  desconto        numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  pago            boolean not null default false,
  orcamento_id    uuid,
  pdf_path        text,
  criado_por      uuid default auth.uid(),
  criado_em       timestamptz not null default now(),
  unique (empresa_id, numero)
);

create table os_itens (
  id              uuid primary key default gen_random_uuid(),
  os_id           uuid not null references ordens_servico(id) on delete cascade,
  tipo            tipo_item not null,
  produto_id      uuid references produtos(id),
  servico_id      uuid references servicos_catalogo(id),
  descricao       text not null,
  mecanico_id     uuid references mecanicos(id),
  quantidade      numeric(12,3) not null default 1 check (quantidade > 0),
  preco_unitario  numeric(12,2) not null,
  custo_unitario  numeric(12,2) not null default 0,
  subtotal        numeric(12,2) not null default 0,
  check ((tipo = 'peca' and produto_id is not null) or tipo = 'servico')
);
create index on os_itens (os_id);

create table orcamentos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  numero          bigint,
  status          status_orcamento not null default 'aberto',
  cliente_id      uuid references clientes(id),
  veiculo_id      uuid references veiculos(id),
  data            date not null default current_date,
  validade        date default current_date + 7,
  total_normal    numeric(12,2) not null default 0,  -- preço de venda
  total_troca     numeric(12,2) not null default 0,  -- preço com troca
  observacao      text,
  pdf_path        text,
  convertido_em   origem_documento,
  convertido_id   uuid,
  criado_por      uuid default auth.uid(),
  criado_em       timestamptz not null default now(),
  unique (empresa_id, numero)
);

create table orcamento_itens (
  id              uuid primary key default gen_random_uuid(),
  orcamento_id    uuid not null references orcamentos(id) on delete cascade,
  tipo            tipo_item not null default 'peca',
  produto_id      uuid references produtos(id),
  servico_id      uuid references servicos_catalogo(id),
  descricao       text not null,
  quantidade      numeric(12,3) not null default 1 check (quantidade > 0),
  preco_normal    numeric(12,2) not null,
  preco_troca     numeric(12,2),
  subtotal_normal numeric(12,2) not null default 0,
  subtotal_troca  numeric(12,2) not null default 0
);
create index on orcamento_itens (orcamento_id);

-- ---------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------
create table pagamentos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  origem          origem_documento not null,       -- venda | os | manual (baixa de fiado)
  origem_id       uuid,
  conta_receber_id uuid,
  forma_id        uuid not null references formas_pagamento(id),
  valor           numeric(12,2) not null check (valor > 0),
  troco           numeric(12,2) not null default 0,
  estornado       boolean not null default false,
  data            date not null default current_date,
  criado_por      uuid default auth.uid(),
  criado_em       timestamptz not null default now()
);
create index on pagamentos (origem, origem_id);

create table contas_receber (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  cliente_id      uuid references clientes(id),
  origem          origem_documento not null,
  origem_id       uuid,
  valor           numeric(12,2) not null check (valor > 0),
  valor_pago      numeric(12,2) not null default 0,
  vencimento      date not null default current_date + 30,
  status          status_conta not null default 'aberta',
  criado_em       timestamptz not null default now()
);
alter table pagamentos add constraint pagamentos_conta_fk
  foreign key (conta_receber_id) references contas_receber(id);

create table despesas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  data_pagamento  date not null default current_date,
  valor           numeric(12,2) not null check (valor > 0),
  forma_id        uuid references formas_pagamento(id),
  categoria       categoria_despesa not null default 'administrativa',
  descricao       text not null,
  observacao      text,
  criado_por      uuid default auth.uid(),
  criado_em       timestamptz not null default now()
);

-- =====================================================================
-- Triggers
-- =====================================================================

-- atualizado_em
create or replace function trg_touch() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger t_clientes_touch before update on clientes for each row execute function trg_touch();
create trigger t_veiculos_touch before update on veiculos for each row execute function trg_touch();
create trigger t_produtos_touch before update on produtos for each row execute function trg_touch();

-- preços do produto a partir de custo + margem (AppSheet: Valor Venda / Valor com Troca)
create or replace function trg_produto_precos() returns trigger language plpgsql as $$
begin
  if new.preco_venda is null or (tg_op = 'UPDATE' and
     (new.custo <> old.custo or new.margem_pct <> old.margem_pct)
     and new.preco_venda = old.preco_venda) then
    new.preco_venda := round(new.custo * (1 + new.margem_pct / 100), 2);
  end if;
  if new.preco_troca is null then
    new.preco_troca := new.preco_venda;
  end if;
  return new;
end $$;
create trigger t_produto_precos before insert or update on produtos
  for each row execute function trg_produto_precos();

-- subtotal dos itens
create or replace function trg_item_subtotal() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'orcamento_itens' then
    new.subtotal_normal := round(new.quantidade * new.preco_normal, 2);
    new.subtotal_troca  := round(new.quantidade * coalesce(new.preco_troca, new.preco_normal), 2);
  else
    new.subtotal := round(new.quantidade * new.preco_unitario, 2);
  end if;
  return new;
end $$;
create trigger t_venda_itens_sub before insert or update on venda_itens
  for each row execute function trg_item_subtotal();
create trigger t_os_itens_sub before insert or update on os_itens
  for each row execute function trg_item_subtotal();
create trigger t_orc_itens_sub before insert or update on orcamento_itens
  for each row execute function trg_item_subtotal();

-- totais do documento
create or replace function recalcular_total(p_origem origem_documento, p_id uuid)
returns void language plpgsql as $$
begin
  if p_origem = 'venda' then
    update vendas v set
      subtotal = coalesce((select sum(subtotal) from venda_itens where venda_id = p_id), 0),
      total    = greatest(coalesce((select sum(subtotal) from venda_itens where venda_id = p_id), 0) - v.desconto, 0)
    where v.id = p_id;
  elsif p_origem = 'os' then
    update ordens_servico o set
      subtotal = coalesce((select sum(subtotal) from os_itens where os_id = p_id), 0),
      total    = greatest(coalesce((select sum(subtotal) from os_itens where os_id = p_id), 0) - o.desconto, 0)
    where o.id = p_id;
  elsif p_origem = 'orcamento' then
    update orcamentos set
      total_normal = coalesce((select sum(subtotal_normal) from orcamento_itens where orcamento_id = p_id), 0),
      total_troca  = coalesce((select sum(subtotal_troca)  from orcamento_itens where orcamento_id = p_id), 0)
    where id = p_id;
  end if;
end $$;

create or replace function trg_itens_total() returns trigger language plpgsql as $$
declare r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if tg_table_name = 'venda_itens' then perform recalcular_total('venda', r.venda_id);
  elsif tg_table_name = 'os_itens' then perform recalcular_total('os', r.os_id);
  else perform recalcular_total('orcamento', r.orcamento_id);
  end if;
  return null;
end $$;
create trigger t_venda_itens_tot after insert or update or delete on venda_itens
  for each row execute function trg_itens_total();
create trigger t_os_itens_tot after insert or update or delete on os_itens
  for each row execute function trg_itens_total();
create trigger t_orc_itens_tot after insert or update or delete on orcamento_itens
  for each row execute function trg_itens_total();

-- desconto alterado no cabeçalho
create or replace function trg_desconto() returns trigger language plpgsql as $$
begin
  new.total := greatest(new.subtotal - new.desconto, 0);
  return new;
end $$;
create trigger t_vendas_desc before update of desconto on vendas
  for each row execute function trg_desconto();
create trigger t_os_desc before update of desconto on ordens_servico
  for each row execute function trg_desconto();

-- numeração automática de OS e orçamento (venda recebe nº ao finalizar)
create or replace function trg_numero() returns trigger language plpgsql as $$
begin
  if new.numero is null then
    new.numero := proximo_numero(new.empresa_id,
      case tg_table_name when 'ordens_servico' then 'os'::origem_documento
                         else 'orcamento'::origem_documento end);
  end if;
  return new;
end $$;
create trigger t_os_numero  before insert on ordens_servico for each row execute function trg_numero();
create trigger t_orc_numero before insert on orcamentos     for each row execute function trg_numero();

-- bloqueio de saldo negativo
create or replace function trg_saldo_negativo() returns trigger language plpgsql as $$
declare v_saldo numeric; v_permite boolean;
begin
  if new.quantidade >= 0 then return new; end if;
  select permite_estoque_negativo into v_permite from empresas where id = new.empresa_id;
  if v_permite then return new; end if;
  select coalesce(sum(quantidade), 0) into v_saldo
    from movimentos_estoque where produto_id = new.produto_id;
  if v_saldo + new.quantidade < 0 then
    raise exception 'Estoque insuficiente para o produto % (saldo %, saída %)',
      (select nome from produtos where id = new.produto_id), v_saldo, -new.quantidade
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger t_mov_saldo before insert on movimentos_estoque
  for each row execute function trg_saldo_negativo();

-- =====================================================================
-- Views
-- =====================================================================
create or replace view v_estoque_atual with (security_invoker = true) as
select p.id as produto_id, p.empresa_id, p.nome, p.codigo_barras, p.estoque_minimo,
       coalesce(sum(m.quantidade), 0)                         as saldo,
       p.custo, p.preco_venda, p.preco_troca,
       round(coalesce(sum(m.quantidade), 0) * p.custo, 2)     as valor_estoque,
       coalesce(sum(m.quantidade), 0) <= p.estoque_minimo     as abaixo_minimo
from produtos p
left join movimentos_estoque m on m.produto_id = p.id
where p.ativo
group by p.id;

create or replace view v_extrato_vendas with (security_invoker = true) as
select v.empresa_id, v.id as venda_id, v.numero, v.tipo, v.status, v.data,
       date_trunc('month', v.data)::date as mes,
       c.nome as cliente, v.total,
       string_agg(distinct f.descricao, ', ') as formas
from vendas v
left join clientes c on c.id = v.cliente_id
left join pagamentos pg on pg.origem = 'venda' and pg.origem_id = v.id and not pg.estornado
left join formas_pagamento f on f.id = pg.forma_id
where v.status in ('paga', 'a_receber')
group by v.id, c.nome;

create or replace view v_resumo_diario with (security_invoker = true) as
with dias as (
  select empresa_id, data from vendas where status in ('paga','a_receber')
  union select empresa_id, data_entrega::date from ordens_servico where status = 'entregue'
  union select empresa_id, data_pagamento from despesas
)
select d.empresa_id, d.data,
       date_trunc('month', d.data)::date as mes,
       coalesce((select sum(total) from ordens_servico o
                 where o.empresa_id = d.empresa_id and o.status = 'entregue'
                   and o.data_entrega::date = d.data), 0)                       as servicos,
       coalesce((select sum(total) from vendas v
                 where v.empresa_id = d.empresa_id and v.status in ('paga','a_receber')
                   and v.tipo = 'normal' and v.data = d.data), 0)               as vendas,
       coalesce((select sum(total) from vendas v
                 where v.empresa_id = d.empresa_id and v.status in ('paga','a_receber')
                   and v.tipo = 'troca' and v.data = d.data), 0)                as vendas_troca,
       coalesce((select sum(valor) from despesas e
                 where e.empresa_id = d.empresa_id and e.data_pagamento = d.data), 0) as despesas
from dias d;
-- saldo = servicos + vendas + vendas_troca - despesas (calcular no front ou numa view por cima)

-- =====================================================================
-- Funções de negócio (chamadas pelo app via supabase.rpc)
-- =====================================================================

-- Entrada de estoque (AppSheet: Entrada de produto)
create or replace function registrar_entrada(p_produto uuid, p_quantidade numeric,
                                             p_custo numeric default null, p_obs text default null)
returns uuid language plpgsql as $$
declare v_id uuid; v_emp uuid;
begin
  if p_quantidade <= 0 then raise exception 'Quantidade deve ser maior que zero'; end if;
  select empresa_id into v_emp from produtos where id = p_produto;
  if v_emp is null then raise exception 'Produto não encontrado'; end if;
  insert into movimentos_estoque (empresa_id, produto_id, tipo, quantidade, custo_unitario, origem, observacao)
  values (v_emp, p_produto, 'entrada', p_quantidade, p_custo, 'manual', p_obs)
  returning id into v_id;
  if p_custo is not null then
    update produtos set custo = p_custo where id = p_produto;
  end if;
  return v_id;
end $$;

-- Ajuste de inventário: informa o saldo contado
create or replace function ajustar_estoque(p_produto uuid, p_saldo_contado numeric, p_obs text default null)
returns void language plpgsql as $$
declare v_saldo numeric; v_emp uuid;
begin
  select empresa_id into v_emp from produtos where id = p_produto;
  if v_emp is null then raise exception 'Produto não encontrado'; end if;
  select coalesce(sum(quantidade), 0) into v_saldo from movimentos_estoque where produto_id = p_produto;
  if p_saldo_contado <> v_saldo then
    insert into movimentos_estoque (empresa_id, produto_id, tipo, quantidade, origem, observacao)
    values (v_emp, p_produto, 'ajuste', p_saldo_contado - v_saldo, 'manual', coalesce(p_obs, 'Inventário'));
  end if;
end $$;

-- Registra pagamentos e devolve o que ficou em aberto (uso interno)
create or replace function _registrar_pagamentos(p_empresa uuid, p_origem origem_documento,
                                                 p_id uuid, p_cliente uuid, p_total numeric,
                                                 p_pagamentos jsonb)
returns numeric language plpgsql as $$
declare
  pg jsonb; v_forma record; v_valor numeric; v_pago numeric := 0; v_receber numeric := 0;
  v_conta uuid; v_troco numeric;
begin
  for pg in select * from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) loop
    select * into v_forma from formas_pagamento
      where id = (pg->>'forma_id')::uuid and empresa_id = p_empresa;
    if not found then raise exception 'Forma de pagamento inválida'; end if;
    v_valor := (pg->>'valor')::numeric;
    if v_valor is null or v_valor <= 0 then continue; end if;
    if v_forma.gera_conta_receber then
      v_receber := v_receber + v_valor;
    else
      v_troco := greatest(v_pago + v_valor - (p_total - v_receber), 0);
      insert into pagamentos (empresa_id, origem, origem_id, forma_id, valor, troco)
      values (p_empresa, p_origem, p_id, v_forma.id, v_valor, v_troco);
      v_pago := v_pago + v_valor - v_troco;
    end if;
  end loop;

  -- o que não foi pago vira conta a receber
  v_receber := greatest(p_total - v_pago, 0);
  if v_receber > 0 then
    if p_cliente is null then
      raise exception 'Informe o cliente para vender a receber (faltam R$ %)', v_receber;
    end if;
    insert into contas_receber (empresa_id, cliente_id, origem, origem_id, valor)
    values (p_empresa, p_cliente, p_origem, p_id, v_receber)
    returning id into v_conta;
  end if;
  return v_receber;
end $$;

-- Fecha a venda: estoque + pagamento + número + status (AppSheet: Faturamento + ações Status)
create or replace function finalizar_venda(p_venda uuid, p_pagamentos jsonb)
returns vendas language plpgsql as $$
declare v vendas; it record; v_aberto numeric;
begin
  select * into v from vendas where id = p_venda for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  if v.status <> 'carrinho' then raise exception 'Venda já finalizada'; end if;
  if not exists (select 1 from venda_itens where venda_id = p_venda) then
    raise exception 'Carrinho vazio';
  end if;

  for it in select * from venda_itens where venda_id = p_venda loop
    update venda_itens set custo_unitario = (select custo from produtos where id = it.produto_id)
      where id = it.id;
    insert into movimentos_estoque (empresa_id, produto_id, tipo, quantidade, origem, origem_id)
    values (v.empresa_id, it.produto_id, 'saida', -it.quantidade, 'venda', p_venda);
  end loop;

  select * into v from vendas where id = p_venda;   -- total atualizado pelos triggers
  v_aberto := _registrar_pagamentos(v.empresa_id, 'venda', p_venda, v.cliente_id, v.total, p_pagamentos);

  update vendas set
    numero        = proximo_numero(v.empresa_id, 'venda'),
    status        = (case when v_aberto > 0 then 'a_receber' else 'paga' end)::status_venda,
    finalizado_em = now(),
    data          = current_date
  where id = p_venda
  returning * into v;
  return v;
end $$;

-- Entrega a OS: baixa as peças, recebe e fecha
create or replace function finalizar_os(p_os uuid, p_pagamentos jsonb)
returns ordens_servico language plpgsql as $$
declare o ordens_servico; it record; v_aberto numeric;
begin
  select * into o from ordens_servico where id = p_os for update;
  if not found then raise exception 'OS não encontrada'; end if;
  if o.status in ('entregue', 'cancelada') then raise exception 'OS já encerrada'; end if;

  for it in select * from os_itens where os_id = p_os and tipo = 'peca' loop
    update os_itens set custo_unitario = (select custo from produtos where id = it.produto_id)
      where id = it.id;
    insert into movimentos_estoque (empresa_id, produto_id, tipo, quantidade, origem, origem_id)
    values (o.empresa_id, it.produto_id, 'saida', -it.quantidade, 'os', p_os);
  end loop;

  v_aberto := _registrar_pagamentos(o.empresa_id, 'os', p_os, o.cliente_id, o.total, p_pagamentos);

  update ordens_servico set status = 'entregue', data_entrega = now(), pago = (v_aberto = 0)
  where id = p_os returning * into o;
  return o;
end $$;

-- Converte orçamento em venda ou OS
create or replace function converter_orcamento(p_orcamento uuid, p_destino origem_documento,
                                               p_tipo_venda tipo_venda default 'normal')
returns uuid language plpgsql as $$
declare o orcamentos; v_id uuid;
begin
  select * into o from orcamentos where id = p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;
  if o.status not in ('aberto', 'aprovado') then
    raise exception 'Orçamento % não pode ser convertido (status %)', o.numero, o.status;
  end if;

  if p_destino = 'venda' then
    insert into vendas (empresa_id, tipo, cliente_id, orcamento_id)
    values (o.empresa_id, p_tipo_venda, o.cliente_id, o.id) returning id into v_id;
    insert into venda_itens (venda_id, produto_id, quantidade, preco_unitario)
    select v_id, produto_id, quantidade,
           case when p_tipo_venda = 'troca' then coalesce(preco_troca, preco_normal) else preco_normal end
    from orcamento_itens where orcamento_id = o.id and tipo = 'peca' and produto_id is not null;
  elsif p_destino = 'os' then
    insert into ordens_servico (empresa_id, cliente_id, veiculo_id, orcamento_id, observacao)
    values (o.empresa_id, o.cliente_id, o.veiculo_id, o.id, o.observacao) returning id into v_id;
    insert into os_itens (os_id, tipo, produto_id, servico_id, descricao, quantidade, preco_unitario)
    select v_id, tipo, produto_id, servico_id, descricao, quantidade,
           case when p_tipo_venda = 'troca' then coalesce(preco_troca, preco_normal) else preco_normal end
    from orcamento_itens where orcamento_id = o.id;
  else
    raise exception 'Destino inválido: use venda ou os';
  end if;

  update orcamentos set status = 'convertido', convertido_em = p_destino, convertido_id = v_id
  where id = o.id;
  return v_id;
end $$;

-- Cancela venda ou OS estornando estoque e pagamentos (nada é apagado)
create or replace function cancelar_documento(p_origem origem_documento, p_id uuid, p_motivo text)
returns void language plpgsql as $$
declare m record; v_emp uuid;
begin
  if p_origem = 'venda' then
    update vendas set status = 'cancelada' where id = p_id and status <> 'cancelada'
      returning empresa_id into v_emp;
  elsif p_origem = 'os' then
    update ordens_servico set status = 'cancelada' where id = p_id and status <> 'cancelada'
      returning empresa_id into v_emp;
  else
    raise exception 'Só venda ou OS podem ser canceladas aqui';
  end if;
  if v_emp is null then raise exception 'Documento não encontrado ou já cancelado'; end if;

  for m in select produto_id, sum(quantidade) q from movimentos_estoque
           where origem = p_origem and origem_id = p_id group by produto_id loop
    if m.q <> 0 then
      insert into movimentos_estoque (empresa_id, produto_id, tipo, quantidade, origem, origem_id, observacao)
      values (v_emp, m.produto_id, 'estorno', -m.q, p_origem, p_id, p_motivo);
    end if;
  end loop;

  update pagamentos set estornado = true where origem = p_origem and origem_id = p_id;
  update contas_receber set status = 'cancelada' where origem = p_origem and origem_id = p_id;
end $$;

-- Baixa de conta a receber (fiado)
create or replace function receber_conta(p_conta uuid, p_valor numeric, p_forma uuid)
returns contas_receber language plpgsql as $$
declare c contas_receber;
begin
  select * into c from contas_receber where id = p_conta for update;
  if not found then raise exception 'Conta não encontrada'; end if;
  if c.status in ('quitada', 'cancelada') then raise exception 'Conta já encerrada'; end if;
  if p_valor <= 0 or p_valor > c.valor - c.valor_pago then
    raise exception 'Valor deve ficar entre 0,01 e %', c.valor - c.valor_pago;
  end if;
  insert into pagamentos (empresa_id, origem, origem_id, conta_receber_id, forma_id, valor)
  values (c.empresa_id, 'manual', c.origem_id, c.id, p_forma, p_valor);
  update contas_receber set
    valor_pago = valor_pago + p_valor,
    status = (case when valor_pago + p_valor >= valor then 'quitada' else 'parcial' end)::status_conta
  where id = p_conta returning * into c;

  if c.status = 'quitada' and c.origem = 'venda'
     and not exists (select 1 from contas_receber where origem_id = c.origem_id and status in ('aberta','parcial')) then
    update vendas set status = 'paga' where id = c.origem_id;
  elsif c.status = 'quitada' and c.origem = 'os' then
    update ordens_servico set pago = true where id = c.origem_id;
  end if;
  return c;
end $$;

-- Link de WhatsApp (AppSheet: ações Whatapp PC / SmartPhone)
create or replace function link_whatsapp(p_telefone text, p_mensagem text default '')
returns text language sql immutable as $$
  select 'https://wa.me/55' || regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')
         || case when coalesce(p_mensagem, '') <> ''
                 then '?text=' || replace(replace(replace(p_mensagem, '%', '%25'), ' ', '%20'), E'\n', '%0A')
                 else '' end
$$;

-- =====================================================================
-- Segurança (RLS): cada usuário vê só as empresas das quais é membro
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['clientes','veiculos','mecanicos','formas_pagamento','servicos_catalogo',
                           'produtos','movimentos_estoque','contadores','vendas','ordens_servico',
                           'orcamentos','pagamentos','contas_receber','despesas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to authenticated using (empresa_id in (select minhas_empresas()))
                    with check (empresa_id in (select minhas_empresas()))', t || '_empresa', t);
  end loop;
end $$;

-- itens herdam do cabeçalho
alter table venda_itens enable row level security;
create policy venda_itens_empresa on venda_itens for all to authenticated
  using (exists (select 1 from vendas v where v.id = venda_id and v.empresa_id in (select minhas_empresas())))
  with check (exists (select 1 from vendas v where v.id = venda_id and v.empresa_id in (select minhas_empresas())));

alter table os_itens enable row level security;
create policy os_itens_empresa on os_itens for all to authenticated
  using (exists (select 1 from ordens_servico o where o.id = os_id and o.empresa_id in (select minhas_empresas())))
  with check (exists (select 1 from ordens_servico o where o.id = os_id and o.empresa_id in (select minhas_empresas())));

alter table orcamento_itens enable row level security;
create policy orcamento_itens_empresa on orcamento_itens for all to authenticated
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and o.empresa_id in (select minhas_empresas())))
  with check (exists (select 1 from orcamentos o where o.id = orcamento_id and o.empresa_id in (select minhas_empresas())));

-- dono da empresa? (security definer evita recursão nas políticas de membros)
create or replace function sou_dono(p_empresa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membros where empresa_id = p_empresa
                 and user_id = auth.uid() and papel = 'dono')
$$;

alter table empresas enable row level security;
create policy empresas_membro on empresas for select to authenticated using (id in (select minhas_empresas()));
create policy empresas_dono on empresas for update to authenticated using (sou_dono(id));

alter table membros enable row level security;
create policy membros_ver on membros for select to authenticated using (empresa_id in (select minhas_empresas()));
create policy membros_dono on membros for all to authenticated using (sou_dono(empresa_id))
  with check (sou_dono(empresa_id));

-- =====================================================================
-- Onboarding: cria a empresa e as formas de pagamento padrão do AppSheet
-- =====================================================================
create or replace function criar_empresa(p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_emp uuid;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  insert into empresas (nome) values (p_nome) returning id into v_emp;
  insert into membros (empresa_id, user_id, papel) values (v_emp, auth.uid(), 'dono');
  insert into formas_pagamento (empresa_id, descricao, gera_conta_receber) values
    (v_emp, 'Dinheiro', false), (v_emp, 'Pix', false),
    (v_emp, 'Cartão', false),   (v_emp, 'Receber depois', true);
  return v_emp;
end $$;

-- =====================================================================
-- Fotos de produtos (Storage): leitura pública, gravação só na pasta da própria empresa
-- =====================================================================
insert into storage.buckets (id, name, public) values ('produtos', 'produtos', true) on conflict do nothing;
create policy produtos_fotos_ler on storage.objects for select using (bucket_id = 'produtos');
create policy produtos_fotos_gravar on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and (storage.foldername(name))[1]::uuid in (select minhas_empresas()));

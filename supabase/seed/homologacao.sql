-- =====================================================================
-- Oficina Moto — dados de HOMOLOGAÇÃO
--
-- Cria uma oficina fictícia completa ("Moto Center (Homologação)") com
-- ~75 dias de histórico, usando as próprias funções de negócio do banco
-- (finalizar_venda, finalizar_os, converter_orcamento, receber_conta,
-- cancelar_documento, ajustar_estoque...), para que estoque, financeiro,
-- numeração e fiado fiquem 100% consistentes.
--
-- COMO USAR
--   1. Crie o usuário de teste no Supabase (Authentication → Users → Add user)
--      ou cadastre-se pelo app. Use um usuário SÓ PARA TESTE: o app abre a
--      primeira empresa do usuário, então ele não pode ser membro de outra.
--   2. Ajuste os parâmetros logo abaixo (e-mail do dono, opcionais de balcão/mecânico).
--   3. Cole o arquivo inteiro no SQL Editor e rode. Pode rodar de novo:
--      a oficina de homologação anterior é apagada e recriada.
--   4. Para remover tudo: supabase/seed/limpar_homologacao.sql
--
-- O QUE É GERADO (datas relativas ao dia em que o script roda)
--   Cadastros  3 mecânicos (1 inativo), 6 formas de pagamento (1 inativa),
--              16 serviços (1 inativo), 35 produtos (1 inativo, 1 sem código de barras),
--              16 clientes (1 PJ/frota, 1 só com nome+WhatsApp, 1 sem moto), 19 motos.
--   Estoque    estoque inicial (D-75), 2ª compra com reajuste de custo/preço (D-32),
--              inventário com ajustes (D-7): itens abaixo do mínimo e 1 zerado.
--   Vendas     ~60 vendas no histórico: Pix, dinheiro com troco, cartão, pagamento
--              misto, com desconto, venda com troca (mecânico), fiado, 1 cancelada
--              com estorno, 1 carrinho vindo de orçamento aguardando finalização.
--   OS         ~25 entregues no histórico + OS atuais em todos os status
--              (aberta, em execução, aguardando peça, pronta, entregue, cancelada).
--   Orçamentos aberto, aberto vencido, aprovado, recusado, cancelado,
--              convertido em OS e convertido em venda (normal e troca).
--   Financeiro contas a receber abertas, parciais, quitadas e vencidas;
--              despesas mensais das 4 categorias.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- PARÂMETROS — ajuste aqui
-- ---------------------------------------------------------------------
create temp table _param on commit drop as select
  'homologacao@oficinamoto.test'::text  as email_dono,      -- obrigatório: usuário já criado no Auth
  null::text                            as email_balcao,    -- opcional: outro usuário, papel balcão
  null::text                            as email_mecanico,  -- opcional: outro usuário, papel mecânico (vinculado ao Rafael)
  'Moto Center (Homologação)'::text     as nome_empresa;

-- ---------------------------------------------------------------------
-- Auxiliares (temporários, somem ao fechar a sessão)
-- ---------------------------------------------------------------------
create temp table _ctx (empresa uuid, usuario uuid) on commit drop;

create or replace function pg_temp.emp() returns uuid language sql as $$ select empresa from _ctx $$;

-- data local + hora → timestamptz no fuso de São Paulo
create or replace function pg_temp.ts(p_dia date, p_hora time) returns timestamptz
language sql as $$ select (p_dia + p_hora) at time zone 'America/Sao_Paulo' $$;

create or replace function pg_temp.dia(p_ts timestamptz) returns date
language sql as $$ select (p_ts at time zone 'America/Sao_Paulo')::date $$;

-- CPF com dígitos verificadores válidos a partir de 9 dígitos
create or replace function pg_temp.cpf(p text) returns text language plpgsql as $$
declare s int := 0; d1 int; d2 int;
begin
  for i in 1..9 loop s := s + substr(p, i, 1)::int * (11 - i); end loop;
  d1 := 11 - s % 11; if d1 >= 10 then d1 := 0; end if;
  s := 0;
  for i in 1..9 loop s := s + substr(p, i, 1)::int * (12 - i); end loop;
  s := s + d1 * 2;
  d2 := 11 - s % 11; if d2 >= 10 then d2 := 0; end if;
  return p || d1 || d2;
end $$;

-- EAN-13 válido a partir de 12 dígitos
create or replace function pg_temp.ean(p text) returns text language plpgsql as $$
declare s int := 0;
begin
  if p is null then return null; end if;
  for i in 1..12 loop s := s + substr(p, i, 1)::int * (case when i % 2 = 0 then 3 else 1 end); end loop;
  return p || ((10 - s % 10) % 10);
end $$;

create or replace function pg_temp.forma(p text) returns uuid language sql as $$
  select id from formas_pagamento where empresa_id = pg_temp.emp() and descricao = p
$$;

create or replace function pg_temp.prod(p_sku text) returns produtos language sql as $$
  select * from produtos where empresa_id = pg_temp.emp() and sku = p_sku
$$;

create or replace function pg_temp.saldo(p_sku text) returns numeric language sql as $$
  select coalesce(sum(m.quantidade), 0) from movimentos_estoque m
  join produtos p on p.id = m.produto_id
  where p.empresa_id = pg_temp.emp() and p.sku = p_sku
$$;

-- todos os itens-peça têm saldo suficiente?
create or replace function pg_temp.tem_estoque(p_itens jsonb) returns boolean language sql as $$
  select not exists (
    select 1 from jsonb_array_elements(p_itens) e
    where e ? 'sku' and pg_temp.saldo(e->>'sku') < coalesce((e->>'q')::numeric, 1) + 3)  -- folga p/ os cenários fixos
$$;

-- Monta o jsonb de pagamentos que as funções do banco esperam.
-- Cada elemento: {"f":"Pix","v":50}  valor fixo
--                {"f":"Pix"}         o restante do total
--                {"f":"Dinheiro","arred":10}  restante arredondado p/ cima (gera troco)
create or replace function pg_temp.pagamentos(p_total numeric, p_spec jsonb) returns jsonb
language plpgsql as $$
declare e jsonb; r jsonb := '[]'; usado numeric := 0; v numeric;
begin
  for e in select * from jsonb_array_elements(coalesce(p_spec, '[]')) loop
    if e ? 'v' then
      v := (e->>'v')::numeric;
    else
      v := greatest(p_total - usado, 0);
      if e ? 'arred' then v := ceil(v / (e->>'arred')::numeric) * (e->>'arred')::numeric; end if;
    end if;
    if v > 0 then
      r := r || jsonb_build_array(jsonb_build_object('forma_id', pg_temp.forma(e->>'f'), 'valor', v));
    end if;
    usado := usado + v;
  end loop;
  return r;
end $$;

-- Leva para a data histórica tudo que as funções gravaram com "agora"
create or replace function pg_temp.retroagir(p_origem origem_documento, p_id uuid, p_ts timestamptz)
returns void language plpgsql as $$
declare d date := pg_temp.dia(p_ts);
begin
  update pagamentos set data = d, criado_em = p_ts
   where origem = p_origem and origem_id = p_id and conta_receber_id is null;
  update movimentos_estoque set criado_em = p_ts
   where origem = p_origem and origem_id = p_id and tipo = 'saida';
  update contas_receber set criado_em = p_ts, vencimento = d + 30
   where origem = p_origem and origem_id = p_id;
  if p_origem = 'venda' then
    update vendas set data = d, criado_em = p_ts - interval '4 min', finalizado_em = p_ts where id = p_id;
  elsif p_origem = 'os' then
    update ordens_servico set data_entrega = p_ts where id = p_id;
  end if;
end $$;

-- Venda finalizada. p_itens: [{"sku":"OLE002","q":1}, ...]
create or replace function pg_temp.venda(p_ts timestamptz, p_cliente text, p_itens jsonb, p_pag jsonb,
                                         p_tipo tipo_venda default 'normal', p_mecanico text default null,
                                         p_desconto numeric default 0)
returns uuid language plpgsql as $$
declare v uuid; e jsonb; p produtos; t numeric;
begin
  insert into vendas (empresa_id, tipo, cliente_id, mecanico_id)
  values (pg_temp.emp(), p_tipo,
          (select id from clientes  where empresa_id = pg_temp.emp() and nome = p_cliente),
          (select id from mecanicos where empresa_id = pg_temp.emp() and nome = p_mecanico))
  returning id into v;
  for e in select * from jsonb_array_elements(p_itens) loop
    p := pg_temp.prod(e->>'sku');
    insert into venda_itens (venda_id, produto_id, quantidade, preco_unitario)
    values (v, p.id, coalesce((e->>'q')::numeric, 1),
            case when p_tipo = 'troca' then p.preco_troca else p.preco_venda end);
  end loop;
  if p_desconto > 0 then update vendas set desconto = p_desconto where id = v; end if;
  select total into t from vendas where id = v;
  perform finalizar_venda(v, pg_temp.pagamentos(t, p_pag));
  perform pg_temp.retroagir('venda', v, p_ts);
  return v;
end $$;

-- Itens de OS: [{"s":"Troca de óleo"}, {"s":"...","p":150}, {"sku":"OLE002","q":1}]
create or replace function pg_temp.itens_os(p_os uuid, p_itens jsonb, p_mecanico uuid) returns void
language plpgsql as $$
declare e jsonb; s servicos_catalogo; p produtos;
begin
  for e in select * from jsonb_array_elements(coalesce(p_itens, '[]')) loop
    if e ? 's' then
      select * into s from servicos_catalogo where empresa_id = pg_temp.emp() and descricao = e->>'s';
      insert into os_itens (os_id, tipo, servico_id, descricao, mecanico_id, quantidade, preco_unitario)
      values (p_os, 'servico', s.id, s.descricao, p_mecanico, coalesce((e->>'q')::numeric, 1),
              coalesce((e->>'p')::numeric, s.preco));
    else
      p := pg_temp.prod(e->>'sku');
      insert into os_itens (os_id, tipo, produto_id, descricao, mecanico_id, quantidade, preco_unitario)
      values (p_os, 'peca', p.id, p.nome, p_mecanico, coalesce((e->>'q')::numeric, 1), p.preco_venda);
    end if;
  end loop;
end $$;

create or replace function pg_temp.os(p_placa text, p_mecanico text, p_status status_os, p_entrada timestamptz,
                                      p_defeito text, p_diag text, p_itens jsonb,
                                      p_pag jsonb default null, p_entrega timestamptz default null,
                                      p_desconto numeric default 0, p_km int default null, p_obs text default null)
returns uuid language plpgsql as $$
declare o uuid; vei veiculos; mec uuid; t numeric;
begin
  select * into vei from veiculos where empresa_id = pg_temp.emp() and placa = p_placa;
  select id into mec from mecanicos where empresa_id = pg_temp.emp() and nome = p_mecanico;
  insert into ordens_servico (empresa_id, cliente_id, veiculo_id, mecanico_id, km_entrada, defeito_relatado,
                              diagnostico, observacao, data_entrada, previsao, criado_em)
  values (pg_temp.emp(), vei.cliente_id, vei.id, mec, coalesce(p_km, vei.km_atual), p_defeito,
          p_diag, p_obs, p_entrada, pg_temp.dia(p_entrada) + 1, p_entrada)
  returning id into o;
  perform pg_temp.itens_os(o, p_itens, mec);
  if p_desconto > 0 then update ordens_servico set desconto = p_desconto where id = o; end if;

  if p_status = 'entregue' then
    select total into t from ordens_servico where id = o;
    perform finalizar_os(o, pg_temp.pagamentos(t, p_pag));
    perform pg_temp.retroagir('os', o, p_entrega);
  elsif p_status = 'cancelada' then
    perform cancelar_documento('os', o, coalesce(p_obs, 'Cancelada'));
  elsif p_status <> 'aberta' then
    update ordens_servico set status = p_status where id = o;
  end if;
  return o;
end $$;

-- Orçamento. Itens no mesmo formato da OS.
create or replace function pg_temp.orcamento(p_dia date, p_placa text, p_cliente text, p_status status_orcamento,
                                             p_itens jsonb, p_obs text default null)
returns uuid language plpgsql as $$
declare o uuid; e jsonb; vei veiculos; s servicos_catalogo; p produtos;
begin
  select * into vei from veiculos where empresa_id = pg_temp.emp() and placa = p_placa;
  insert into orcamentos (empresa_id, cliente_id, veiculo_id, data, validade, observacao, criado_em)
  values (pg_temp.emp(),
          coalesce(vei.cliente_id, (select id from clientes where empresa_id = pg_temp.emp() and nome = p_cliente)),
          vei.id, p_dia, p_dia + 7, p_obs, pg_temp.ts(p_dia, '10:30'))
  returning id into o;
  for e in select * from jsonb_array_elements(p_itens) loop
    if e ? 's' then
      select * into s from servicos_catalogo where empresa_id = pg_temp.emp() and descricao = e->>'s';
      insert into orcamento_itens (orcamento_id, tipo, servico_id, descricao, quantidade, preco_normal, preco_troca)
      values (o, 'servico', s.id, s.descricao, coalesce((e->>'q')::numeric, 1),
              coalesce((e->>'p')::numeric, s.preco), coalesce((e->>'p')::numeric, s.preco));
    else
      p := pg_temp.prod(e->>'sku');
      insert into orcamento_itens (orcamento_id, tipo, produto_id, descricao, quantidade, preco_normal, preco_troca)
      values (o, 'peca', p.id, p.nome, coalesce((e->>'q')::numeric, 1), p.preco_venda, p.preco_troca);
    end if;
  end loop;
  if p_status not in ('aberto', 'convertido') then
    update orcamentos set status = p_status where id = o;
  end if;
  return o;
end $$;

-- ---------------------------------------------------------------------
-- Catálogos de referência
-- ---------------------------------------------------------------------
create temp table _prod (
  sku text, ean12 text, nome text, custo numeric, margem numeric, troca numeric,
  minimo numeric, qtd numeric, balcao boolean, ativo boolean default true
) on commit drop;

insert into _prod values
  -- óleos e fluidos
  ('OLE001','789100000001','Óleo Motul 5100 15W50 1L',                38.50,  60,  52.00, 10, 40, true, true),
  ('OLE002','789100000002','Óleo Mobil Super Moto 20W50 1L',          22.90,  70,  33.00, 12, 60, true, true),
  ('OLE003','789100000003','Óleo Castrol Actevo 10W30 1L',            29.90,  65,  42.00, 10, 36, true, true),
  ('FLU001','789100000004','Fluido de freio DOT 4 200ml',             14.50,  80,  22.00,  6, 18, true, true),
  ('LUB001','789100000005','Lubrificante de corrente spray 300ml',    19.90,  75,  29.00,  5, 15, true, true),
  -- filtros
  ('FIL001','789100000006','Filtro de óleo CG 150/160 / Titan',        9.80, 120,  18.00, 10, 40, true, true),
  ('FIL002','789100000007','Filtro de óleo Fazer 250 / Lander',       14.20, 110,  25.00,  6, 20, true, true),
  ('FIL003','789100000008','Filtro de ar CG 160',                     18.90,  90,  30.00,  5, 15, true, true),
  ('FIL004','789100000009','Filtro de ar Factor 150',                 21.50,  85,  34.00,  4, 10, false, true),
  -- freio
  ('FRE001','789100000010','Pastilha de freio dianteira CG 160 / Bros',24.90, 80,  38.00,  8, 30, true, true),
  ('FRE002','789100000011','Pastilha de freio dianteira Fazer 250',   32.00,  75,  48.00,  6, 16, true, true),
  ('FRE003','789100000012','Lona de freio traseira CG / Titan',       19.50,  85,  31.00,  6, 20, true, true),
  ('FRE004','789100000013','Disco de freio dianteiro CB 300',        145.00,  55, 199.00,  2,  4, false, true),
  -- transmissão
  ('REL001','789100000014','Kit relação CG 160 (coroa, pinhão e corrente)', 98.00, 60, 140.00, 4, 14, false, true),
  ('REL002','789100000015','Kit relação Fazer 250',                  189.00,  50, 255.00,  2,  6, false, true),
  ('REL003','789100000016','Kit relação Biz 125',                     79.00,  60, 112.00,  3,  8, false, true),
  -- elétrica
  ('VEL001','789100000017','Vela de ignição NGK CR7HSA',              13.90,  90,  22.00, 10, 40, true, true),
  ('VEL002','789100000018','Vela de ignição NGK DPR8EA-9',            18.50,  85,  29.00,  6, 20, true, true),
  ('BAT001','789100000019','Bateria Moura 5Ah MA5-D',                135.00,  50, 185.00,  3,  8, false, true),
  ('BAT002','789100000020','Bateria Heliar 6Ah selada',              159.00,  45, 210.00,  2,  5, false, true),
  ('LAM001','789100000021','Lâmpada farol H4 35/35W',                  9.90, 120,  17.00, 10, 30, true, true),
  ('LAM002','789100000022','Lâmpada pisca 12V 10W (par)',              3.50, 150,   7.00, 10, 50, true, true),
  -- cabos
  ('CAB001','789100000023','Cabo de embreagem CG 160',                17.80,  90,  28.00,  5, 15, true, true),
  ('CAB002','789100000024','Cabo de acelerador CG 160',               15.90,  90,  25.00,  5, 15, true, true),
  -- pneus
  ('PNE001','789100000025','Pneu traseiro 90/90-18 Pirelli Super City',189.00, 40, 245.00, 3, 10, false, true),
  ('PNE002','789100000026','Pneu dianteiro 80/100-18 Pirelli Super City',155.00,40, 205.00, 3, 10, false, true),
  ('PNE003','789100000027','Pneu traseiro 130/70-17 Metzeler',       389.00,  35, 489.00,  2,  4, false, true),
  ('CAM001','789100000028','Câmara de ar aro 18',                     24.00,  80,  37.00,  6, 20, true, true),
  -- diversos
  ('RET001','789100000029','Retrovisor CG 160 (par)',                 34.90,  80,  55.00,  3, 10, true, true),
  ('MAN001','789100000030','Manopla CG (par)',                        15.00, 100,  26.00,  4, 12, true, true),
  ('JUN001','789100000031','Junta do cabeçote CG 150',                12.50, 100,  22.00,  3,  6, false, true),
  ('ROL001','789100000032','Rolamento de roda 6301 2RS',              11.90, 100,  20.00,  8, 24, true, true),
  ('PAR001','789100000033','Parafuso de dreno com arruela',            4.20, 150,   9.00, 10,  3, false, true),
  ('ADE001', null,         'Kit adesivos tanque Titan (sem código)',  45.00, 100,  70.00,  0,  5, false, true),
  ('ESC001','789100000035','Escapamento esportivo CG 160 (descontinuado)', 289.00, 40, 380.00, 0, 0, false, false);

create temp table _cli (
  n int, nome text, cpf9 text, whats text, cep text, endereco text, numero text, bairro text, compl text, obs text
) on commit drop;

insert into _cli values
  ( 1,'João Pedro Almeida',        '352718940','19991000001','13015-001','Rua Barão de Jaguara','1120','Centro',null,null),
  ( 2,'Mariana Costa Ribeiro',     '418273650','19991000002','13025-050','Rua Coronel Quirino','455','Cambuí','Apto 32',null),
  ( 3,'Eduardo Ferreira Santos',   '527381946','19991000003','13087-000','Av. Dr. Heitor Penteado','2300','Taquaral',null,'Tem duas motos'),
  ( 4,'Ana Paula Moreira',         '615294738','19991000004','13060-100','Rua Abolição','87','Vila Industrial',null,null),
  ( 5,'Lucas Gabriel Rocha',       '734918265','19991000005','13084-010','Av. Albino J. B. de Oliveira','980','Barão Geraldo',null,null),
  ( 6,'Fernanda Oliveira Lima',    '829374615','19991000006','13070-020','Rua Dr. Quirino','15','Bonfim','Casa 2',null),
  ( 7,'Roberto Antunes Silva',     '938172654','19991000007','13050-300','Rua das Palmeiras','312','Jardim Proença',null,'Prefere contato à tarde'),
  ( 8,'Patrícia Mendes Duarte',    '146283759','19991000008','13033-500','Rua Antônio Carlos Couto de Barros','64','Swift',null,null),
  ( 9,'Gustavo Henrique Prado',    '253917486','19991000009','13070-480','Av. Andrade Neves','1500','Castelo',null,'Usa a moto para trilha nos fins de semana'),
  (10,'Juliana Teixeira Campos',   '361847295','19991000010','13026-200','Rua Maria Monteiro','777','Cambuí','Apto 101',null),
  (11,'Marcos Vinícius Barbosa',   '472619358','19991000011','13045-000','Rua Pedro Domingos Vitali','230','Jardim Chapadão',null,'Moto antiga, sempre pede peça paralela'),
  (12,'Thiago Rodrigues Pires',    '583726149','19991000012','13090-760','Av. Brasil','3100','Jardim Guanabara',null,null),
  (13,'Camila Souza Azevedo',      '694183527','19991000013','13010-111','Rua Conceição','51','Centro',null,'Só compra peças no balcão'),
  (14,'Entregas Rápidas Campinas ME', null,    '19991000014','13069-010','Av. Lix da Cunha','1890','Jardim Pacaembu','Galpão 3','Frota de 3 motos. CNPJ 12.345.678/0001-95. Faturar quinzenal.'),
  (15,'Wellington Dias Moura',     '815372946','19991000015','13056-400','Rua Cristóvão Colombo','402','Jardim Campos Elíseos',null,'Histórico de atraso no pagamento — confirmar antes de vender a receber'),
  (16,'Beatriz Lopes Carvalho',    null,       '19991000016',null,null,null,null,null,null);

create temp table _vei (cliente int, placa text, marca text, modelo text, ano int, cor text, km int) on commit drop;
insert into _vei values
  ( 1,'FJP1A21','Honda','CG 160 Fan',2021,'Vermelha',23450),
  ( 2,'GMC2B19','Honda','Biz 125',2019,'Branca',18200),
  ( 3,'EFS3C20','Yamaha','Fazer 250',2020,'Azul',31800),
  ( 3,'EFS4D14','Honda','CB 300R',2014,'Preta',52300),
  ( 4,'APM5E22','Honda','Pop 110i',2022,'Vermelha',7400),
  ( 5,'LGR6F23','Honda','CG 160 Titan',2023,'Cinza',11900),
  ( 6,'FOL7G22','Yamaha','NMax 160',2022,'Cinza',15600),
  ( 7,'RAS8H18','Honda','NXR 160 Bros',2018,'Vermelha',46700),
  ( 8,'PMD9J20','Yamaha','Factor 150',2020,'Preta',27300),
  ( 9,'GHP1K19','Honda','XRE 300',2019,'Branca',38900),
  (10,'JTC2L23','Honda','PCX 160',2023,'Branca',6100),
  (11,'MVB3412','Honda','CG 150 Titan',2012,'Prata',87400),
  (12,'TRP4N21','Yamaha','Lander 250',2021,'Azul',19800),
  (14,'ERC5P22','Honda','CG 160 Cargo',2022,'Branca',41200),
  (14,'ERC6Q22','Honda','CG 160 Cargo',2022,'Branca',39800),
  (14,'ERC7R21','Honda','CG 160 Fan',2021,'Branca',58100),
  (15,'WDM8S16','Yamaha','Fazer 150',2016,'Preta',61200),
  (16,'BLC9T24','Honda','CG 160 Start',2024,'Vermelha',2300),
  ( 5,'LGR0U09','Honda','CG 125 Fan',2009,'Preta',null);   -- moto antiga sem km informado

-- =====================================================================
-- Geração
-- =====================================================================
do $$
declare
  prm record; v_user uuid; v_emp uuid; v_ret uuid; r record;
  hoje date := current_date;
  dia date; ts timestamptz; ts2 timestamptz;
  i int; j int; k int; v_n int; q numeric; t numeric;
  v_sku text; cli text; mec text; placa_ text; pac int; km int;
  itens jsonb; pag jsonb; defeito text; diag text;
  v_orc uuid; v_os uuid; v_venda uuid;
  pacotes jsonb := '[
    {"d":"Troca de óleo e filtro",                 "g":"Óleo vencido, troca preventiva",
     "i":[{"s":"Troca de óleo"},{"sku":"OLE002"},{"sku":"FIL001"}]},
    {"d":"Freio dianteiro fraco, fazendo barulho", "g":"Pastilhas no fim, disco ok",
     "i":[{"s":"Troca de pastilha de freio"},{"sku":"FRE001"},{"sku":"FLU001"}]},
    {"d":"Relação fazendo barulho e pulando",      "g":"Kit relação gasto, corrente esticada no limite",
     "i":[{"s":"Troca de kit relação"},{"sku":"REL001"}]},
    {"d":"Farol fraco e moto falhando na partida", "g":"Lâmpada queimada e vela carbonizada",
     "i":[{"s":"Revisão elétrica"},{"sku":"LAM001"},{"sku":"VEL001"}]},
    {"d":"Pneu traseiro careca",                   "g":"Pneu abaixo do TWI, câmara ressecada",
     "i":[{"s":"Troca de pneu (por roda)"},{"sku":"PNE001"},{"sku":"CAM001"}]},
    {"d":"Revisão dos 10.000 km",                  "g":"Revisão completa conforme manual",
     "i":[{"s":"Revisão geral"},{"sku":"OLE001"},{"sku":"FIL001"},{"sku":"FIL003"},{"sku":"VEL001"},{"s":"Regulagem e lubrificação de corrente"}]},
    {"d":"Embreagem dura",                         "g":"Cabo de embreagem desfiado",
     "i":[{"s":"Troca de cabo de embreagem"},{"sku":"CAB001"},{"s":"Regulagem e lubrificação de corrente"}]}
  ]';
begin
  perform setseed(0.42);   -- mesmos dados a cada execução
  select * into prm from _param;

  -- ---------- usuário e empresa -------------------------------------
  select id into v_user from auth.users where lower(email) = lower(prm.email_dono);
  if v_user is null then
    raise exception 'Usuário % não existe. Crie em Authentication → Users (ou cadastre-se no app) e rode de novo.', prm.email_dono;
  end if;

  -- recria do zero: apaga em ordem de dependência (algumas FKs não têm cascade)
  delete from pagamentos         where empresa_id in (select id from empresas where nome = prm.nome_empresa);
  delete from contas_receber     where empresa_id in (select id from empresas where nome = prm.nome_empresa);
  delete from despesas           where empresa_id in (select id from empresas where nome = prm.nome_empresa);
  delete from movimentos_estoque where empresa_id in (select id from empresas where nome = prm.nome_empresa);
  delete from ordens_servico     where empresa_id in (select id from empresas where nome = prm.nome_empresa);
  delete from vendas             where empresa_id in (select id from empresas where nome = prm.nome_empresa);
  delete from orcamentos         where empresa_id in (select id from empresas where nome = prm.nome_empresa);
  delete from empresas           where nome = prm.nome_empresa;

  if exists (select 1 from membros where user_id = v_user) then
    raise exception 'O usuário % já pertence a outra oficina. O app abre a primeira empresa do usuário; use um usuário exclusivo para homologação.', prm.email_dono;
  end if;

  insert into empresas (nome, cnpj, telefone, permite_estoque_negativo, criado_em)
  values (prm.nome_empresa, '00.000.000/0001-91', '1932000000', false, pg_temp.ts(hoje - 125, '08:00'))
  returning id into v_emp;
  insert into _ctx values (v_emp, v_user);
  insert into membros (empresa_id, user_id, papel) values (v_emp, v_user, 'dono');

  -- ---------- cadastros básicos ------------------------------------
  insert into formas_pagamento (empresa_id, descricao, gera_conta_receber, taxa_pct, ativo) values
    (v_emp, 'Dinheiro',          false, 0,    true),
    (v_emp, 'Pix',               false, 0,    true),
    (v_emp, 'Cartão',            false, 2.99, true),
    (v_emp, 'Cartão de crédito parcelado', false, 4.99, true),
    (v_emp, 'Receber depois',    true,  0,    true),
    (v_emp, 'Cheque',            false, 0,    false);

  insert into mecanicos (empresa_id, nome, telefone, comissao_pct, ativo, criado_em) values
    (v_emp, 'Carlos Henrique Souza', '19992000001', 30, true, pg_temp.ts(hoje - 125, '08:00')),
    (v_emp, 'Rafael Lima',           '19992000002', 25, true, pg_temp.ts(hoje - 125, '08:00')),
    (v_emp, 'Diego Martins',         '19992000003', 20, true, pg_temp.ts(hoje - 125, '08:00'));  -- inativado no fim

  insert into servicos_catalogo (empresa_id, descricao, preco, tempo_min, ativo) values
    (v_emp, 'Troca de óleo',                         30.00,  20, true),
    (v_emp, 'Revisão geral',                        180.00, 180, true),
    (v_emp, 'Troca de pastilha de freio',            40.00,  30, true),
    (v_emp, 'Troca de lona de freio',                45.00,  40, true),
    (v_emp, 'Troca de kit relação',                  70.00,  60, true),
    (v_emp, 'Regulagem e lubrificação de corrente',  25.00,  15, true),
    (v_emp, 'Troca de pneu (por roda)',              35.00,  30, true),
    (v_emp, 'Revisão elétrica',                      60.00,  60, true),
    (v_emp, 'Limpeza de carburador',                 90.00,  90, true),
    (v_emp, 'Limpeza de bicos injetores',           120.00,  90, true),
    (v_emp, 'Troca de cabo de embreagem',            30.00,  20, true),
    (v_emp, 'Troca de bateria',                      15.00,  10, true),
    (v_emp, 'Troca de retentor de bengala',         120.00, 120, true),
    (v_emp, 'Retífica de motor (mão de obra)',      650.00, 960, true),
    (v_emp, 'Diagnóstico com scanner',               50.00,  30, true),
    (v_emp, 'Polimento de pintura',                  80.00,  60, false);

  insert into produtos (empresa_id, sku, codigo_barras, nome, custo, margem_pct, preco_troca, estoque_minimo, ativo, criado_em)
  select v_emp, sku, pg_temp.ean(ean12), nome, custo, margem, troca, minimo, ativo, pg_temp.ts(hoje - 76, '09:00')
  from _prod;

  insert into clientes (empresa_id, nome, cpf, whatsapp, cep, endereco, numero, bairro, complemento, observacoes, criado_em)
  select v_emp, nome, case when cpf9 is null then null else pg_temp.cpf(cpf9) end, whats, cep, endereco, numero,
         bairro, compl, obs, pg_temp.ts(hoje - 120 + _cli.n * 3, '10:00')
  from _cli order by _cli.n;

  insert into veiculos (empresa_id, cliente_id, placa, marca, modelo, ano, cor, km_atual, criado_em)
  select v_emp, c.id, v.placa, v.marca, v.modelo, v.ano, v.cor, v.km, c.criado_em
  from _vei v join _cli x on x.n = v.cliente
  join clientes c on c.empresa_id = v_emp and c.nome = x.nome;

  -- ---------- estoque inicial (D-75) -------------------------------
  for r in select p.id, p.custo, x.qtd from produtos p join _prod x on x.sku = p.sku
           where p.empresa_id = v_emp and x.qtd > 0 loop
    v_ret := registrar_entrada(r.id, r.qtd, r.custo, 'Estoque inicial — implantação do sistema');
    update movimentos_estoque set criado_em = pg_temp.ts(hoje - 75, '09:30') where id = v_ret;
  end loop;
  insert into despesas (empresa_id, data_pagamento, valor, forma_id, categoria, descricao, observacao, criado_em)
  select v_emp, hoje - 75, sum(x.custo * x.qtd), pg_temp.forma('Pix'), 'pecas_insumos',
         'Compra de estoque inicial — Distribuidora MotoPeças', 'NF 10233', pg_temp.ts(hoje - 75, '09:30')
  from _prod x where x.qtd > 0;

  -- ---------- histórico: D-60 a D-6 --------------------------------
  for i in 0..54 loop
    dia := hoje - 60 + i;

    -- 2ª compra com reajuste de custo (o preço de venda acompanha pelo trigger)
    if dia = hoje - 32 then
      t := 0;
      for r in select p.id, p.custo, sku_ as sku, q_ as qtd from produtos p
               join (values ('OLE001',24),('OLE002',36),('OLE003',12),('FIL001',30),('FRE001',20),
                            ('VEL001',24),('CAM001',10),('PNE001',6),('REL001',6),('LAM001',12)) v(sku_, q_)
                 on v.sku_ = p.sku
               where p.empresa_id = v_emp loop
        v_ret := registrar_entrada(r.id, r.qtd, round(r.custo * 1.06, 2), 'NF 10871 — reajuste de 6% do fornecedor');
        update movimentos_estoque set criado_em = pg_temp.ts(dia, '08:15') where id = v_ret;
        t := t + round(r.custo * 1.06, 2) * r.qtd;
      end loop;
      insert into despesas (empresa_id, data_pagamento, valor, forma_id, categoria, descricao, observacao, criado_em)
      values (v_emp, dia, t, pg_temp.forma('Pix'), 'pecas_insumos', 'Reposição de estoque — Distribuidora MotoPeças',
              'NF 10871', pg_temp.ts(dia, '08:15'));
    end if;

    -- frota da PJ: sempre fiado
    if dia = hoje - 41 then
      perform pg_temp.os('ERC5P22', 'Rafael Lima', 'entregue', pg_temp.ts(dia, '07:50'),
        'Revisão periódica da frota', 'Revisão completa', pacotes->5->'i', '[{"f":"Receber depois"}]',
        pg_temp.ts(dia, '16:40'), 0, 40100);
    elsif dia = hoje - 12 then
      perform pg_temp.os('ERC7R21', 'Rafael Lima', 'entregue', pg_temp.ts(dia, '07:50'),
        'Freio dianteiro fraco', 'Pastilhas no fim', pacotes->1->'i', '[{"f":"Receber depois"}]',
        pg_temp.ts(dia, '11:20'), 0, 57900);
    elsif dia = hoje - 50 then   -- fiado que nunca foi pago: fica vencido
      perform pg_temp.venda(pg_temp.ts(dia, '17:30'), 'Wellington Dias Moura',
        '[{"sku":"CAM001"},{"sku":"LUB001"},{"sku":"MAN001"}]', '[{"f":"Receber depois"}]');
    end if;

    continue when extract(isodow from dia) = 7;   -- domingo fechado

    -- vendas de balcão
    v_n := case when extract(isodow from dia) = 6 then floor(random() * 2) else floor(random() * 3) end;
    for j in 1..v_n loop
      ts := pg_temp.ts(dia, '08:00') + (floor(random() * 540) || ' minutes')::interval;
      itens := '[]';
      for k in 1..(1 + floor(random() * 3))::int loop
        select x.sku into v_sku from _prod x
         where x.balcao and x.ativo and pg_temp.saldo(x.sku) >= 4
           and not itens @> jsonb_build_array(jsonb_build_object('sku', x.sku))
         order by random() limit 1;
        exit when v_sku is null;
        q := case when v_sku like 'OLE%' and random() < 0.4 then 2 else 1 end;
        itens := itens || jsonb_build_array(jsonb_build_object('sku', v_sku, 'q', q));
      end loop;
      continue when jsonb_array_length(itens) = 0;

      cli := null; mec := null;
      if random() < 0.55 then select nome into cli from clientes where empresa_id = v_emp order by random() limit 1; end if;

      t := random();
      pag := case
        when t < 0.38 then '[{"f":"Pix"}]'
        when t < 0.58 then '[{"f":"Dinheiro","arred":10}]'
        when t < 0.80 then '[{"f":"Cartão"}]'
        when t < 0.86 then '[{"f":"Dinheiro","v":20},{"f":"Pix"}]'
        when t < 0.90 then '[{"f":"Cartão de crédito parcelado"}]'
        when cli is not null then '[{"f":"Receber depois"}]'
        else '[{"f":"Pix"}]' end::jsonb;

      if random() < 0.15 then   -- venda com troca para mecânico
        select nome into mec from mecanicos where empresa_id = v_emp and (i < 25 or nome <> 'Diego Martins')
         order by random() limit 1;
        perform pg_temp.venda(ts, cli, itens, pag, 'troca', mec);
      else
        perform pg_temp.venda(ts, cli, itens, pag, 'normal', null,
                              case when random() < 0.1 then 5 else 0 end);
      end if;
    end loop;

    -- OS entregues
    if extract(isodow from dia) < 6 and random() < 0.6 then
      select placa into placa_ from veiculos where empresa_id = v_emp order by random() limit 1;
      pac := floor(random() * jsonb_array_length(pacotes));
      itens := pacotes->pac->'i';
      defeito := pacotes->pac->>'d';
      diag := pacotes->pac->>'g';
      if not pg_temp.tem_estoque(itens) then
        itens := '[{"s":"Regulagem e lubrificação de corrente"},{"s":"Diagnóstico com scanner"}]';
        diag := 'Sem defeito aparente, feita regulagem';
      end if;
      select nome into mec from mecanicos where empresa_id = v_emp and (i < 25 or nome <> 'Diego Martins')
       order by random() limit 1;
      ts := pg_temp.ts(dia, '08:00') + (floor(random() * 180) || ' minutes')::interval;
      ts2 := ts + case when random() < 0.6 then interval '6 hours' else interval '1 day 2 hours' end;
      select greatest(coalesce(km_atual, 0) - (60 - i) * 25, 0) into km from veiculos where empresa_id = v_emp and placa = placa_;

      t := random();
      pag := case
        when t < 0.40 then '[{"f":"Pix"}]'
        when t < 0.60 then '[{"f":"Dinheiro","arred":50}]'
        when t < 0.85 then '[{"f":"Cartão"}]'
        when t < 0.90 then '[{"f":"Dinheiro","v":100},{"f":"Cartão"}]'
        else '[{"f":"Receber depois"}]' end::jsonb;

      perform pg_temp.os(placa_, mec, 'entregue', ts, defeito, diag, itens, pag, ts2,
                         case when random() < 0.15 then 10 else 0 end, nullif(km, 0));
    end if;
  end loop;

  -- ---------- baixas de fiado (quitada / parcial / em aberto) -------
  j := 0;
  for r in select id, valor, criado_em from contas_receber
           where empresa_id = v_emp and status = 'aberta' and criado_em < pg_temp.ts(hoje - 15, '00:00')
             and cliente_id <> (select id from clientes where empresa_id = v_emp and nome = 'Wellington Dias Moura')
           order by criado_em loop
    j := j + 1;
    if j % 3 = 1 then        -- quitada
      perform receber_conta(r.id, r.valor, pg_temp.forma('Pix'));
      ts := r.criado_em + interval '12 days';
    elsif j % 3 = 2 then     -- parcial
      perform receber_conta(r.id, round(r.valor / 2, 2), pg_temp.forma('Dinheiro'));
      ts := r.criado_em + interval '8 days';
    else
      continue;              -- fica em aberto (vencida se tiver mais de 30 dias)
    end if;
    update pagamentos set data = pg_temp.dia(ts), criado_em = ts
     where conta_receber_id = r.id and data = current_date;
  end loop;

  -- ---------- venda cancelada com estorno de estoque ----------------
  select venda_id into v_venda from v_extrato_vendas
   where empresa_id = v_emp and status = 'paga' and formas = 'Pix' and data between hoje - 45 and hoje - 38
   order by data limit 1;
  if v_venda is not null then
    perform cancelar_documento('venda', v_venda, 'Cliente devolveu — peça não servia na moto');
    update movimentos_estoque set criado_em = (select finalizado_em + interval '1 day' from vendas where id = v_venda)
     where origem = 'venda' and origem_id = v_venda and tipo = 'estorno';
  end if;

  -- ---------- inventário D-7 ----------------------------------------
  perform ajustar_estoque((pg_temp.prod('LAM002')).id, pg_temp.saldo('LAM002') - 2, 'Inventário — 2 lâmpadas quebradas');
  perform ajustar_estoque((pg_temp.prod('BAT002')).id, 1,  'Inventário — bateria com defeito devolvida ao fornecedor');
  perform ajustar_estoque((pg_temp.prod('CAB002')).id, 3,  'Inventário — diferença de contagem');
  perform ajustar_estoque((pg_temp.prod('FRE004')).id, 0,  'Inventário — sem estoque físico');
  perform ajustar_estoque((pg_temp.prod('MAN001')).id, pg_temp.saldo('MAN001') + 1, 'Inventário — sobra encontrada');
  update movimentos_estoque set criado_em = pg_temp.ts(hoje - 7, '18:00')
   where empresa_id = v_emp and tipo = 'ajuste';

  -- ---------- orçamentos ---------------------------------------------
  perform pg_temp.orcamento(hoje - 25, 'GHP1K19', null, 'recusado',
    '[{"s":"Troca de kit relação"},{"sku":"REL002"},{"s":"Troca de pneu (por roda)","q":2},{"sku":"PNE003"}]',
    'Cliente achou caro, vai pesquisar');
  perform pg_temp.orcamento(hoje - 20, 'WDM8S16', null, 'aberto',
    '[{"s":"Limpeza de carburador"},{"sku":"VEL001"},{"sku":"FIL003"}]',
    'Validade vencida — cliente não retornou');
  perform pg_temp.orcamento(hoje - 15, 'APM5E22', null, 'cancelado',
    '[{"s":"Troca de bateria"},{"sku":"BAT001"}]', 'Lançado em duplicidade');

  v_orc := pg_temp.orcamento(hoje - 7, null, 'Camila Souza Azevedo', 'aberto',
    '[{"sku":"OLE003","q":2},{"sku":"LUB001"},{"sku":"MAN001"}]', 'Cliente vem buscar no balcão');
  v_venda := converter_orcamento(v_orc, 'venda', 'normal');
  update orcamentos set criado_em = pg_temp.ts(hoje - 7, '09:00') where id = v_orc;
  select total into t from vendas where id = v_venda;
  perform finalizar_venda(v_venda, pg_temp.pagamentos(t, '[{"f":"Pix"}]'));
  perform pg_temp.retroagir('venda', v_venda, pg_temp.ts(hoje - 5, '08:40'));

  v_orc := pg_temp.orcamento(hoje - 6, 'EFS4D14', null, 'aprovado',
    '[{"s":"Revisão geral"},{"sku":"OLE001","q":2},{"sku":"VEL002"},{"s":"Limpeza de bicos injetores"}]',
    'Aprovado por WhatsApp');
  v_os := converter_orcamento(v_orc, 'os', 'normal');
  update ordens_servico set
    data_entrada = pg_temp.ts(hoje - 5, '08:00'), criado_em = pg_temp.ts(hoje - 5, '08:00'),
    previsao = hoje - 2, status = 'em_execucao', km_entrada = 52280,
    mecanico_id = (select id from mecanicos where empresa_id = v_emp and nome = 'Carlos Henrique Souza'),
    defeito_relatado = 'Revisão + moto falhando em alta rotação',
    diagnostico = 'Bicos sujos. Aguardando teste de rodagem após limpeza.'
  where id = v_os;
  update os_itens set mecanico_id = (select mecanico_id from ordens_servico where id = v_os) where os_id = v_os;

  perform pg_temp.orcamento(hoje - 4, 'ERC6Q22', null, 'aprovado',
    '[{"s":"Troca de kit relação"},{"sku":"REL001"},{"s":"Troca de pastilha de freio"},{"sku":"FRE001"}]',
    'Frota — aprovado pelo gestor, aguardando trazer a moto');

  perform pg_temp.orcamento(hoje - 2, 'FJP1A21', null, 'aberto',
    '[{"s":"Troca de pneu (por roda)","q":2},{"sku":"PNE001"},{"sku":"PNE002"},{"sku":"CAM001","q":2}]',
    'Mostrar ao cliente o preço com troca (pneus usados ficam na loja)');

  v_orc := pg_temp.orcamento(hoje - 1, null, 'Gustavo Henrique Prado', 'aberto',
    '[{"sku":"OLE001","q":3},{"sku":"FIL002"},{"sku":"FLU001"}]', 'Mecânico parceiro — venda com troca');
  perform converter_orcamento(v_orc, 'venda', 'troca');   -- fica no carrinho p/ finalizar no PDV
  update vendas set criado_em = pg_temp.ts(hoje - 1, '11:00'),
    mecanico_id = (select id from mecanicos where empresa_id = v_emp and nome = 'Rafael Lima')
   where orcamento_id = v_orc;

  perform pg_temp.orcamento(hoje, 'TRP4N21', null, 'aberto',
    '[{"s":"Diagnóstico com scanner"},{"s":"Retífica de motor (mão de obra)"}]',
    'Somente mão de obra — peças a definir após abrir o motor');

  -- ---------- OS atuais (todos os status) ----------------------------
  perform pg_temp.os('EFS3C20', 'Rafael Lima', 'aguardando_peca', pg_temp.ts(hoje - 5, '09:10'),
    'Barulho na suspensão dianteira e óleo na bengala', 'Retentor da bengala vazando. Kit retentor pedido ao fornecedor, chega em 3 dias.',
    '[{"s":"Troca de retentor de bengala"},{"s":"Diagnóstico com scanner"}]', null, null, 0, 32150);

  perform pg_temp.os('WDM8S16', 'Carlos Henrique Souza', 'entregue', pg_temp.ts(hoje - 4, '08:20'),
    'Moto não liga', 'Bateria sem carga e vela gasta',
    '[{"s":"Troca de bateria"},{"sku":"BAT001"},{"sku":"VEL001"}]',
    '[{"f":"Receber depois"}]', pg_temp.ts(hoje - 3, '17:30'), 0, 61480,
    'Cliente pediu para pagar no dia 10');

  perform pg_temp.os('RAS8H18', 'Carlos Henrique Souza', 'entregue', pg_temp.ts(hoje - 3, '08:00'),
    'Revisão completa antes de viagem', 'Revisão feita, desconto de fidelidade',
    pacotes->5->'i', '[{"f":"Dinheiro","v":100},{"f":"Cartão"}]', pg_temp.ts(hoje - 3, '15:10'), 20, 47210);

  perform pg_temp.os('PMD9J20', 'Rafael Lima', 'pronta', pg_temp.ts(hoje - 3, '10:40'),
    'Freio traseiro baixo', 'Lonas gastas, trocadas e regulado',
    '[{"s":"Troca de lona de freio"},{"sku":"FRE003"},{"s":"Regulagem e lubrificação de corrente"}]',
    null, null, 0, 27650, 'Avisar cliente pelo WhatsApp que está pronta');

  perform pg_temp.os('GMC2B19', 'Carlos Henrique Souza', 'em_execucao', pg_temp.ts(hoje - 2, '08:45'),
    'Relação fazendo barulho', 'Kit relação gasto',
    '[{"s":"Troca de kit relação"},{"sku":"REL003"}]', null, null, 0, 18530);

  perform pg_temp.os('JTC2L23', 'Rafael Lima', 'cancelada', pg_temp.ts(hoje - 1, '09:15'),
    'Arranhão na carenagem', null, '[{"s":"Polimento de pintura","p":80}]', null, null, 0, 6180,
    'Cliente desistiu do serviço');

  perform pg_temp.os('LGR6F23', null, 'aberta', pg_temp.ts(hoje - 1, '16:50'),
    'Luz da injeção acesa', null, '[]', null, null, 0, 12040, 'Deixou a moto no fim do dia, sem mecânico definido');

  perform pg_temp.os('BLC9T24', 'Rafael Lima', 'aberta', pg_temp.ts(hoje, '08:10'),
    'Primeira revisão (1.000 km)', null,
    '[{"s":"Troca de óleo"},{"sku":"OLE002"},{"sku":"FIL001"}]', null, null, 0, 2350);

  -- ---------- vendas recentes (D-5 a hoje) ---------------------------
  perform pg_temp.venda(pg_temp.ts(hoje - 5, '10:12'), 'Lucas Gabriel Rocha',
    '[{"sku":"RET001"},{"sku":"MAN001"}]', '[{"f":"Pix"}]', 'normal', null, 10);
  perform pg_temp.venda(pg_temp.ts(hoje - 2, '14:30'), 'Wellington Dias Moura',
    '[{"sku":"OLE002","q":2},{"sku":"FIL001"}]', '[{"f":"Pix","v":30},{"f":"Receber depois"}]');
  perform pg_temp.venda(pg_temp.ts(hoje - 1, '11:05'), null,
    '[{"sku":"LAM002","q":2},{"sku":"LAM001"}]', '[{"f":"Dinheiro","arred":50}]');
  perform pg_temp.venda(pg_temp.ts(hoje, '09:20'), 'Entregas Rápidas Campinas ME',
    '[{"sku":"OLE002","q":3},{"sku":"FIL001","q":3}]', '[{"f":"Receber depois"}]');
  perform pg_temp.venda(pg_temp.ts(hoje, '09:45'), null,
    '[{"sku":"VEL001","q":2},{"sku":"FRE001"}]', '[{"f":"Pix"}]', 'troca', 'Carlos Henrique Souza');

  -- ---------- despesas mensais ---------------------------------------
  for dia in select generate_series(date_trunc('month', hoje - 75), hoje, interval '1 month')::date loop
    insert into despesas (empresa_id, data_pagamento, valor, forma_id, categoria, descricao, criado_em)
    select v_emp, d, v, pg_temp.forma(f), c::categoria_despesa, ds, pg_temp.ts(d, '09:00')
    from (values
      (dia + 4,  2800.00, 'Pix',      'administrativa', 'Aluguel do galpão'),
      (dia + 9,   412.37, 'Pix',      'administrativa', 'Energia elétrica'),
      (dia + 9,    96.50, 'Pix',      'administrativa', 'Água e esgoto'),
      (dia + 14,  129.90, 'Cartão',   'administrativa', 'Internet'),
      (dia + 14,  450.00, 'Pix',      'administrativa', 'Honorários do contador'),
      (dia + 4,  2200.00, 'Pix',      'funcionarios',   'Salário — Rafael Lima'),
      (dia + 19,  880.00, 'Pix',      'funcionarios',   'Adiantamento quinzenal'),
      (dia + 4,   312.00, 'Pix',      'funcionarios',   'FGTS / INSS'),
      (dia + 11,  185.00, 'Dinheiro', 'pecas_insumos',  'Estopa, desengraxante e graxa'),
      (dia + 16,   64.80, 'Dinheiro', 'outras',         'Café e copa'),
      (dia + 22,   90.00, 'Dinheiro', 'outras',         'Material de limpeza')
    ) x(d, v, f, c, ds)
    where x.d <= hoje;
  end loop;
  insert into despesas (empresa_id, data_pagamento, valor, forma_id, categoria, descricao, observacao, criado_em) values
    (v_emp, hoje - 18, 349.90, pg_temp.forma('Cartão'), 'outras', 'Conserto do compressor', 'Despesa avulsa', pg_temp.ts(hoje - 18, '13:00')),
    (v_emp, hoje - 1,   57.00, null,                    'outras', 'Frete de peças (motoboy)', 'Sem forma de pagamento informada', pg_temp.ts(hoje - 1, '15:00'));

  -- ---------- acabamento ---------------------------------------------
  update mecanicos set ativo = false where empresa_id = v_emp and nome = 'Diego Martins';
  update vendas             set criado_por = v_user where empresa_id = v_emp;
  update ordens_servico     set criado_por = v_user where empresa_id = v_emp;
  update orcamentos         set criado_por = v_user where empresa_id = v_emp;
  update movimentos_estoque set criado_por = v_user where empresa_id = v_emp;
  update pagamentos         set criado_por = v_user where empresa_id = v_emp;
  update despesas           set criado_por = v_user where empresa_id = v_emp;

  -- usuários opcionais com outros papéis
  if prm.email_balcao is not null then
    insert into membros (empresa_id, user_id, papel)
    select v_emp, id, 'balcao' from auth.users where lower(email) = lower(prm.email_balcao);
    if not found then raise warning 'Usuário balcão % não encontrado — ignorado', prm.email_balcao; end if;
  end if;
  if prm.email_mecanico is not null then
    insert into membros (empresa_id, user_id, papel, mecanico_id)
    select v_emp, id, 'mecanico', (select id from mecanicos where empresa_id = v_emp and nome = 'Rafael Lima')
    from auth.users where lower(email) = lower(prm.email_mecanico);
    if not found then raise warning 'Usuário mecânico % não encontrado — ignorado', prm.email_mecanico; end if;
  end if;

  raise notice 'Oficina de homologação criada: % (%)', prm.nome_empresa, v_emp;
  raise notice 'Vendas: %  | OS: %  | Orçamentos: %  | Contas a receber: %  | Despesas: %',
    (select count(*) from vendas where empresa_id = v_emp),
    (select count(*) from ordens_servico where empresa_id = v_emp),
    (select count(*) from orcamentos where empresa_id = v_emp),
    (select count(*) from contas_receber where empresa_id = v_emp),
    (select count(*) from despesas where empresa_id = v_emp);
end $$;

commit;

-- Conferência rápida
select 'venda:' || status, count(*), sum(total) from vendas
 where empresa_id = (select id from empresas where nome = 'Moto Center (Homologação)') group by 1
union all
select 'os:' || status, count(*), sum(total) from ordens_servico
 where empresa_id = (select id from empresas where nome = 'Moto Center (Homologação)') group by 1
union all
select 'receber:' || status, count(*), sum(valor - valor_pago) from contas_receber
 where empresa_id = (select id from empresas where nome = 'Moto Center (Homologação)') group by 1
order by 1;

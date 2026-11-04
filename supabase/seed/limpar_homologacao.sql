-- Remove a oficina de homologação criada por homologacao.sql e TUDO dela
-- (cadastros, estoque, vendas, OS, orçamentos, financeiro e vínculos de usuários).
-- Os usuários do Auth não são apagados.
-- A ordem importa: algumas chaves estrangeiras não têm "on delete cascade".
begin;
create temp table _alvo on commit drop as
  select id from empresas where nome = 'Moto Center (Homologação)';
delete from pagamentos         where empresa_id in (select id from _alvo);
delete from contas_receber     where empresa_id in (select id from _alvo);
delete from despesas           where empresa_id in (select id from _alvo);
delete from movimentos_estoque where empresa_id in (select id from _alvo);
delete from ordens_servico     where empresa_id in (select id from _alvo);
delete from vendas             where empresa_id in (select id from _alvo);
delete from orcamentos         where empresa_id in (select id from _alvo);
delete from empresas           where id in (select id from _alvo);
commit;

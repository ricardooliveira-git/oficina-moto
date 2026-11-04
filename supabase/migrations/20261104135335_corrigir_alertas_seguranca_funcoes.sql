-- Fixa o search_path das funções que ainda não o definem.
alter function public.trg_touch() set search_path = public;
alter function public.trg_produto_precos() set search_path = public;
alter function public.trg_item_subtotal() set search_path = public;
alter function public.trg_itens_total() set search_path = public;
alter function public.trg_desconto() set search_path = public;
alter function public.trg_numero() set search_path = public;
alter function public.trg_saldo_negativo() set search_path = public;
alter function public.proximo_numero(uuid, public.origem_documento) set search_path = public;
alter function public.recalcular_total(public.origem_documento, uuid) set search_path = public;
alter function public.registrar_entrada(uuid, numeric, numeric, text) set search_path = public;
alter function public.ajustar_estoque(uuid, numeric, text) set search_path = public;
alter function public._registrar_pagamentos(uuid, public.origem_documento, uuid, uuid, numeric, jsonb) set search_path = public;
alter function public.finalizar_venda(uuid, jsonb) set search_path = public;
alter function public.finalizar_os(uuid, jsonb) set search_path = public;
alter function public.converter_orcamento(uuid, public.origem_documento, public.tipo_venda) set search_path = public;
alter function public.cancelar_documento(public.origem_documento, uuid, text) set search_path = public;
alter function public.receber_conta(uuid, numeric, uuid) set search_path = public;
alter function public.link_whatsapp(text, text) set search_path = public;

-- Funções SECURITY DEFINER: só usuários logados (e o service_role) podem executar.
-- O acesso de "authenticated" é necessário: as políticas RLS usam minhas_empresas() e sou_dono(),
-- e o onboarding do app chama criar_empresa().
revoke execute on function public.criar_empresa(text) from public, anon;
revoke execute on function public.minhas_empresas() from public, anon;
revoke execute on function public.sou_dono(uuid) from public, anon;
grant execute on function public.criar_empresa(text) to authenticated, service_role;
grant execute on function public.minhas_empresas() to authenticated, service_role;
grant execute on function public.sou_dono(uuid) to authenticated, service_role;

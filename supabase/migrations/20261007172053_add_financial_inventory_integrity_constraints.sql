-- Supabase live migration: 20261007172053_add_financial_inventory_integrity_constraints
-- Prevent invalid financial and inventory states at the database boundary.

alter table public.customers
  add constraint customers_total_debt_nonnegative
  check (coalesce(total_debt,0) >= 0);

alter table public.repairs
  add constraint repairs_money_and_warranty_nonnegative
  check (
    coalesce(parts_cost,0) >= 0
    and coalesce(total_cost,0) >= 0
    and coalesce(deposit,0) >= 0
    and coalesce(quoted_price,0) >= 0
    and coalesce(warranty_days,0) >= 0
  );

alter table public.spare_parts
  add constraint spare_parts_inventory_nonnegative
  check (
    coalesce(quantity,0) >= 0
    and coalesce(purchased_quantity,0) >= 0
    and coalesce(reserved_quantity,0) >= 0
    and coalesce(purchase_price,0) >= 0
    and coalesce(sale_price,0) >= 0
    and coalesce(reserved_quantity,0) <= coalesce(quantity,0)
  );

alter table public.purchase_order_items
  add constraint purchase_order_items_received_not_over_quantity
  check (coalesce(received_quantity,0) <= coalesce(quantity,0));

alter table public.purchase_orders
  add constraint purchase_orders_money_nonnegative
  check (
    coalesce(total,0) >= 0
    and coalesce(paid,0) >= 0
  );

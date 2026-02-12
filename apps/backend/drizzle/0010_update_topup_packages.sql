-- Update top-up packages to match validation pricing
-- Disable previous packs and insert the single 100 credits pack

UPDATE topup_packages
SET active = false;

INSERT INTO topup_packages (stripe_price_id, stripe_product_id, name, credits, price_in_cents, currency, active)
VALUES ('price_topup_100', 'prod_topup', '100 Credits', 100, 1000, 'eur', true);

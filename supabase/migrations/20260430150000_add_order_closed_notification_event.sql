BEGIN;

INSERT INTO public.notification_events (key, name, description, is_active, sort_order)
VALUES ('order_closed', 'ปิดออเดอร์', 'แจ้งเตือนเมื่อมีการปิดออเดอร์', TRUE, 40)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;


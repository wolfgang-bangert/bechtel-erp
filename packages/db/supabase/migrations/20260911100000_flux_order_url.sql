-- ============================================================================
-- flux-Direktlink korrigiert: öffnet den Job-Editor eines konkreten
-- orderItems (nicht des Auftrags als Ganzes) über einen URL-Fragment-Anker.
--
--   https://flux.bechtel-druck.de/job-editor/order#<flux_order_item_id>
--
-- flux_order_item_id hat die Form "<flux_order_id>-<laufende Nummer>" (z.B.
-- "2532300003-1") – ein Auftrag mit mehreren Druck-Bauteilen hat also mehrere
-- Item-IDs, jede mit eigenem Deeplink. Platzhalter daher {orderItemId}.
-- ============================================================================

update public.setting
set value = to_jsonb('https://flux.bechtel-druck.de/job-editor/order#{orderItemId}'::text)
where key = 'flux_order_url_tpl';

-- portal.config bei Onlineprinters nutzte noch den alten Schlüssel "poll_state"
-- (Singular, nur "NEW"). Der Worker-Code unterstützt inzwischen "poll_states"
-- (Array) und würde ohne diese Migration weiterhin per Backward-Compat-Fallback
-- nur NEW abfragen - Aufträge, die vor unserem Poll schon auf IN_PROGRESS
-- wechseln, würden dauerhaft nie erfasst (siehe services/sync/src/portalOnlineprinters.ts).
update public.portal
set config = (config - 'poll_state') || jsonb_build_object('poll_states', jsonb_build_array('NEW', 'IN_PROGRESS'))
where name = 'Onlineprinters (Lieferantenportal)'
  and config ? 'poll_state';

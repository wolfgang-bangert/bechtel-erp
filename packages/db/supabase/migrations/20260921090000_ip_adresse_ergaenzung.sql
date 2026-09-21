-- Ergänzung aus einem zweiten LAN-Scan (von der Digitaldruckmaschine aus,
-- 2026-05-20) - neue Geräte, die im ersten Scan nicht sichtbar waren, plus
-- vom Nutzer nachgereichte Zugangsdaten für einzelne Geräte.

insert into public.ip_adresse (ip_adresse, mac_adresse, hostname, hersteller, scan_datum) values
  ('172.16.8.117', '68:bc:0c:79:f3:b1', 'switch79f3b1.bechteldruck.local', 'Cisco Systems, Inc',        '2026-05-20'),
  ('172.16.8.151', 'da:01:96:90:bd:0d', null,                              null,                        '2026-05-20'),
  ('172.16.8.168', '00:e0:4c:68:02:4f', 'MacBook Pro von Ben',             'REALTEK SEMICONDUCTOR CORP.','2026-05-20')
on conflict (ip_adresse) do nothing;

-- Notizen nur setzen, wenn noch keine eigene Notiz gepflegt wurde. Bewusst
-- OHNE Zugangsdaten/Passwörter - die gehören nicht in eine Git-committete
-- Migration (dauerhaft in der Historie, für jeden mit Repo-Zugriff sichtbar).
update public.ip_adresse set notiz = 'Netgear - auf der Digitaldruckmaschine. http://172.16.9.4/'
  where ip_adresse = '172.16.9.4' and notiz is null;
update public.ip_adresse set notiz = 'Netgear. http://172.16.9.2/'
  where ip_adresse = '172.16.9.2' and notiz is null;
update public.ip_adresse set notiz = 'Netgear. http://172.16.8.179/'
  where ip_adresse = '172.16.8.179' and notiz is null;
update public.ip_adresse set notiz = 'Cisco. http://172.16.8.76'
  where ip_adresse = '172.16.8.76' and notiz is null;
update public.ip_adresse set notiz = 'Ruckus WLAN AP Base. https://wlan.bechtel-druck.de'
  where ip_adresse = '172.16.8.70' and notiz is null;
update public.ip_adresse set notiz = 'NAS. https://172.16.8.182:5001'
  where ip_adresse = '172.16.8.182' and notiz is null;
update public.ip_adresse set notiz = 'Lancom Firewall. https://172.16.8.254:3438'
  where ip_adresse = '172.16.8.254' and notiz is null;

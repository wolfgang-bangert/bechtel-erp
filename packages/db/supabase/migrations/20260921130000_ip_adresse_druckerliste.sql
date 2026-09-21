-- Ergänzung aus der Windows-Druckerliste (Get-Printer: Name/PortName/IPAddress):
-- Gerät und Notiz zu den IPs, vier bisher nicht erfasste IPs neu. Bestehende
-- Einträge werden nur ergänzt, nie überschrieben (coalesce: eigene Pflege
-- gewinnt). PDF24 (virtueller Drucker ohne IP) bewusst ausgelassen.
-- Hinweise "prüfen": der LAN-Scan zeigte dort ein anderes Gerät.

insert into public.ip_adresse (ip_adresse, geraet, notiz) values
  ('172.16.8.167', 'BP4x-label_beta',
    'Windows-Druckerwarteschlange: BP4x-label_beta'),
  ('172.16.8.166', 'BP4x-label_alpha',
    'Windows-Druckerwarteschlange: BP4x-label_alpha. Achtung: LAN-Scan zeigte hier "MacBook Pro von Ben" - prüfen.'),
  ('172.16.8.175', 'ZEBRA01',
    'Windows-Druckerwarteschlange: ZEBRA01'),
  ('172.16.8.136', 'TSC-TC200-03',
    'Windows-Druckerwarteschlange: TSC-TC200-03'),
  ('172.16.8.127', 'TSC-TC200-01',
    'Windows-Druckerwarteschlange: TSC-TC200-01'),
  ('172.16.8.30', 'Konica Minolta bizhub C3351',
    'Windows-Druckerwarteschlangen: KONICA MINOLTA bizhub C3351 PCL v4, KM C3351 A4 einseitig'),
  ('172.16.8.206', 'Konica Minolta C554e',
    'Windows-Druckerwarteschlangen: KM C554e A4 einseitig, A4 beidseitig, A3 einseitig, A3 beidseitig'),
  ('172.16.9.0', 'Konica Minolta C3100P',
    'Windows-Druckerwarteschlange: KM C3100P A4 einseitig (Port IP_172.16.9.0 - Adresse ungewöhnlich, prüfen)'),
  ('172.16.8.157', 'Canon LBP646C',
    'Windows-Druckerwarteschlange: Canon LBP646C UFR II (Port CanonLBP646Cdw). Achtung: LAN-Scan zeigte hier "iphonevonsarah" - prüfen.'),
  ('172.16.9.5', 'Brother QL-1110NWB',
    'Windows-Druckerwarteschlange: Brother QL-1110NWB. Achtung: LAN-Scan zeigte hier ein Auerswald-Gerät - prüfen.'),
  ('172.16.8.139', 'BP730iCUT',
    'Windows-Druckerwarteschlange: BP730iCUT'),
  ('172.16.8.48', 'BP730i',
    'Windows-Druckerwarteschlange: BP730i'),
  ('172.16.8.125', 'BP4x-03',
    'Windows-Druckerwarteschlange: BP4x-03'),
  ('172.16.8.102', 'BP4x-02',
    'Windows-Druckerwarteschlange: BP4x-02'),
  ('172.16.8.171', 'BP4x-01',
    'Windows-Druckerwarteschlange: BP4x-01')
on conflict (ip_adresse) do update set
  geraet = coalesce(public.ip_adresse.geraet, excluded.geraet),
  notiz  = coalesce(public.ip_adresse.notiz, excluded.notiz);

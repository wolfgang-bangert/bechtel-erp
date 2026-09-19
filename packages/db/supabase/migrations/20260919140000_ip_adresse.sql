-- ============================================================================
-- IP-Adressen im Haus: manuell gepflegte Übersicht, welches Gerät welche IP
-- hat. Einmalig mit einem LAN-Scan vom 2026-05-20 vorbefüllt (ip/mac/hostname/
-- hersteller als Referenz), "geraet" bleibt bewusst leer - das trägt der
-- Nutzer selbst ein, wenn er eine IP einem Gerät zuordnet. Spätere Verknüpfung
-- mit Maschinen über maschine_id (optional, kommt bei Bedarf dazu).
-- ============================================================================

create table public.ip_adresse (
  id           uuid primary key default gen_random_uuid(),
  ip_adresse   text not null unique,
  geraet       text,                 -- manuell: welches Gerät hängt an dieser IP
  hostname     text,
  mac_adresse  text,
  hersteller   text,
  maschine_id  uuid references public.maschine (id) on delete set null,
  notiz        text,
  scan_datum   date,                 -- Datum des LAN-Scans, aus dem importiert wurde (NULL = manuell angelegt)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index ip_adresse_maschine_idx on public.ip_adresse (maschine_id) where maschine_id is not null;

do $$
begin
  perform public.attach_standard_triggers('public.ip_adresse'::regclass);
  alter table public.ip_adresse enable row level security;
  create policy ip_adresse_read on public.ip_adresse for select using (public.is_staff());
  create policy ip_adresse_write on public.ip_adresse for all
    using (public.has_any_role(array['admin','office','production']::app_role[]))
    with check (public.has_any_role(array['admin','office','production']::app_role[]));
end $$;

-- ---------------------------------------------------------------- LAN-Scan-Import (2026-05-20)
insert into public.ip_adresse (ip_adresse, mac_adresse, hostname, hersteller, scan_datum) values
  ('172.16.8.123',  'a6:2a:29:59:44:a8', 'ingos-mbp.bechteldruck.local',      null,                                    '2026-05-20'),
  ('172.16.8.124',  '1e:5f:a0:e6:05:39', 'iPhone',                            null,                                    '2026-05-20'),
  ('172.16.8.159',  'b6:47:78:96:05:91', 'ingos-mbp-2.bechteldruck.local',    null,                                    '2026-05-20'),
  ('172.16.222.41', 'c2:a5:ca:a2:89:43', null,                                null,                                    '2026-05-20'),
  ('172.16.8.103',  '78:24:af:40:fa:cd', 'ZEUS',                              'ASUSTek COMPUTER INC.',                 '2026-05-20'),
  ('172.16.8.49',   '64:b9:e8:c5:e0:1e', 'iMac-1-Digitaldruck',               'Apple, Inc.',                           '2026-05-20'),
  ('172.16.8.108',  'ac:87:a3:02:f2:ba', 'pc11.bechteldruck.local',           'Apple, Inc.',                           '2026-05-20'),
  ('172.16.8.109',  '70:e7:2c:5c:20:8c', 'ds510-5d60ef.bechteldruck.local',   'Apple, Inc.',                           '2026-05-20'),
  ('172.16.8.157',  '70:e7:2c:5b:08:01', 'iphonevonsarah.bechteldruck.local', 'Apple, Inc.',                           '2026-05-20'),
  ('172.16.8.163',  'd0:11:e5:af:41:5d', 'Wolfgangs-MacMini',                 'Apple, Inc.',                           '2026-05-20'),
  ('172.16.8.166',  'a4:83:e7:32:a5:f1', 'MacBook Pro von Ben',               'Apple, Inc.',                           '2026-05-20'),
  ('172.16.222.95', 'd0:d2:b0:84:4c:58', null,                                'Apple, Inc.',                           '2026-05-20'),
  ('172.16.8.177',  '00:09:52:05:f2:63', 'wohnzimmer.bechteldruck.local',     'Auerswald GmbH And Co. KG',             '2026-05-20'),
  ('172.16.9.5',    '00:09:52:05:f2:de', null,                                'Auerswald GmbH And Co. KG',             '2026-05-20'),
  ('172.16.8.105',  'b0:4a:39:92:74:14', 'galaxy-s9.bechteldruck.local',      'Beijing Roborock Technology Co., Ltd.', '2026-05-20'),
  ('172.16.8.76',   '00:76:86:28:83:94', null,                                'Cisco Systems, Inc',                    '2026-05-20'),
  ('172.16.8.186',  '54:86:bc:af:46:c6', 'comfortel1400ip.bechteldruck.local','Cisco Systems, Inc',                    '2026-05-20'),
  ('172.16.9.1',    'c4:b3:6a:6d:f8:d4', null,                                'Cisco Systems, Inc',                    '2026-05-20'),
  ('172.16.9.6',    '54:86:bc:af:44:e9', null,                                'Cisco Systems, Inc',                    '2026-05-20'),
  ('172.16.8.126',  '1c:69:7a:af:a4:ef', 'DESKTOP-DHJVBMA',                   'EliteGroup Computer Systems Co., LTD',  '2026-05-20'),
  ('172.16.222.67', '1c:69:7a:a0:df:ab', 'DESKTOP-466UG5C',                   'EliteGroup Computer Systems Co., LTD',  '2026-05-20'),
  ('172.16.222.96', '94:c6:91:aa:28:b0', 'BAREBONE01',                        'EliteGroup Computer Systems Co., LTD',  '2026-05-20'),
  ('172.16.8.48',   '00:1d:9a:05:ea:c2', null,                                'GODEX INTERNATIONAL CO., LTD',          '2026-05-20'),
  ('172.16.8.102',  '00:1d:9a:08:98:9c', 'benjamins-air.bechteldruck.local',  'GODEX INTERNATIONAL CO., LTD',          '2026-05-20'),
  ('172.16.8.139',  '00:1d:9a:07:bb:17', 'ingos-mac-mini.bechteldruck.local', 'GODEX INTERNATIONAL CO., LTD',          '2026-05-20'),
  ('172.16.8.171',  '00:1d:9a:09:9b:2a', 'ipadvoninkromer.bechteldruck.local','GODEX INTERNATIONAL CO., LTD',          '2026-05-20'),
  ('172.16.8.202',  'f0:92:1c:6b:5e:00', null,                                'Hewlett Packard',                       '2026-05-20'),
  ('172.16.9.18',   '94:3f:c2:8f:e3:af', null,                                'Hewlett Packard Enterprise',            '2026-05-20'),
  ('172.16.8.251',  '00:26:20:00:1f:d6', 'appserv01.bechteldruck.local',      'ISGUS GmbH',                            '2026-05-20'),
  ('172.16.8.230',  '00:13:d1:81:6a:b6', 'pc06.bechteldruck.local',           'KIRK telecom A/S',                      '2026-05-20'),
  ('172.16.8.231',  '00:13:d1:81:43:2c', null,                                'KIRK telecom A/S',                      '2026-05-20'),
  ('172.16.8.233',  '00:13:d1:90:9b:74', null,                                'KIRK telecom A/S',                      '2026-05-20'),
  ('172.16.8.30',   '00:20:6b:ec:b9:52', 'KMECB952',                          'KONICA MINOLTA HOLDINGS, INC.',        '2026-05-20'),
  ('172.16.8.206',  '00:20:6b:83:b4:cf', 'KM83B4CF',                          'KONICA MINOLTA HOLDINGS, INC.',        '2026-05-20'),
  ('172.16.8.254',  '00:a0:57:81:13:5e', 'fw.bechteldruck.local',             'LANCOM Systems GmbH',                   '2026-05-20'),
  ('172.16.8.8',    '00:15:5d:00:0a:07', 'LEX02',                             'Microsoft Corporation',                 '2026-05-20'),
  ('172.16.8.9',    '00:15:5d:64:17:00', 'NOC',                               'Microsoft Corporation',                 '2026-05-20'),
  ('172.16.8.12',   '00:15:5d:00:0a:06', 'sql01.bechteldruck.local',          'Microsoft Corporation',                 '2026-05-20'),
  ('172.16.8.15',   '00:15:5d:64:17:04', 'IMPSRV01',                          'Microsoft Corporation',                 '2026-05-20'),
  ('172.16.8.16',   '00:15:5d:a0:24:0b', 'VMAPPSERV01',                       'Microsoft Corporation',                 '2026-05-20'),
  ('172.16.8.113',  '00:15:5d:a0:24:0e', 'WIN10-DSKRIPT',                     'Microsoft Corporation',                 '2026-05-20'),
  ('172.16.8.137',  '00:15:5d:a0:24:0d', 'FLUX-SERVER',                       'Microsoft Corporation',                 '2026-05-20'),
  ('172.16.8.155',  '00:15:5d:a0:24:10', 'Win11Pro-DPD-TB',                   'Microsoft Corporation',                 '2026-05-20'),
  ('172.16.8.179',  '04:a1:51:33:60:98', null,                                'NETGEAR',                               '2026-05-20'),
  ('172.16.9.2',    '80:cc:9c:98:fb:0e', null,                                'NETGEAR',                               '2026-05-20'),
  ('172.16.9.4',    '80:cc:9c:98:fb:30', null,                                'NETGEAR',                               '2026-05-20'),
  ('172.16.222.93', '4c:72:b9:21:a1:08', 'PC11',                              'PEGATRON CORPORATION',                  '2026-05-20'),
  ('172.16.8.70',   '1c:b9:c4:08:33:a0', 'wlan.bechtel-druck.de',             'Ruckus Wireless',                       '2026-05-20'),
  ('172.16.8.71',   '1c:b9:c4:08:3b:70', null,                                'Ruckus Wireless',                       '2026-05-20'),
  ('172.16.8.72',   '1c:b9:c4:08:3c:50', null,                                'Ruckus Wireless',                       '2026-05-20'),
  ('172.16.8.73',   '1c:b9:c4:08:39:80', null,                                'Ruckus Wireless',                       '2026-05-20'),
  ('172.16.8.74',   '1c:b9:c4:08:2d:20', null,                                'Ruckus Wireless',                       '2026-05-20'),
  ('172.16.8.2',    '00:00:48:cb:13:1d', 'EPL-6200-CB131D',                   'Seiko Epson Corporation',               '2026-05-20'),
  ('172.16.6.1',    'ac:1f:6b:ba:5d:0a', 'SRVHV01',                           'Super Micro Computer, Inc.',            '2026-05-20'),
  ('172.16.6.4',    'ac:1f:6b:b7:67:bf', null,                                'Super Micro Computer, Inc.',            '2026-05-20'),
  ('172.16.8.182',  '00:11:32:cd:9f:cb', 'Fileserver',                        'Synology Incorporated',                 '2026-05-20'),
  ('172.16.8.127',  '00:1b:82:33:bc:a6', 'franks-iphone.bechteldruck.local',  'Taiwan Semiconductor Co., Ltd.',        '2026-05-20'),
  ('172.16.8.136',  '00:1b:82:33:7c:7d', null,                                'Taiwan Semiconductor Co., Ltd.',        '2026-05-20'),
  ('172.16.8.145',  'a0:42:3f:37:5f:8a', 'FIERY',                             'Tyan Computer Corp',                    '2026-05-20'),
  ('172.16.222.100','00:07:4d:b3:32:14', null,                                'Zebra Technologies Corp.',              '2026-05-20')
on conflict (ip_adresse) do nothing;

-- Startdaten: Handbuch-Produkt "IMPULS-VKHB italienisch" (Struktur ohne Dateien).
-- Quelle: Dateiaufstellung IMPULS italienisch; Kapitel-Nummern = Hauptregister-
-- Unterregister (0-1 = Inhalt, gehört zu keinem Hauptregister).
-- GENERIERT - Struktur bei Bedarf über die App ändern, nicht diese Datei.
do $$
declare v_p uuid; v_k uuid; v_hr uuid;
begin
  insert into public.produkt (name, art, sprache, beschreibung)
    values ('IMPULS-VKHB italienisch', 'handbuch', 'it', 'Verkaufshandbuch Impuls, italienische Sprachversion')
    returning id into v_p;

  -- Vorspann (ohne Kapitel)
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, sortierung, attribute)
    values (v_p, 'deckblatt', 'IP 01', 'Deckblatt', 4, 10, '{"dateien":[{"ip":"01","titel":"Deckblatt"}]}'::jsonb);
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, sortierung, attribute)
    values (v_p, 'verkaufshandbuch', 'IP 02', 'Verkaufshandbuch', null, 20, '{"dateien":[{"ip":"02","titel":"Verkaufshandbuch"}]}'::jsonb);
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, sortierung, attribute)
    values (v_p, 'inhalt', 'IP 03', 'Unternehmen und Service', null, 30, '{"dateien":[{"ip":"03","titel":"Unternehmen und Service"}]}'::jsonb);
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, sortierung, attribute)
    values (v_p, 'inhalt', 'IP 04', 'Qualitäts- und Produktinformationen', null, 40, '{"dateien":[{"ip":"04","titel":"Qualitäts- und Produktinformationen"}]}'::jsonb);
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, sortierung, attribute)
    values (v_p, 'inhalt', 'IP 05', 'Hinweise zur Bestellung', null, 50, '{"dateien":[{"ip":"05","titel":"Hinweise zur Bestellung"}]}'::jsonb);
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, sortierung, attribute)
    values (v_p, 'inhalt', 'IP 06', 'Planungshinweise', null, 60, '{"dateien":[{"ip":"06","titel":"Planungshinweise"}]}'::jsonb);
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, sortierung, attribute)
    values (v_p, 'inhalt', 'IP 07', 'Artikelschlüssel', null, 70, '{"dateien":[{"ip":"07","titel":"Artikelschlüssel"}]}'::jsonb);

  -- Kapitel 0-1 (kein Hauptregister)
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '0-1', null, 'Inhalt', 80) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, null, '0-1', 'Inhalt', 2, 10, 1, 90, '{"quelle":"IP_91a","seite_von":1,"seite_bis":2}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, null, 'IP 08', 'Stichwort-Register', null, 100, '{"dateien":[{"ip":"08","titel":"Stichwort-Register"}]}'::jsonb);

  -- Hauptregister 1: Programmübersicht
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'hauptregister', '1', 'Programmübersicht', 2, 10, 1, 110, '{"quelle":"IP_90","seite_von":1,"seite_bis":2}'::jsonb)
    returning id into v_hr;
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '1-1', v_hr, 'Fronten', 120) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '1-1', 'Fronten', 2, 10, 1, 130, '{"quelle":"IP_91b","seite_von":1,"seite_bis":2}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 09-12', 'Frontübersicht · Preisindex · Frontaufbau · Fronten', 6, 140, '{"dateien":[{"ip":"09","titel":"Frontübersicht","seiten":6},{"ip":"10","titel":"Preisindex"},{"ip":"11","titel":"Frontaufbau"},{"ip":"12","titel":"Fronten"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '1-2', v_hr, 'Umfeld, APL, Griffe', 150) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '1-2', 'Umfeld, APL, Griffe', 2, 10, 2, 160, '{"quelle":"IP_91b","seite_von":3,"seite_bis":4}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 13-18', 'Umfeldfarben · Wangenelemente · Nischen-Motive · Arbeitsplattenübersicht · Griffübersicht · Griffmatrix', 4, 170, '{"dateien":[{"ip":"13","titel":"Umfeldfarben"},{"ip":"14","titel":"Wangenelemente"},{"ip":"15","titel":"Nischen-Motive"},{"ip":"16","titel":"Arbeitsplattenübersicht"},{"ip":"17","titel":"Griffübersicht","seiten":4},{"ip":"18","titel":"Griffmatrix"}]}'::jsonb);

  -- Hauptregister 2: Unterschränke
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'hauptregister', '2', 'Unterschränke', 2, 10, 2, 180, '{"quelle":"IP_90","seite_von":3,"seite_bis":4}'::jsonb)
    returning id into v_hr;
  insert into public.produktteil (produkt_id, typ, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_hr, 'IP 19', 'Ausstattung Unterschränke', null, 190, '{"dateien":[{"ip":"19","titel":"Ausstattung Unterschränke"}]}'::jsonb);
  insert into public.produktteil (produkt_id, typ, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_hr, 'IP 20', 'Unterschränke Übersicht', null, 200, '{"dateien":[{"ip":"20","titel":"Unterschränke Übersicht"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '2-1', v_hr, 'Unterschränke', 210) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '2-1', 'Unterschränke', 2, 10, 1, 220, '{"quelle":"IP_91c","seite_von":1,"seite_bis":2}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 21', 'Unterschränke', null, 230, '{"dateien":[{"ip":"21","titel":"Unterschränke"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '2-2', v_hr, 'Kochstellenschränke/Spülenschränke', 240) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '2-2', 'Kochstellenschränke/Spülenschränke', 2, 10, 2, 250, '{"quelle":"IP_91c","seite_von":3,"seite_bis":4}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 22', 'Kochstellenschränke/Spülenschränke', null, 260, '{"dateien":[{"ip":"22","titel":"Kochstellenschränke/Spülenschränke"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '2-3', v_hr, 'HIGHline Unterschränke', 270) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '2-3', 'HIGHline Unterschränke', 2, 10, 3, 280, '{"quelle":"IP_91c","seite_von":5,"seite_bis":6}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 23', 'HIGHline Unterschränke', null, 290, '{"dateien":[{"ip":"23","titel":"HIGHline Unterschränke"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '2-4', v_hr, 'HIGHline Kochstellenschränke/Spülenschränke', 300) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '2-4', 'HIGHline Kochstellenschränke/Spülenschränke', 2, 10, 4, 310, '{"quelle":"IP_91c","seite_von":7,"seite_bis":8}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 24', 'HIGHline Kochstellenschränke/Spülenschränke', null, 320, '{"dateien":[{"ip":"24","titel":"HIGHline Kochstellenschränke/Spülenschränke"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '2-5', v_hr, 'Unterschränke 867 mm', 330) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '2-5', 'Unterschränke 867 mm', 2, 10, 5, 340, '{"quelle":"IP_91c","seite_von":9,"seite_bis":10}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 25', 'Unterschränke 867 mm', null, 350, '{"dateien":[{"ip":"25","titel":"Unterschränke 867 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '2-6', v_hr, 'Rückwand Sockel', 360) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '2-6', 'Rückwand Sockel', 2, 10, 6, 370, '{"quelle":"IP_91c","seite_von":11,"seite_bis":12}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 26-27', 'Rückwandverkleidung · Sockelblenden', null, 380, '{"dateien":[{"ip":"26","titel":"Rückwandverkleidung"},{"ip":"27","titel":"Sockelblenden"}]}'::jsonb);

  -- Hauptregister 3: Hänge-, Aufsatzschränke
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'hauptregister', '3', 'Hänge-, Aufsatzschränke', 2, 10, 3, 390, '{"quelle":"IP_90","seite_von":5,"seite_bis":6}'::jsonb)
    returning id into v_hr;
  insert into public.produktteil (produkt_id, typ, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_hr, 'IP 28', 'Ausstattung Hängeschränke', null, 400, '{"dateien":[{"ip":"28","titel":"Ausstattung Hängeschränke"}]}'::jsonb);
  insert into public.produktteil (produkt_id, typ, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_hr, 'IP 29', 'Hängeschränke Übersicht', null, 410, '{"dateien":[{"ip":"29","titel":"Hängeschränke Übersicht"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '3-1', v_hr, 'Hängeschränke 288/291/363/435 mm', 420) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '3-1', 'Hängeschränke 288/291/363/435 mm', 2, 10, 1, 430, '{"quelle":"IP_91d","seite_von":1,"seite_bis":2}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 30', 'Hänge-/Aufsatzschränke 291, 435, 363 mm', null, 440, '{"dateien":[{"ip":"30","titel":"Hänge-/Aufsatzschränke 291, 435, 363 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '3-2', v_hr, 'Hängeschränke 579 mm', 450) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '3-2', 'Hängeschränke 579 mm', 2, 10, 2, 460, '{"quelle":"IP_91d","seite_von":3,"seite_bis":4}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 31', 'Hängeschränke 579 mm', null, 470, '{"dateien":[{"ip":"31","titel":"Hängeschränke 579 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '3-3', v_hr, 'Hängeschränke 723 mm', 480) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '3-3', 'Hängeschränke 723 mm', 2, 10, 3, 490, '{"quelle":"IP_91d","seite_von":5,"seite_bis":6}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 32', 'Hängeschränke 723 mm', null, 500, '{"dateien":[{"ip":"32","titel":"Hängeschränke 723 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '3-4', v_hr, 'Hängeschränke 867 mm', 510) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '3-4', 'Hängeschränke 867 mm', 2, 10, 4, 520, '{"quelle":"IP_91d","seite_von":7,"seite_bis":8}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 33', 'Hängeschränke 867 mm', null, 530, '{"dateien":[{"ip":"33","titel":"Hängeschränke 867 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '3-5', v_hr, 'Hängeschränke für Geräte', 540) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '3-5', 'Hängeschränke für Geräte', 2, 10, 5, 550, '{"quelle":"IP_91d","seite_von":9,"seite_bis":10}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 34-35', 'Hängeschränke für Geräte · Rückwände für Dunstessen', null, 560, '{"dateien":[{"ip":"34","titel":"Hängeschränke für Geräte"},{"ip":"35","titel":"Rückwände für Dunstessen"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '3-6', v_hr, 'Aufsatzschränke', 570) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '3-6', 'Aufsatzschränke', 2, 10, 6, 580, '{"quelle":"IP_91d","seite_von":11,"seite_bis":12}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 36', 'Aufsatzschränke', null, 590, '{"dateien":[{"ip":"36","titel":"Aufsatzschränke"}]}'::jsonb);

  -- Hauptregister 4: Seitenschränke, Highboards
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'hauptregister', '4', 'Seitenschränke, Highboards', 2, 10, 4, 600, '{"quelle":"IP_90","seite_von":7,"seite_bis":8}'::jsonb)
    returning id into v_hr;
  insert into public.produktteil (produkt_id, typ, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_hr, 'IP 37', 'Ausstattung Highboards, Seitenschränke', null, 610, '{"dateien":[{"ip":"37","titel":"Ausstattung Highboards, Seitenschränke"}]}'::jsonb);
  insert into public.produktteil (produkt_id, typ, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_hr, 'IP 38', 'Highboards, Seitenschränke Übersicht', null, 620, '{"dateien":[{"ip":"38","titel":"Highboards, Seitenschränke Übersicht"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '4-1', v_hr, 'Information Fertigungstypen', 630) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '4-1', 'Information Fertigungstypen', 2, 10, 1, 640, '{"quelle":"IP_91e","seite_von":1,"seite_bis":2}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 39', 'Information Seitenschränke für Einbaugeräte', null, 650, '{"dateien":[{"ip":"39","titel":"Information Seitenschränke für Einbaugeräte"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '4-2', v_hr, 'Highboards 1043 mm', 660) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '4-2', 'Highboards 1043 mm', 2, 10, 2, 670, '{"quelle":"IP_91e","seite_von":3,"seite_bis":4}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 40', 'Highboards 1043 mm', null, 680, '{"dateien":[{"ip":"40","titel":"Highboards 1043 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '4-3', v_hr, 'Highboards 1475 mm', 690) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '4-3', 'Highboards 1475 mm', 2, 10, 3, 700, '{"quelle":"IP_91e","seite_von":5,"seite_bis":6}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 41', 'Highboards 1475 mm', null, 710, '{"dateien":[{"ip":"41","titel":"Highboards 1475 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '4-4', v_hr, 'Highboards 1619 mm', 720) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '4-4', 'Highboards 1619 mm', 2, 10, 4, 730, '{"quelle":"IP_91e","seite_von":7,"seite_bis":8}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 42', 'Highboards 1619 mm', null, 740, '{"dateien":[{"ip":"42","titel":"Highboards 1619 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '4-5', v_hr, 'Seitenschränke 1907 mm', 750) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '4-5', 'Seitenschränke 1907 mm', 2, 10, 5, 760, '{"quelle":"IP_91e","seite_von":9,"seite_bis":10}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 43', 'Seitenschränke 1907 mm', null, 770, '{"dateien":[{"ip":"43","titel":"Seitenschränke 1907 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '4-6', v_hr, 'Seitenschränke 2051 mm', 780) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '4-6', 'Seitenschränke 2051 mm', 2, 10, 6, 790, '{"quelle":"IP_91e","seite_von":11,"seite_bis":12}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 44', 'Seitenschränke 2051 mm', null, 800, '{"dateien":[{"ip":"44","titel":"Seitenschränke 2051 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '4-7', v_hr, 'Seitenschränke 2195 mm', 810) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '4-7', 'Seitenschränke 2195 mm', 2, 10, 7, 820, '{"quelle":"IP_91e","seite_von":13,"seite_bis":14}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 45', 'Seitenschränke 2195 mm', null, 830, '{"dateien":[{"ip":"45","titel":"Seitenschränke 2195 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '4-8', v_hr, 'Module Geschirrspüler BASEline', 840) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '4-8', 'Module Geschirrspüler BASEline', 2, 10, 8, 850, '{"quelle":"IP_91e","seite_von":15,"seite_bis":16}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 46', 'Module für hochgebaute Geschirrspüler', null, 860, '{"dateien":[{"ip":"46","titel":"Module für hochgebaute Geschirrspüler"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '4-9', v_hr, 'HIGHline Highboards 1547 mm', 870) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '4-9', 'HIGHline Highboards 1547 mm', 2, 10, 9, 880, '{"quelle":"IP_91e","seite_von":17,"seite_bis":18}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 47', 'Highboards HIGHline 1547 mm', null, 890, '{"dateien":[{"ip":"47","titel":"Highboards HIGHline 1547 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '4-10', v_hr, 'HIGHline Seitenschränke 1979 mm', 900) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '4-10', 'HIGHline Seitenschränke 1979 mm', 2, 10, 10, 910, '{"quelle":"IP_91e","seite_von":19,"seite_bis":20}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 48', 'Seitenschränke HIGHline 1979 mm', null, 920, '{"dateien":[{"ip":"48","titel":"Seitenschränke HIGHline 1979 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '4-11', v_hr, 'HIGHline Seitenschränke 2123 mm', 930) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '4-11', 'HIGHline Seitenschränke 2123 mm', 2, 10, 1, 940, '{"quelle":"IP_91e","seite_von":21,"seite_bis":22}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 49', 'Seitenschränke HIGHline 2123 mm', null, 950, '{"dateien":[{"ip":"49","titel":"Seitenschränke HIGHline 2123 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '4-12', v_hr, 'HIGHline Seitenschränke 2267 mm', 960) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '4-12', 'HIGHline Seitenschränke 2267 mm', 2, 10, 2, 970, '{"quelle":"IP_91e","seite_von":23,"seite_bis":24}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 50', 'Seitenschränke HIGHline 2267 mm', null, 980, '{"dateien":[{"ip":"50","titel":"Seitenschränke HIGHline 2267 mm"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '4-13', v_hr, 'Module Geschirrspüler HIGHline', 990) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '4-13', 'Module Geschirrspüler HIGHline', 2, 10, 3, 1000, '{"quelle":"IP_91e","seite_von":25,"seite_bis":26}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 51', 'Module für hochgebaute Geschirrspüler', null, 1010, '{"dateien":[{"ip":"51","titel":"Module für hochgebaute Geschirrspüler"}]}'::jsonb);

  -- Hauptregister 5: Wangen, Regalböden
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'hauptregister', '5', 'Wangen, Regalböden', 2, 10, 5, 1020, '{"quelle":"IP_90","seite_von":9,"seite_bis":10}'::jsonb)
    returning id into v_hr;
  insert into public.produktteil (produkt_id, typ, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_hr, 'IP 52', 'Wangensystem 16 mm', null, 1030, '{"dateien":[{"ip":"52","titel":"Wangensystem 16 mm"}]}'::jsonb);
  insert into public.produktteil (produkt_id, typ, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_hr, 'IP 53', 'Wangensystem 25 mm', null, 1040, '{"dateien":[{"ip":"53","titel":"Wangensystem 25 mm"}]}'::jsonb);
  insert into public.produktteil (produkt_id, typ, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_hr, 'IP 54', 'Regalböden', null, 1050, '{"dateien":[{"ip":"54","titel":"Regalböden"}]}'::jsonb);

  -- Hauptregister 6: Arbeitsplatten, Nische
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'hauptregister', '6', 'Arbeitsplatten, Nische', 2, 10, 6, 1060, '{"quelle":"IP_90","seite_von":11,"seite_bis":12}'::jsonb)
    returning id into v_hr;
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '6-1', v_hr, 'Arbeitsplatten, Wandabschlussprofile', 1070) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '6-1', 'Arbeitsplatten, Wandabschlussprofile', 2, 10, 1, 1080, '{"quelle":"IP_91f","seite_von":1,"seite_bis":2}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 55-56', 'Arbeitsplatten · Wandabschlußleisten', null, 1090, '{"dateien":[{"ip":"55","titel":"Arbeitsplatten"},{"ip":"56","titel":"Wandabschlußleisten"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '6-2', v_hr, 'Nischenrückwand', 1100) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '6-2', 'Nischenrückwand', 2, 10, 2, 1110, '{"quelle":"IP_91f","seite_von":3,"seite_bis":4}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 57', 'Nischen-Ausstattung', null, 1120, '{"dateien":[{"ip":"57","titel":"Nischen-Ausstattung"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '6-3', v_hr, 'Arbeitsplatten-/Theken-/Nischenzubehör', 1130) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '6-3', 'Arbeitsplatten-/Theken-/Nischenzubehör', 2, 10, 3, 1140, '{"quelle":"IP_91f","seite_von":5,"seite_bis":6}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 58', 'Arbeitsplatten-/Theken-/Nischenzubehör', null, 1150, '{"dateien":[{"ip":"58","titel":"Arbeitsplatten-/Theken-/Nischenzubehör"}]}'::jsonb);

  -- Hauptregister 7: Grifflos, PUREline
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'hauptregister', '7', 'Grifflos, PUREline', 2, 10, 7, 1160, '{"quelle":"IP_90","seite_von":13,"seite_bis":14}'::jsonb)
    returning id into v_hr;
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '7-1', v_hr, 'Produktinformation PUREline', 1170) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '7-1', 'Produktinformation PUREline', 2, 10, 1, 1180, '{"quelle":"IP_91g","seite_von":1,"seite_bis":2}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 59', 'Produktinformationen', null, 1190, '{"dateien":[{"ip":"59","titel":"Produktinformationen"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '7-2', v_hr, 'Unterschränke PUREline', 1200) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '7-2', 'Unterschränke PUREline', 2, 10, 2, 1210, '{"quelle":"IP_91g","seite_von":3,"seite_bis":4}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 60', 'Unterschränke', null, 1220, '{"dateien":[{"ip":"60","titel":"Unterschränke"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '7-3', v_hr, 'Hängeschränke PUREline', 1230) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '7-3', 'Hängeschränke PUREline', 2, 10, 3, 1240, '{"quelle":"IP_91g","seite_von":5,"seite_bis":6}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 61', 'Hängeschränke', null, 1250, '{"dateien":[{"ip":"61","titel":"Hängeschränke"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '7-4', v_hr, 'Highboards, Seitenschränke Fertigungstypen', 1260) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '7-4', 'Highboards, Seitenschränke Fertigungstypen', 2, 10, 4, 1270, '{"quelle":"IP_91g","seite_von":7,"seite_bis":8}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 62', 'Highboards, Seitenschränke Fertigungstypen', null, 1280, '{"dateien":[{"ip":"62","titel":"Highboards, Seitenschränke Fertigungstypen"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '7-5', v_hr, 'Highboards, Seitenschränke horizontal PUREline', 1290) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '7-5', 'Highboards, Seitenschränke horizontal PUREline', 2, 10, 5, 1300, '{"quelle":"IP_91g","seite_von":9,"seite_bis":10}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 63', 'Highboards, Seitenschränke horizontal', null, 1310, '{"dateien":[{"ip":"63","titel":"Highboards, Seitenschränke horizontal"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '7-6', v_hr, 'Highboards, Seitenschränke vertikal PUREline', 1320) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '7-6', 'Highboards, Seitenschränke vertikal PUREline', 2, 10, 6, 1330, '{"quelle":"IP_91g","seite_von":11,"seite_bis":12}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 64', 'Highboards, Seitenschränke vertikal', null, 1340, '{"dateien":[{"ip":"64","titel":"Highboards, Seitenschränke vertikal"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '7-7', v_hr, 'Wangen PUREline', 1350) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '7-7', 'Wangen PUREline', 2, 10, 7, 1360, '{"quelle":"IP_91g","seite_von":13,"seite_bis":14}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 65', 'Wangen', null, 1370, '{"dateien":[{"ip":"65","titel":"Wangen"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '7-8', v_hr, 'Einzelteile, Sonstiges PUREline', 1380) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '7-8', 'Einzelteile, Sonstiges PUREline', 2, 10, 8, 1390, '{"quelle":"IP_91g","seite_von":15,"seite_bis":16}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 66', 'Einzelteile, Sonstiges', null, 1400, '{"dateien":[{"ip":"66","titel":"Einzelteile, Sonstiges"}]}'::jsonb);

  -- Hauptregister 8: Zubehör Möbelteile, Sonderthemen
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'hauptregister', '8', 'Zubehör Möbelteile, Sonderthemen', 2, 10, 8, 1410, '{"quelle":"IP_90","seite_von":15,"seite_bis":16}'::jsonb)
    returning id into v_hr;
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '8-1', v_hr, 'Zubehör Möbelteile, Einzelteile', 1420) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '8-1', 'Zubehör Möbelteile, Einzelteile', 2, 10, 1, 1430, '{"quelle":"IP_91h","seite_von":1,"seite_bis":2}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 67-68', 'Kranz, Gesimsböden, Deckenblenden · Einzelfrontteile', null, 1440, '{"dateien":[{"ip":"67","titel":"Kranz, Gesimsböden, Deckenblenden"},{"ip":"68","titel":"Einzelfrontteile"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '8-2', v_hr, 'Zuschläge, Sonstiges', 1450) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '8-2', 'Zuschläge, Sonstiges', 2, 10, 2, 1460, '{"quelle":"IP_91h","seite_von":3,"seite_bis":4}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 69', 'Zuschläge/Sonstiges', null, 1470, '{"dateien":[{"ip":"69","titel":"Zuschläge/Sonstiges"}]}'::jsonb);

  -- Hauptregister 9: Zubehör Handelsware
  insert into public.produktteil (produkt_id, typ, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'hauptregister', '9', 'Zubehör Handelsware', 2, 10, 9, 1480, '{"quelle":"IP_90","seite_von":17,"seite_bis":18}'::jsonb)
    returning id into v_hr;
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '9-1', v_hr, 'Schrankinnenausstattung', 1490) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '9-1', 'Schrankinnenausstattung', 2, 10, 1, 1500, '{"quelle":"IP_91i","seite_von":1,"seite_bis":2}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 70-71', 'Unterschrank Innenausstattung · Schrankinnenausstattung', null, 1510, '{"dateien":[{"ip":"70","titel":"Unterschrank Innenausstattung"},{"ip":"71","titel":"Schrankinnenausstattung"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '9-2', v_hr, 'Beleuchtung', 1520) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '9-2', 'Beleuchtung', 2, 10, 2, 1530, '{"quelle":"IP_91i","seite_von":3,"seite_bis":4}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 72', 'Beleuchtung', null, 1540, '{"dateien":[{"ip":"72","titel":"Beleuchtung"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '9-3', v_hr, 'Spülen/Armaturen', 1550) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '9-3', 'Spülen/Armaturen', 2, 10, 3, 1560, '{"quelle":"IP_91i","seite_von":5,"seite_bis":6}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 73-74', 'Übersicht Spülen / Mischbatterien · Spülen/Mischbatterien', null, 1570, '{"dateien":[{"ip":"73","titel":"Übersicht Spülen / Mischbatterien"},{"ip":"74","titel":"Spülen/Mischbatterien"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '9-4', v_hr, 'Sonstiges Zubehör', 1580) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '9-4', 'Sonstiges Zubehör', 2, 10, 4, 1590, '{"quelle":"IP_91i","seite_von":7,"seite_bis":8}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 75', 'Sonstiges Zubehör', null, 1600, '{"dateien":[{"ip":"75","titel":"Sonstiges Zubehör"}]}'::jsonb);
  insert into public.produkt_kapitel (produkt_id, nr, hauptregister_teil_id, name, sortierung)
    values (v_p, '9-5', v_hr, 'Zubehör Stauraum/Hauswirtschaftsraum', 1610) returning id into v_k;
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, register_teile, register_position, sortierung, attribute) values
    (v_p, 'unterregister', v_k, v_hr, '9-5', 'Zubehör Stauraum/Hauswirtschaftsraum', 2, 10, 5, 1620, '{"quelle":"IP_91i","seite_von":9,"seite_bis":10}'::jsonb);
  insert into public.produktteil (produkt_id, typ, kapitel_id, hauptregister_teil_id, nr, titel, seitenzahl, sortierung, attribute) values
    (v_p, 'inhalt', v_k, v_hr, 'IP 76', 'Zubehör Stauraum/Hauswirtschaftsraum', null, 1630, '{"dateien":[{"ip":"76","titel":"Zubehör Stauraum/Hauswirtschaftsraum"}]}'::jsonb);
end $$;

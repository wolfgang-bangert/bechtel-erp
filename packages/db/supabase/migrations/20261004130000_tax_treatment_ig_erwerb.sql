-- Neue Steuerbehandlung für Eingangsrechnungen: innergemeinschaftlicher Erwerb. Der EU-Lieferant
-- liefert steuerfrei (Art. 138 MwStSystRL, "Steuerfreie innergemeinschaftliche Lieferung"), der
-- Empfänger schuldet die Erwerbsteuer und zieht sie als Vorsteuer ab. (Der Schlüssel selbst folgt in
-- der nächsten Migration - ein neuer Enum-Wert kann nicht in derselben Transaktion verwendet werden.)
alter type tax_treatment add value if not exists 'intra_community_acquisition';

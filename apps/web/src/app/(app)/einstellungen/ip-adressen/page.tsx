import { createClient } from "@/lib/supabase/server";
import { IpAdresseTable, type IpAdresse, type Maschine } from "./ui";

export const dynamic = "force-dynamic";

export default async function IpAdressenPage() {
  const supabase = await createClient();
  const [{ data: ips, error }, { data: maschinen }] = await Promise.all([
    supabase
      .from("ip_adresse")
      .select("id, ip_adresse, geraet, hostname, mac_adresse, hersteller, maschine_id, notiz, scan_datum"),
    supabase.from("maschine").select("id, name").eq("aktiv", true).order("sortierung"),
  ]);

  return (
    <>
      <h1>IP-Adressen</h1>
      <p className="lead">
        Übersicht aller IP-Adressen im Haus - welches Gerät welche IP hat. Einmalig aus einem
        LAN-Scan vorbefüllt, danach manuell pflegen: neue IP eintragen, Gerät zuordnen, optional
        mit einer Maschine verknüpfen.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <IpAdresseTable rows={(ips ?? []) as IpAdresse[]} maschinen={(maschinen ?? []) as Maschine[]} />
    </>
  );
}

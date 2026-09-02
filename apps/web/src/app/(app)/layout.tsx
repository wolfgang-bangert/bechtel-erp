import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { signOut } from "../login/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, roles } = await requireStaff();

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">werk</div>

        <div className="nav-group">Stammdaten</div>
        <Link href="/organisationen">Organisationen</Link>

        <div className="nav-group">Vertrieb</div>
        <Link href="/auftraege">Aufträge</Link>
        <Link href="/rechnungen">Rechnungen</Link>

        <div className="nav-group">Buchhaltung</div>
        <Link href="/offene-posten">Offene Posten</Link>
        <Link href="/eingangsrechnungen">Eingangsrechnungen</Link>
        <Link href="/bank">Bank</Link>
        <Link href="/datev-vorschau">DATEV-Vorschau</Link>

        <div className="nav-group">Versand</div>
        <Link href="/versand">Sendungen</Link>
        <Link href="/versand/vergleich">Frachtpreis-Vergleich</Link>

        <div className="nav-group">Einstellungen</div>
        <Link href="/einstellungen">Übersicht</Link>
        <Link href="/einstellungen/sachkonten">Sachkonten</Link>
        <Link href="/einstellungen/steuerschluessel">Steuerschlüssel</Link>
        <Link href="/einstellungen/kostenstellen">Kostenstellen</Link>
        <Link href="/einstellungen/frachtpreise">Frachtpreise</Link>
        <Link href="/einstellungen/versandartikel">Versandartikel</Link>
        <Link href="/einstellungen/packmittel">Kartonagen</Link>
        <Link href="/einstellungen/packregeln">Kartonregeln</Link>
        <Link href="/einstellungen/nummernkreise">Nummernkreise</Link>
        <Link href="/einstellungen/firmenprofil">Firmenprofil</Link>

        <div className="spacer" />

        <div className="nav-group">{user.email}</div>
        <div className="nav-group" style={{ paddingTop: 0 }}>
          {roles.join(", ") || "keine Rolle"}
        </div>
        <form action={signOut}>
          <button className="ghost" type="submit" style={{ width: "100%" }}>
            Abmelden
          </button>
        </form>
      </nav>

      <main className="content">{children}</main>
    </div>
  );
}

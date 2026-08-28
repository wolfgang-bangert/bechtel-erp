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

        <div className="nav-group">Einstellungen</div>
        <Link href="/einstellungen">Übersicht</Link>
        <Link href="/einstellungen/sachkonten">Sachkonten</Link>
        <Link href="/einstellungen/steuerschluessel">Steuerschlüssel</Link>
        <span className="nav-disabled">Kostenstellen · folgt</span>
        <span className="nav-disabled">Nummernkreise · folgt</span>
        <span className="nav-disabled">Firmenprofil · folgt</span>

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

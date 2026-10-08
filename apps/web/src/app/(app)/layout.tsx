import { requireStaff, getModuleLevels } from "@/lib/auth";
import { darfAnsehen, moduleForPath } from "@/lib/modules";
import { signOut } from "../login/actions";
import { NotificationBanner } from "./_notifications/NotificationBanner";
import { Sidebar, type NavGroup } from "./_shared/Sidebar";
import { ZurueckLeiste } from "./_shared/ZurueckLeiste";

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Stammdaten",
    links: [
      { href: "/organisationen", label: "Organisationen" },
      { href: "/darlehen", label: "Darlehen" },
      { href: "/produkte", label: "Produkte" },
    ],
  },
  {
    label: "Vertrieb",
    links: [
      { href: "/auftraege", label: "Aufträge" },
      { href: "/druckauftraege", label: "Druckaufträge" },
      { href: "/rechnungen", label: "Rechnungen" },
    ],
  },
  {
    label: "onlineprinters",
    links: [
      { href: "/druck", label: "Dashboard" },
      { href: "/druck/plan", label: "Belegungs-Board" },
      { href: "/druck/flux-log", label: "flux-Log" },
      { href: "/druck/materialuebersicht", label: "Materialübersicht" },
      { href: "/einstellungen/batch-gruppierung", label: "Batch-Gruppierung" },
      { href: "/abrechnung", label: "Wochen-Abrechnung" },
      { href: "/einstellungen/opri-produkte", label: "Produkte / Flux" },
      { href: "/einstellungen/opri-regeln", label: "Materialregeln" },
      { href: "/einstellungen/standbogen", label: "Standbögen" },
      { href: "/einstellungen/materialkatalog", label: "Materialkatalog" },
      { href: "/einstellungen/preislisten", label: "Preislisten" },
    ],
  },
  {
    label: "Buchhaltung",
    links: [
      { href: "/offene-posten", label: "Offene Posten" },
      { href: "/eingangsrechnungen", label: "Eingangsrechnungen" },
      { href: "/bank", label: "Bank" },
      { href: "/lohnbuchungen", label: "Lohnbuchungen" },
      { href: "/datev-vorschau", label: "DATEV-Vorschau" },
      { href: "/ustva", label: "UStVA" },
    ],
  },
  {
    label: "Versand",
    links: [
      { href: "/versand", label: "Sendungen" },
      { href: "/versand/vergleich", label: "Frachtpreis-Vergleich" },
    ],
  },
  {
    label: "Werkzeuge",
    links: [
      { href: "/werkzeuge/pdf-kombinieren", label: "PDF: Seiten nebeneinander" },
      { href: "/werkzeuge/pdf-seiten-verwalten", label: "PDF: Seiten verwalten" },
      { href: "/werkzeuge/preislisten-analyse", label: "Preislisten-Analyse" },
    ],
  },
  {
    label: "Einstellungen",
    links: [
      { href: "/einstellungen", label: "Übersicht" },
      { href: "/einstellungen/sachkonten", label: "Sachkonten" },
      { href: "/einstellungen/steuerschluessel", label: "Steuerschlüssel" },
      { href: "/einstellungen/kostenstellen", label: "Kostenstellen" },
      { href: "/einstellungen/bank-regeln", label: "Bank-Sachkonto-Regeln" },
      { href: "/einstellungen/vorkontierung", label: "Vorkontierung" },
      { href: "/einstellungen/formate", label: "Formate & Bögen" },
      { href: "/einstellungen/maschinen", label: "Maschinen" },
      { href: "/einstellungen/faehigkeiten", label: "Fähigkeiten" },
      { href: "/einstellungen/vernutzung", label: "Vernutzung" },
      { href: "/einstellungen/wire-o-durchmesser", label: "Wire-O Durchmesser" },
      { href: "/einstellungen/frachtpreise", label: "Frachtpreise" },
      { href: "/einstellungen/versandartikel", label: "Versandartikel" },
      { href: "/einstellungen/ip-adressen", label: "IP-Adressen" },
      { href: "/einstellungen/flux-webhooks", label: "flux-Webhooks" },
      { href: "/einstellungen/packmittel", label: "Kartonagen" },
      { href: "/einstellungen/packregeln", label: "Kartonregeln" },
      { href: "/einstellungen/nummernkreise", label: "Nummernkreise" },
      { href: "/einstellungen/firmenprofil", label: "Firmenprofil" },
      { href: "/einstellungen/mitarbeiter", label: "Mitarbeiter" },
    ],
  },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, roles } = await requireStaff();
  const levels = await getModuleLevels();
  // Menü: nur Seiten aus Modulen, die der Nutzer sehen darf; leere Gruppen entfallen
  const navGroups = NAV_GROUPS.map((g) => ({
    ...g,
    links: g.links.filter((l) => darfAnsehen(levels, moduleForPath(l.href))),
  })).filter((g) => g.links.length > 0);
  const navLabels = Object.fromEntries(NAV_GROUPS.flatMap((g) => g.links.map((l) => [l.href, l.label])));

  return (
    <div className="shell">
      <Sidebar
        groups={navGroups}
        userEmail={user.email ?? ""}
        roles={roles.join(", ")}
        signOutAction={signOut}
      />

      <main className="content">
        <NotificationBanner />
        <ZurueckLeiste navLabels={navLabels} />
        {children}
      </main>
    </div>
  );
}

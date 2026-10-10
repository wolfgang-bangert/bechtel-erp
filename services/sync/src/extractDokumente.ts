import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { supabase } from "./supabase";
import { getObjectBytes, pdfFuerKi } from "./storage";
import { MODEL, parseJson } from "./extractIncoming";
import { findeOderLegeAn, istEigene, ladeEigene, namensSchluessel } from "./organisationFinden";

/**
 * KI-Erkennung für die Dokumentablage (Tabelle dokument, Status extraktion_status = 'offen'):
 * liest Partner, Datum und einen Titel und verknüpft
 *   - Personal-Dokumente mit der Person aus der Personaltabelle (nie mit einer Organisation),
 *   - alle anderen mit einer Organisation - gibt es keine, wird sie angelegt (angelegt_durch = 'dokument').
 * Von Hand gesetzte Angaben (Firma beim Scannen, eigener Titel, Datum) bleiben erhalten.
 * Angestoßen nach jedem neuen Dokument (sync_request "dokumente:extract") und stündlich per Cron.
 */
type Options = { dryRun?: boolean; limit?: number; alle?: boolean };

const PROMPT = `Du bekommst ein Dokument (PDF) aus der Ablage einer deutschen Druckerei (Bechtel Druck).
Es ist z. B. ein Handwerker-Rapport, Lieferschein, Vertrag, ein Personal-Dokument (Arbeitsvertrag,
Bescheinigung, Krankmeldung …) oder etwas Sonstiges. Antworte ausschließlich mit JSON ohne Markdown:

{
  "partner": {                       // der Absender bzw. Vertragspartner - NICHT Bechtel Druck selbst
    "name": string|null,             // Firmenname inkl. Rechtsform, wie auf dem Dokument
    "vat_id": string|null,
    "address": string|null,          // eine Zeile: Straße Nr, PLZ Ort
    "email": string|null,
    "rolle": "lieferant"|"kunde"|"unklar"   // aus Sicht von Bechtel Druck
  },
  "person": {                        // nur bei Personal-Dokumenten: der betroffene Mitarbeiter
    "vorname": string|null,
    "nachname": string|null
  },
  "datum": "YYYY-MM-DD"|null,        // Datum des Dokuments
  "titel": string|null               // kurzer sprechender Titel, z. B. "Rapport Heizungswartung Mai 2026"
}

Regeln:
- Bechtel Druck (Bechtel Druck GmbH & Co. KG, Ebersbach) ist der Empfänger bzw. die eigene Firma - nie "partner".
- Bei Personal-Dokumenten ist partner meist eine Behörde, Krankenkasse o. ä. oder null; "person" ist der Mitarbeiter.
- Unbekanntes als null, nichts erfinden.`;

type Erkannt = {
  partner?: { name?: string | null; vat_id?: string | null; address?: string | null; email?: string | null; rolle?: string | null };
  person?: { vorname?: string | null; nachname?: string | null };
  datum?: string | null;
  titel?: string | null;
};

type Person = { id: string; vorname: string | null; nachname: string | null };

/** Person aus der Personaltabelle: Vor- + Nachname exakt, sonst eindeutiger Nachname. */
function findePerson(p: Erkannt["person"], leute: Person[]): Person | null {
  const vn = p?.vorname ? namensSchluessel(p.vorname) : "";
  const nn = p?.nachname ? namensSchluessel(p.nachname) : "";
  if (!nn) return null;
  const gleicherNachname = leute.filter((x) => x.nachname && namensSchluessel(x.nachname) === nn);
  const exakt = gleicherNachname.filter((x) => vn && x.vorname && namensSchluessel(x.vorname) === vn);
  if (exakt.length === 1) return exakt[0];
  return gleicherNachname.length === 1 ? gleicherNachname[0] : null;
}

const istDatum = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function extractDokumente(opts: Options = {}) {
  const { dryRun = false, limit = 20, alle = false } = opts;
  const client = new Anthropic({ apiKey: env.anthropicKey() });

  let q = supabase
    .from("dokument")
    .select("id, kategorie, titel, file_name, dokument_datum, partner_name, organization_id, personal_id, storage_key")
    .order("created_at", { ascending: true })
    .limit(limit);
  q = alle ? q.in("extraktion_status", ["offen", "fehler"]) : q.eq("extraktion_status", "offen");
  const { data: docs, error } = await q;
  if (error) throw new Error(`dokument lesen: ${error.message}`);

  const eigene = await ladeEigene();
  const { data: leute } = await supabase.from("personal").select("id, vorname, nachname");

  let ok = 0;
  let fehler = 0;
  let orgVerknuepft = 0;
  let orgNeu = 0;
  let personVerknuepft = 0;

  for (const d of docs ?? []) {
    try {
      const pdf = pdfFuerKi(await getObjectBytes(d.storage_key));
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
              { type: "text", text: `Kategorie in der Ablage: ${d.kategorie}.\n\n${PROMPT}` },
            ],
          },
        ],
      });
      const t = res.content.find((c) => c.type === "text");
      const e = parseJson(t && "text" in t ? t.text : "") as Erkannt;

      const upd: Record<string, unknown> = {
        extraktion_status: "fertig",
        extraktion_fehler: null,
        extrahiert_at: new Date().toISOString(),
        ki_daten: e,
      };
      if (!d.dokument_datum && istDatum(e.datum)) upd.dokument_datum = e.datum;
      // Titel nur ersetzen, wenn er nur der Dateiname / ein Scan-Name ist
      const dateiTitel = (d.file_name ?? "").replace(/\.pdf$/i, "");
      if (e.titel?.trim() && (d.titel === dateiTitel || /^Scan[_ ]/i.test(d.titel) || /^Personal$|^Sonstiges$/i.test(d.titel))) {
        upd.titel = e.titel.trim().slice(0, 200);
      }

      if (d.kategorie === "personal") {
        // Personal-Dokumente: Person zuordnen, nie eine Organisation anlegen
        const person = d.personal_id ? null : findePerson(e.person, (leute ?? []) as Person[]);
        if (person) {
          upd.personal_id = person.id;
          upd.partner_name = [person.vorname, person.nachname].filter(Boolean).join(" ");
          personVerknuepft++;
        }
      } else if (!d.organization_id) {
        const partner = e.partner ?? {};
        // beim Scannen eingegebener Firmenname hat Vorrang vor der KI
        const p = d.partner_name ? { ...partner, name: d.partner_name } : partner;
        if (p.name && !istEigene(p, eigene)) {
          const r = await findeOderLegeAn(p, {
            herkunft: "dokument",
            relation: partner.rolle === "kunde" ? "customer" : "supplier",
            eigene,
            dryRun,
          });
          if (r.id) {
            upd.organization_id = r.id;
            orgVerknuepft++;
          }
          if (r.neu) orgNeu++;
          if (!d.partner_name) upd.partner_name = p.name.trim();
        }
      }

      if (dryRun) {
        console.log(
          `  ${d.id.slice(0, 8)} [${d.kategorie}] → ${d.kategorie === "personal" ? (upd.personal_id ? "Person ✓" : "Person ?") : `${e.partner?.name ?? "–"}${upd.organization_id ? " ✓" : ""}`}`,
        );
      } else {
        const { error: uErr } = await supabase.from("dokument").update(upd).eq("id", d.id);
        if (uErr) throw new Error(uErr.message);
      }
      ok++;
    } catch (err) {
      fehler++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${d.id}: Fehler - ${msg}`);
      if (!dryRun) {
        await supabase.from("dokument").update({ extraktion_status: "fehler", extraktion_fehler: msg.slice(0, 500) }).eq("id", d.id);
      }
    }
  }
  return { dokumente: docs?.length ?? 0, ok, fehler, orgVerknuepft, orgNeu, personVerknuepft, dryRun };
}

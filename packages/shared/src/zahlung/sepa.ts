/**
 * SEPA-Überweisung als Sammeldatei (pain.001.001.03 oder .09, Kunde-an-Bank).
 * Reine Funktionen ohne Datenbankzugriff. Namen/Verwendungszwecke werden auf den
 * SEPA-Zeichensatz gebracht (Umlaute ausgeschrieben), IBANs geprüft.
 */
export type SepaFormat = "pain.001.001.03" | "pain.001.001.09";

export type SepaAbsender = { name: string; iban: string; bic?: string | null };
export type SepaZahlung = {
  name: string;
  iban: string;
  betrag: number; // EUR
  endToEndId: string;
  verwendungszweck: string;
};

/** Zeichen auf den SEPA-Zeichensatz abbilden, auf max. Länge kürzen. */
export function sepaText(s: string, max: number): string {
  const ersatz: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss", "&": "+", "€": "EUR", "–": "-", "—": "-", "„": '"', "“": '"', "’": "'" };
  const out = s
    .replace(/[äöüÄÖÜß&€–—„“’]/g, (c) => ersatz[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9/?:().,'+\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out.slice(0, max).trim();
}

/** IDs (MsgId, EndToEndId): max. 35 Zeichen, nur A-Z a-z 0-9 und - . / */
export function sepaId(s: string, max = 35): string {
  return s.replace(/[^A-Za-z0-9\-./]/g, "").slice(0, max) || "NOTPROVIDED";
}

export function istIbanGueltig(iban: string): boolean {
  const x = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(x)) return false;
  const umgestellt = x.slice(4) + x.slice(0, 4);
  const zahl = umgestellt.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const ch of zahl) rest = (rest * 10 + Number(ch)) % 97;
  return rest === 1;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const betragText = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function erzeugePain001(opts: {
  format: SepaFormat;
  msgId: string;
  erstellt: Date;
  ausfuehrung: string; // YYYY-MM-DD
  absender: SepaAbsender;
  zahlungen: SepaZahlung[];
}): string {
  const { format, absender, zahlungen } = opts;
  if (!zahlungen.length) throw new Error("Keine Zahlungen");
  if (!istIbanGueltig(absender.iban)) throw new Error("Absender-IBAN ungültig");
  const summe = Math.round(zahlungen.reduce((a, z) => a + z.betrag, 0) * 100) / 100;
  const v9 = format === "pain.001.001.09";
  const ns = `urn:iso:std:iso:20022:tech:xsd:${format}`;
  const bic = absender.bic?.replace(/\s+/g, "").toUpperCase();
  const dbtrAgt = bic && /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)
    ? `<FinInstnId><${v9 ? "BICFI" : "BIC"}>${bic}</${v9 ? "BICFI" : "BIC"}></FinInstnId>`
    : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;
  const name = sepaText(absender.name, 70);
  const iso = opts.erstellt.toISOString().replace(/\.\d{3}Z$/, "");

  const tx = zahlungen
    .map((z, i) => {
      if (!istIbanGueltig(z.iban)) throw new Error(`IBAN ungültig: ${z.name}`);
      if (!(z.betrag > 0) || z.betrag > 999999999.99) throw new Error(`Betrag ungültig: ${z.name}`);
      return `<CdtTrfTxInf><PmtId><EndToEndId>${esc(sepaId(z.endToEndId || `E2E-${i + 1}`))}</EndToEndId></PmtId>` +
        `<Amt><InstdAmt Ccy="EUR">${betragText(z.betrag)}</InstdAmt></Amt>` +
        `<Cdtr><Nm>${esc(sepaText(z.name, 70) || "Empfaenger")}</Nm></Cdtr>` +
        `<CdtrAcct><Id><IBAN>${z.iban.replace(/\s+/g, "").toUpperCase()}</IBAN></Id></CdtrAcct>` +
        `<RmtInf><Ustrd>${esc(sepaText(z.verwendungszweck, 140))}</Ustrd></RmtInf></CdtTrfTxInf>`;
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Document xmlns="${ns}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${ns} ${format}.xsd">` +
    `<CstmrCdtTrfInitn><GrpHdr><MsgId>${esc(sepaId(opts.msgId))}</MsgId><CreDtTm>${iso}</CreDtTm>` +
    `<NbOfTxs>${zahlungen.length}</NbOfTxs><CtrlSum>${betragText(summe)}</CtrlSum><InitgPty><Nm>${esc(name)}</Nm></InitgPty></GrpHdr>` +
    `<PmtInf><PmtInfId>${esc(sepaId(opts.msgId + "-1"))}</PmtInfId><PmtMtd>TRF</PmtMtd><BtchBookg>true</BtchBookg>` +
    `<NbOfTxs>${zahlungen.length}</NbOfTxs><CtrlSum>${betragText(summe)}</CtrlSum>` +
    `<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>` +
    `<ReqdExctnDt>${v9 ? `<Dt>${opts.ausfuehrung}</Dt>` : opts.ausfuehrung}</ReqdExctnDt>` +
    `<Dbtr><Nm>${esc(name)}</Nm></Dbtr><DbtrAcct><Id><IBAN>${absender.iban.replace(/\s+/g, "").toUpperCase()}</IBAN></Id></DbtrAcct>` +
    `<DbtrAgt>${dbtrAgt}</DbtrAgt><ChrgBr>SLEV</ChrgBr>${tx}</PmtInf></CstmrCdtTrfInitn></Document>\n`
  );
}

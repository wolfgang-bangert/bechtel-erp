import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

export type CamtEntry = {
  iban: string;
  bookingDate: string; // YYYY-MM-DD
  valueDate: string | null;
  amount: number; // + Gutschrift, - Lastschrift
  currency: string;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  purpose: string | null;
  endToEndId: string | null;
  bankRef: string | null;
  dedupKey: string;
};

const arr = <T>(x: unknown): T[] =>
  x == null ? [] : Array.isArray(x) ? (x as T[]) : [x as T];
const txt = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>))
    return String((v as Record<string, unknown>)["#text"]);
  return String(v);
};

export function parseCamt053(xml: string): CamtEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    trimValues: true,
  });
  const doc = parser.parse(xml);
  const root = doc?.Document?.BkToCstmrStmt;
  if (!root) throw new Error("Kein CAMT.053 (BkToCstmrStmt fehlt)");

  const out: CamtEntry[] = [];
  const seen = new Map<string, number>();

  for (const stmt of arr<Record<string, unknown>>(root.Stmt)) {
    const acct = stmt.Acct as Record<string, unknown> | undefined;
    const iban =
      txt(((acct?.Id as Record<string, unknown>) ?? {}).IBAN) || txt(acct?.Id) || "";

    for (const ntry of arr<Record<string, unknown>>(stmt.Ntry)) {
      const ntryCdtDbt = txt(ntry.CdtDbtInd);
      const bookg = txt((ntry.BookgDt as Record<string, unknown>)?.Dt).slice(0, 10);
      const valDt =
        txt((ntry.ValDt as Record<string, unknown>)?.Dt).slice(0, 10) || null;
      const acctSvcrRef = txt(ntry.AcctSvcrRef) || null;
      const ntryDtls = arr<Record<string, unknown>>(
        (ntry.NtryDtls as Record<string, unknown>)?.TxDtls,
      );
      const details = ntryDtls.length
        ? ntryDtls
        : [null as unknown as Record<string, unknown>];

      for (const tx of details) {
        const cdtDbt = tx ? txt(tx.CdtDbtInd) || ntryCdtDbt : ntryCdtDbt;
        const amtNode = tx?.Amt ?? ntry.Amt;
        const rawAmt = Number(txt(amtNode).replace(",", "."));
        const ccy =
          (amtNode as Record<string, unknown>)?.["@_Ccy"]?.toString() ?? "EUR";
        const amount = (cdtDbt === "DBIT" ? -1 : 1) * Math.abs(rawAmt);
        const isCredit = cdtDbt !== "DBIT";

        const rp = (tx?.RltdPties ?? {}) as Record<string, unknown>;
        const party = (isCredit ? rp.Dbtr : rp.Cdtr) as Record<string, unknown> | undefined;
        const partyAcct = (isCredit ? rp.DbtrAcct : rp.CdtrAcct) as
          | Record<string, unknown>
          | undefined;
        const cpName = txt(party?.Nm) || null;
        const cpIban =
          txt((partyAcct?.Id as Record<string, unknown>)?.IBAN) || null;

        const rmt = (tx?.RmtInf ?? {}) as Record<string, unknown>;
        const purpose =
          arr<unknown>(rmt.Ustrd).map(txt).join(" ").replace(/\s+/g, " ").trim() ||
          null;
        const e2e =
          txt((tx?.Refs as Record<string, unknown>)?.EndToEndId).replace(
            /^NOTPROVIDED$/,
            "",
          ) || null;

        const base = [
          iban, bookg, amount.toFixed(2), purpose ?? "", cpName ?? "",
          cpIban ?? "", e2e ?? "", acctSvcrRef ?? "",
        ].join("|");
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        const dedupKey =
          "camt:" + createHash("sha1").update(`${base}#${n}`).digest("hex");

        if (!iban || !bookg || !Number.isFinite(amount)) continue;
        out.push({
          iban,
          bookingDate: bookg,
          valueDate: valDt,
          amount,
          currency: ccy,
          counterpartyName: cpName,
          counterpartyIban: cpIban,
          purpose,
          endToEndId: e2e,
          bankRef: acctSvcrRef,
          dedupKey,
        });
      }
    }
  }
  return out;
}

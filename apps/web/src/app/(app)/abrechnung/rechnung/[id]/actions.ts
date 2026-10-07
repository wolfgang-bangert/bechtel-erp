"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { putObject } from "@/lib/storage";
import { erzeugeRechnungPdf } from "@werk/shared/pdf/rechnung";
import { erzeugeAufstellungPdf, pdfAnhaengen } from "@werk/shared/pdf/aufstellung";
import { ladeAufstellungWochen } from "@/lib/abrechnung/aufstellung";
import { erzeugeZugferdPdf } from "@werk/shared/fakturierung/zugferd";
import { erzeugeOnlineprintersCsv } from "@werk/shared/fakturierung/csv";

export type State = { ok?: boolean; error?: string; note?: string };

const TAX_RATE = 19;

export async function rechnungAbschliessenAction(_p: State, fd: FormData): Promise<State> {
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "id fehlt" };
  const supabase = await createClient();

  const { data: invoice, error: invErr } = await supabase
    .from("invoice")
    .select("id, status, organization_id, net_total, tax_total, gross_total")
    .eq("id", id)
    .maybeSingle();
  if (invErr) return { error: invErr.message };
  if (!invoice) return { error: "Rechnung nicht gefunden" };
  if (invoice.status === "festgeschrieben") return { error: "Rechnung ist bereits abgeschlossen" };

  const { data: items } = await supabase
    .from("invoice_item")
    .select("description, net_amount, tax_amount, gross_amount")
    .eq("invoice_id", id)
    .order("position");
  if (!items?.length) return { error: "Rechnung hat keine Positionen" };

  const [{ data: org }, { data: addr }, { data: setting }] = await Promise.all([
    supabase.from("organization").select("name, vat_id").eq("id", invoice.organization_id).maybeSingle(),
    supabase
      .from("address")
      .select("line1, street, house_number, zip, city, country")
      .eq("organization_id", invoice.organization_id)
      .eq("is_default", true)
      .maybeSingle(),
    supabase.from("setting").select("value").eq("key", "company.profile").maybeSingle(),
  ]);
  if (!org) return { error: "Organisation nicht gefunden" };

  const profile = (setting?.value ?? {}) as {
    name?: string;
    legal_name?: string;
    address?: { line1?: string; zip?: string; city?: string; country?: string };
    vat_id?: string;
    tax_number?: string;
    bank?: { iban?: string; bic?: string; name?: string };
  };

  const { data: numberData, error: numErr } = await supabase.rpc("next_number", { p_key: "invoice" });
  if (numErr) return { error: `Rechnungsnummer: ${numErr.message}` };
  const invoiceNumber = numberData as string;
  const invoiceDate = new Date().toISOString().slice(0, 10);

  const empfaengerAddress = addr
    ? {
        line1: addr.line1 ?? ([addr.street, addr.house_number].filter(Boolean).join(" ") || null),
        zip: addr.zip,
        city: addr.city,
        country: addr.country,
      }
    : null;

  // 1) Basis-PDF (werk-nativ, pdf-lib)
  const rechnungPdf = await erzeugeRechnungPdf({
    absender: {
      name: profile.name ?? "Bechtel Druck",
      legal_name: profile.legal_name,
      address: profile.address,
      vat_id: profile.vat_id,
      tax_number: profile.tax_number,
      bank: profile.bank,
    },
    empfaenger: { name: org.name, address: empfaengerAddress, vat_id: org.vat_id },
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    positionen: items.map((i) => ({ description: i.description ?? "", net_amount: Number(i.net_amount) })),
    net_total: Number(invoice.net_total),
    tax_total: Number(invoice.tax_total),
    gross_total: Number(invoice.gross_total),
    tax_rate: TAX_RATE,
  });

  // 2) Auftrags-CSV (alle Wochen dieser Rechnung)
  const { data: abrechnungen } = await supabase.from("abrechnung").select("id").eq("invoice_id", id);
  const abrechnungIds = (abrechnungen ?? []).map((a) => a.id as string);
  const { data: positionen } = abrechnungIds.length
    ? await supabase
        .from("abrechnung_position")
        .select("referenz, betrag_netto")
        .in("abrechnung_id", abrechnungIds)
    : { data: [] };
  const csv = erzeugeOnlineprintersCsv(
    (positionen ?? [])
      .filter((p) => p.referenz)
      .map((p) => ({ order_number: p.referenz as string, order_price: Number(p.betrag_netto) })),
    invoiceNumber,
    invoiceDate,
  );

  // 2b) Aufstellung (je Woche alle Aufträge mit Listenpreis, Betrag, Begründung) als Anlage anhängen
  const { wochen } = await ladeAufstellungWochen(supabase, abrechnungIds);
  const aufstellungPdf = await erzeugeAufstellungPdf({
    absenderName: profile.legal_name || profile.name || "Bechtel Druck",
    empfaengerName: org.name,
    rechnungsnummer: invoiceNumber,
    wochen,
  });
  const basisPdf = await pdfAnhaengen(rechnungPdf, aufstellungPdf);

  // 3) ZUGFeRD-XML + CSV als Anhang einbetten (PDF/A-3b)
  const { pdf: finalBytes, validationWarning } = await erzeugeZugferdPdf(
    basisPdf,
    {
      verkaeufer: {
        name: profile.legal_name || profile.name || "Bechtel Druck",
        address: profile.address,
        vat_id: profile.vat_id,
      },
      kaeufer: { name: org.name, address: empfaengerAddress, vat_id: org.vat_id },
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      positionen: items.map((i) => ({ description: i.description ?? "", net_amount: Number(i.net_amount) })),
      net_total: Number(invoice.net_total),
      tax_total: Number(invoice.tax_total),
      gross_total: Number(invoice.gross_total),
      tax_rate: TAX_RATE,
    },
    { filename: "rechnungspositionen.csv", content: csv },
  );

  const key = `rechnungen/${invoiceDate.slice(0, 4)}/${invoiceNumber}.pdf`;
  await putObject(key, Buffer.from(finalBytes), "application/pdf");

  const { error: updErr } = await supabase
    .from("invoice")
    .update({
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      status: "festgeschrieben",
      finalized_at: new Date().toISOString(),
      pdf_storage_key: key,
    })
    .eq("id", id);
  if (updErr) return { error: updErr.message };

  revalidatePath(`/abrechnung/rechnung/${id}`);
  revalidatePath("/abrechnung");
  return { ok: true, note: `Rechnung ${invoiceNumber} erzeugt. ${validationWarning}` };
}

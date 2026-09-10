"use client";

import { useActionState } from "react";
import { saveGruppe, saveStamm, type RowState } from "./actions";

const empty: RowState = {};

export type TplOpt = { id: string; name: string; flux_product: string };
export type Gruppe = {
  id: string;
  kuerzel: string;
  name: string;
  titel_kuerzel: string | null;
  flux_template: string | null;
  flux_template_id: string | null;
  druckverfahren: string | null;
};
export type Stamm = {
  id: string;
  gruppe_id: string | null;
  sku: string;
  name: string;
  flux_template: string | null;
  flux_template_id: string | null;
};

function TemplateSelect({
  value,
  templates,
  inheritedLabel,
}: {
  value: string | null;
  templates: TplOpt[];
  inheritedLabel?: string | null;
}) {
  return (
    <select name="flux_template_id" defaultValue={value ?? ""} style={{ width: 220 }}>
      <option value="">{inheritedLabel ? `— erbt: ${inheritedLabel}` : "— kein Template"}</option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} ({t.flux_product})
        </option>
      ))}
    </select>
  );
}

function GruppeRow({ g, templates }: { g: Gruppe; templates: TplOpt[] }) {
  const [state, action, pending] = useActionState(saveGruppe, empty);
  return (
    <form className="row" action={action} style={{ background: "var(--tag-bg)" }}>
      <input type="hidden" name="id" value={g.id} />
      <span className="w-code" style={{ fontWeight: 600 }}>{g.kuerzel}</span>
      <span className="w-name" style={{ fontWeight: 600 }}>{g.name}</span>
      <input
        name="titel_kuerzel"
        defaultValue={g.titel_kuerzel ?? ""}
        placeholder="Titel-Kürzel"
        title="Abkürzung für den flux-Titel (z.B. WK)"
        style={{ width: 90 }}
      />
      <TemplateSelect value={g.flux_template_id} templates={templates} />
      <input
        name="flux_template"
        defaultValue={g.flux_template ?? ""}
        placeholder="Produkt (Text)"
        style={{ width: 150 }}
      />
      <input
        name="druckverfahren"
        defaultValue={g.druckverfahren ?? ""}
        placeholder="Druckverfahren"
        style={{ width: 120 }}
      />
      <button type="submit" disabled={pending}>{pending ? "…" : "Speichern"}</button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

function StammRow({
  s,
  templates,
  inheritedTplLabel,
  inheritedText,
}: {
  s: Stamm;
  templates: TplOpt[];
  inheritedTplLabel: string | null;
  inheritedText: string | null;
}) {
  const [state, action, pending] = useActionState(saveStamm, empty);
  return (
    <form className="row" action={action}>
      <input type="hidden" name="id" value={s.id} />
      <span className="w-code" style={{ color: "var(--muted)" }}>{s.sku}</span>
      <span className="w-name">{s.name}</span>
      <TemplateSelect value={s.flux_template_id} templates={templates} inheritedLabel={inheritedTplLabel} />
      <input
        name="flux_template"
        defaultValue={s.flux_template ?? ""}
        placeholder={inheritedText ? `erbt: ${inheritedText}` : "Produkt (Text)"}
        style={{ width: 150 }}
      />
      <button type="submit" disabled={pending}>{pending ? "…" : "Speichern"}</button>
      {state.ok && <span className="msg-ok">✓</span>}
      {state.error && <span className="msg-err">{state.error}</span>}
    </form>
  );
}

export function OpriProdukte({
  gruppen,
  stamm,
  templates,
}: {
  gruppen: Gruppe[];
  stamm: Stamm[];
  templates: TplOpt[];
}) {
  const tplName = (id: string | null) => templates.find((t) => t.id === id)?.name ?? null;
  return (
    <div className="rows">
      {gruppen.map((g) => {
        const kids = stamm.filter((s) => s.gruppe_id === g.id);
        return (
          <div key={g.id} style={{ marginBottom: 14 }}>
            <GruppeRow g={g} templates={templates} />
            {kids.map((s) => (
              <StammRow
                key={s.id}
                s={s}
                templates={templates}
                inheritedTplLabel={tplName(g.flux_template_id)}
                inheritedText={g.flux_template}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

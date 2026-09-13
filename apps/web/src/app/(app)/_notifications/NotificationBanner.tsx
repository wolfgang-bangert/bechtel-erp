import { createClient } from "@/lib/supabase/server";
import { markNotificationRead } from "./actions";

const LEVEL_LABEL: Record<string, string> = {
  error: "Fehler",
  warning: "Hinweis",
  info: "Info",
};
const LEVEL_CLASS: Record<string, string> = {
  error: "banner-err",
  warning: "banner-warn",
  info: "banner-info",
};

/**
 * Zeigt ungelesene `notification`-Zeilen oben in der App an (aktuell v. a.
 * Bank-Sync-Fehler aus dem n8n-Überwachungs-Workflow, siehe
 * apps/web/src/app/api/n8n/notify/route.ts). Erscheint auf jeder Seite, weil
 * sie im App-Layout eingebunden ist.
 */
export async function NotificationBanner() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification")
    .select("id, level, source, title, message, created_at")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
  const items = data ?? [];
  if (!items.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((n) => (
        <div
          key={n.id}
          className={LEVEL_CLASS[n.level] ?? "banner-info"}
          style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}
        >
          <div>
            <strong>
              {LEVEL_LABEL[n.level] ?? n.level}: {n.title}
            </strong>
            <div>{n.message}</div>
            <div className="count" style={{ marginTop: 2 }}>
              {n.source} · {new Date(n.created_at).toLocaleString("de-DE")}
            </div>
          </div>
          <form action={markNotificationRead}>
            <input type="hidden" name="id" value={n.id} />
            <button type="submit" className="ghost">
              Gelesen
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}

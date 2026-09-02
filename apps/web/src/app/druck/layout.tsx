import { requireStaff } from "@/lib/auth";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function DruckLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaff();
  return (
    <div className="druck">
      <div className="druck-bar no-print">
        <PrintButton />
        <span>Im Druckdialog „Als PDF sichern“ wählen.</span>
      </div>
      <div className="druck-sheet">{children}</div>
      <style>{`
        .druck { background: #fff; color: #111; min-height: 100dvh; padding: 24px; }
        .druck-bar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px;
          font: 13px/1.4 system-ui, sans-serif; color: #555; }
        .druck-bar button { background: #111; color: #fff; border: 0; border-radius: 6px;
          padding: 7px 14px; font: inherit; cursor: pointer; }
        .druck-sheet { max-width: 800px; margin: 0 auto; font: 13px/1.5 system-ui, "Helvetica Neue", sans-serif; color: #111; }
        .druck-sheet h1 { font-size: 20px; margin: 0 0 4px; }
        .druck-sheet h2 { font-size: 14px; margin: 20px 0 6px; }
        .druck-sheet table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .druck-sheet th, .druck-sheet td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ccc; vertical-align: top; }
        .druck-sheet th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #555; }
        .druck-sheet .muted { color: #555; }
        .druck-sheet .sender { font-size: 11px; color: #555; }
        .druck-sheet .addr { white-space: pre-line; }
        .druck-sheet .row2 { display: flex; justify-content: space-between; gap: 40px; }
        .label-sheet { page-break-after: always; border: 1px solid #111; padding: 18px; margin-bottom: 18px; }
        .label-sheet:last-child { page-break-after: auto; }
        .label-sheet .big { font-size: 18px; font-weight: 700; }
        @media print {
          .no-print { display: none !important; }
          .druck, .druck-sheet { padding: 0; margin: 0; max-width: none; }
          @page { margin: 16mm; }
        }
      `}</style>
    </div>
  );
}

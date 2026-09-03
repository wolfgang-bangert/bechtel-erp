import Link from "next/link";
import { RegelForm } from "../RegelForm";
import { loadRegelOpts } from "../loadOpts";

export const dynamic = "force-dynamic";

export default async function NeueRegelPage() {
  const opts = await loadRegelOpts();
  return (
    <>
      <h1>Neue Materialregel</h1>
      <p className="lead">
        <Link href="/einstellungen/opri-regeln">← Übersicht</Link>
      </p>
      <RegelForm {...opts} />
    </>
  );
}

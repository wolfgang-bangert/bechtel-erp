import { PasswortForm } from "./PasswortForm";

export const dynamic = "force-dynamic";

export default async function PasswortPage({
  searchParams,
}: {
  searchParams: Promise<{ neu?: string }>;
}) {
  const { neu } = await searchParams;
  return (
    <>
      <h1>Passwort</h1>
      <p className="lead">Eigenes Passwort setzen oder ändern.</p>
      <PasswortForm neu={neu === "1"} />
    </>
  );
}

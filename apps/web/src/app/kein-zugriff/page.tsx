import { signOut } from "../login/actions";

export default async function NoAccess({ searchParams }: { searchParams: Promise<{ bereich?: string }> }) {
  const { bereich } = await searchParams;
  return (
    <div className="centered">
      <div className="card">
        <h1>Kein Zugriff</h1>
        {bereich ? (
          <p className="sub">
            Für den Bereich „{bereich}“ hast du keine Berechtigung. Wende dich an einen Administrator,
            wenn du ihn brauchst.
          </p>
        ) : (
          <p className="sub">
            Dein Konto hat noch keine Berechtigung. Ein Administrator muss dir unter Einstellungen →
            Mitarbeiter Module freigeben.
          </p>
        )}
        <p>
          <a href="/start">Zur Startseite</a>
        </p>
        <form action={signOut}>
          <button className="ghost" type="submit">
            Abmelden
          </button>
        </form>
      </div>
    </div>
  );
}

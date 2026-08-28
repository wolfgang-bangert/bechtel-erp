import { signOut } from "../login/actions";

export default function NoAccess() {
  return (
    <div className="centered">
      <div className="card">
        <h1>Kein Zugriff</h1>
        <p className="sub">
          Dein Konto hat keine Mitarbeiterrolle. Ein Administrator muss dir in
          <code> user_role </code> eine Rolle zuweisen.
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

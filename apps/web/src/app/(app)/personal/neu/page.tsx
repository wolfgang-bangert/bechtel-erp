import { NeuForm } from "./NeuForm";

export default function PersonNeuPage() {
  return (
    <>
      <h1>Person anlegen</h1>
      <p className="lead">Erst den Namen, alle weiteren Angaben danach auf der Seite der Person.</p>
      <NeuForm />
    </>
  );
}

// Whether the worker adds the host-made instrument composition task to a plan. It costs one model
// call of about USD 0.01 a command (P4b live composition 2), so it is on by default only on the
// live route, where the demo runs; a replay route has no recorded answer for it unless a test
// supplies one. SITERRA_COMPOSE_INSTRUMENTS=0 turns it off and =1 turns it on anywhere.
export function composeInstrumentsEnabled(
  env: Record<string, string | undefined>,
  route: "model_api" | "replay",
): boolean {
  const setting = env["SITERRA_COMPOSE_INSTRUMENTS"];
  if (setting === "0") return false;
  if (setting === "1") return true;
  return route === "model_api";
}

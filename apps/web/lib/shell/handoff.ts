// A question typed in an instrument's command line, carried to the valley's command line for this tab only. The
// valley shows it there, focused, and sends nothing: the viewer's own Enter in the valley starts the session.

const KEY = "siterra.valleyQuestion";

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The tab's session storage, or null where the browser keeps none (private windows, blocked site data). */
function session(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function carryQuestion(text: string, store: Store | null = session()): void {
  const q = text.trim();
  if (!q || !store) return;
  try {
    store.setItem(KEY, q);
  } catch {
    // no storage: the valley opens with its own question
  }
}

/** The carried question, once; it is removed as it is read. */
export function takeQuestion(store: Store | null = session()): string | null {
  if (!store) return null;
  try {
    const q = store.getItem(KEY);
    store.removeItem(KEY);
    return q;
  } catch {
    return null;
  }
}

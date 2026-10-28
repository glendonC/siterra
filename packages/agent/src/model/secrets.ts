// Removes the Model API key, and anything shaped like one, from text before it is logged or stored
// (error codes and messages from the API, the Keychain tool's stderr). Model API keys have the
// shape LLM_<id>_<secret>; the same rule as .local/lanes/meta/gate01/gate01_check.py.

const KEY_SHAPE = /LLM_\d+_[A-Za-z0-9_-]+/g;

export const KEY_REMOVED = "[key removed]";

export function scrubSecrets(text: string, keys: readonly string[] = []): string {
  let out = text;
  for (const key of keys) {
    if (key !== "") out = out.split(key).join(KEY_REMOVED);
  }
  return out.replace(KEY_SHAPE, KEY_REMOVED);
}

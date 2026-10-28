import { describe, expect, it } from "vitest";
import { readSingleKeys, writeSingleKeys } from "./preferences";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => {
      m.clear();
    },
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => {
      m.delete(k);
    },
    setItem: (k, v) => {
      m.set(k, v);
    },
  };
}

describe("single-key preference", () => {
  it("is on until the viewer turns it off, and remembers that", () => {
    const s = memoryStorage();
    expect(readSingleKeys(s)).toBe(true);
    writeSingleKeys(s, false);
    expect(readSingleKeys(s)).toBe(false);
  });

  it("stays on when storage is unavailable", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(readSingleKeys(broken)).toBe(true);
    expect(() => {
      writeSingleKeys(broken, false);
    }).not.toThrow();
  });
});

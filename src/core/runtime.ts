/**
 * Small helpers that paper over differences between Node 18+, Bun, Deno,
 * browsers and edge runtimes. Nothing here imports a Node module statically.
 */

let cachedCrypto: Crypto | undefined;

/**
 * Returns the Web Crypto object. Node 18 only exposes it as
 * `require("node:crypto").webcrypto`, so fall back to that when the global is
 * missing. The specifier sits in a variable so edge bundlers leave it alone.
 */
export async function getCrypto(): Promise<Crypto> {
  if (cachedCrypto) return cachedCrypto;
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto?.subtle) {
    cachedCrypto = globalCrypto;
    return globalCrypto;
  }
  const specifier = "node:crypto";
  try {
    const mod = (await import(/* webpackIgnore: true */ specifier)) as { webcrypto?: Crypto };
    if (mod.webcrypto?.subtle) {
      cachedCrypto = mod.webcrypto;
      return mod.webcrypto;
    }
  } catch {
    // fall through
  }
  throw new Error("Web Crypto is not available in this runtime.");
}

/** Random UUID v4, used for automatic Idempotency-Keys. */
export async function randomUUID(): Promise<string> {
  const c = await getCrypto();
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = c.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Reads an environment variable where one exists. Never throws. */
export function readEnv(name: string): string | undefined {
  try {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const value = env?.[name];
    return value === undefined || value === "" ? undefined : value;
  } catch {
    return undefined;
  }
}

/** True in a web page. Workers, Deno, Bun and Node return false. */
export function isBrowser(): boolean {
  const g = globalThis as { window?: { document?: unknown }; document?: unknown };
  return typeof g.window !== "undefined" && typeof g.document !== "undefined";
}

/** Waits `ms` milliseconds, or rejects early if `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Standard base64 decode to bytes, using `atob` which every target runtime has. */
export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Standard base64 encode of bytes. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

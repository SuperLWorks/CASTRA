export type HostedDigestWriteBinding = {
  commandType: "write";
  expectedRevision: number;
  idempotencyKey: string;
  stateDigest: string;
  stateSchemaVersion: 13;
};

export type HostedDigestRestoreBinding = {
  commandType: "restore";
  expectedRevision: number;
  idempotencyKey: string;
  targetRevision: number;
};

function canonicalJsonValue(value: unknown, arrayElement = false): string | undefined {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (Array.isArray(value)) {
    return `[${value.map((child) => canonicalJsonValue(child, true) ?? "null").join(",")}]`;
  }
  if (typeof value === "object") {
    const members: string[] = [];
    for (const [key, child] of Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
      const canonicalChild = canonicalJsonValue(child);
      if (canonicalChild !== undefined) members.push(`${JSON.stringify(key)}:${canonicalChild}`);
    }
    return `{${members.join(",")}}`;
  }
  return arrayElement ? "null" : undefined;
}

export function canonicalHostedJson(value: unknown): string {
  const result = canonicalJsonValue(value);
  if (result === undefined) throw new Error("Hosted operational-state digest input is not JSON serializable.");
  return result;
}

export async function hostedSha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function hostedSha256Bytes(value: Uint8Array): Promise<string> {
  const exactBytes = Uint8Array.from(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", exactBytes);
  exactBytes.fill(0);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function hostedWriteBinding(input: Omit<HostedDigestWriteBinding, "commandType">): HostedDigestWriteBinding {
  return { commandType: "write", ...input };
}

export function hostedRestoreBinding(input: Omit<HostedDigestRestoreBinding, "commandType">): HostedDigestRestoreBinding {
  return { commandType: "restore", ...input };
}

export function hostedStateDocumentDigest(stateDocument: unknown): Promise<string> {
  return hostedSha256(canonicalHostedJson(stateDocument));
}

export function hostedRequestBindingDigest(binding: HostedDigestWriteBinding | HostedDigestRestoreBinding): Promise<string> {
  return hostedSha256(canonicalHostedJson(binding));
}

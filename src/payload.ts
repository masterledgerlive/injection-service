/**
 * Parse POST /api/inject payload bytes.
 * Accepts even-length hex (`bytes`) or standard `base64`.
 */

export function parseInjectionPayload(body: {
  bytes?: unknown;
  base64?: unknown;
}): Buffer {
  if (body.bytes !== undefined && body.bytes !== null && body.bytes !== "") {
    return parseBytes(body.bytes);
  }

  if (typeof body.base64 === "string" && body.base64.length > 0) {
    const buf = Buffer.from(body.base64, "base64");
    if (buf.length === 0) {
      throw new Error("Invalid base64 payload");
    }
    return buf;
  }

  throw new Error("Missing payload: provide bytes or base64");
}

function parseBytes(bytes: unknown): Buffer {
  if (typeof bytes === "string") {
    const raw = bytes.trim();
    const hex = raw.startsWith("0x") || raw.startsWith("0X") ? raw.slice(2) : raw;
    if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
      throw new Error("Invalid bytes: expected even-length hex string");
    }
    return Buffer.from(hex, "hex");
  }

  if (Array.isArray(bytes)) {
    if (!bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
      throw new Error("Invalid bytes: expected array of integers 0-255");
    }
    if (bytes.length === 0) {
      throw new Error("Invalid bytes: payload must be non-empty");
    }
    return Buffer.from(bytes);
  }

  throw new Error("Invalid bytes");
}

export function parsePayAmountWei(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "0";
  }
  const asString = String(value);
  if (!/^[0-9]+$/.test(asString)) {
    throw new Error("payAmountWei must be a non-negative integer");
  }
  return asString;
}

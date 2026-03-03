import { createHash } from "crypto";

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function sha256File(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

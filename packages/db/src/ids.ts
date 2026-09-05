import { randomBytes } from "node:crypto";

function newId(prefix: string, hexBytes: number): string {
  return `${prefix}_${randomBytes(hexBytes).toString("hex")}`;
}

export function newProjectId(): string {
  return newId("proj", 2);
}

export function newPromptId(): string {
  return newId("pr", 4);
}

export function newApiKeyId(): string {
  return newId("key", 8);
}

export function newRunBudgetId(): string {
  return newId("bud", 4);
}

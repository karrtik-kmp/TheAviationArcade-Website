/**
 * ContentStore: the Aircraft Identifier and Plane of the Day desks. Under D-2 this content moves to
 * the backend admin API, so only a D1 adapter exists (content-d1.ts); a backend adapter replaces it
 * rather than living beside it. The desk's errors are the EditorialStore error types.
 */
import type { EditorialData, EditorialRecord } from "../types.ts";
import type { Actor } from "./store.ts";

export type ContentKind = "identifier" | "potd";
export type ContentSource = { submissionId: string } | { sample: true };
export type ContentSave = {
  baseVersion: unknown;
  status: unknown;
  data: unknown;
  dateKey?: unknown;
};
/** A published or scheduled Plane of the Day with its stored photograph. */
export type FeaturedRow = {
  record: EditorialRecord;
  imageKey: string;
  imageMime: string;
};

export interface ContentStore {
  list(): Promise<EditorialRecord[]>;
  createDraft(kind: unknown, source: ContentSource, actor: Actor): Promise<EditorialRecord>;
  save(id: string, input: ContentSave, actor: Actor): Promise<EditorialRecord>;
  /** Features due on or before `day`, newest first, each with a credit and an approved photograph. */
  featured(day: string): Promise<FeaturedRow[]>;
}

const textFields = [
  "title",
  "aircraft",
  "photographer",
  "credit",
  "description",
  "correctAnswer",
  "difficulty",
  "factualSource",
  "imageUrl",
] as const;

/** Shape check for untrusted content data. */
export function isContentData(value: unknown): value is EditorialData {
  const data = value as EditorialData | null;
  return (
    !!data &&
    typeof data === "object" &&
    textFields.every((key) => typeof data[key] === "string") &&
    Array.isArray(data.distractors) &&
    data.distractors.length === 3 &&
    data.distractors.every((s) => typeof s === "string")
  );
}

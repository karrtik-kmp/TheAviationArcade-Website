import type { EditorialData, EditorialRecord } from "@/lib/types";

/** Nonpublishable editorial drafts created by admin "Load demo data" and shown to the demo account. */
export function sampleEditorialData(kind: EditorialRecord["kind"]): EditorialData {
  return {
    title:
      kind === "identifier"
        ? "Identify this aircraft [Demo]"
        : "Threshold Geometry [Demo]",
    aircraft: kind === "identifier" ? "Boeing 767-200" : "Boeing 757",
    photographer: "Josh M",
    credit: "Josh M (@iamjoshmark)",
    description:
      "Client-supplied preview. Source facts and website permission must be independently verified before any publication.",
    correctAnswer: "Boeing 767-200",
    distractors: ["Boeing 777", "Airbus A330", "Airbus A350"],
    difficulty: "Trainee",
    factualSource: "",
    imageUrl:
      kind === "identifier" ? "/media/aircraft.jpg" : "/media/potd-6.jpg",
  };
}

export function sampleEditorialRecords(): EditorialRecord[] {
  return (["identifier", "potd"] as const).map((kind) => ({
    id: `sample-${kind}`,
    kind,
    sourceId: null,
    data: sampleEditorialData(kind),
    status: "draft",
    dateKey: null,
    version: 1,
    updatedAt: "",
  }));
}

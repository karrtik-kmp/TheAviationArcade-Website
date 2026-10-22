import { z } from "zod";
import type {
  EditorialData,
  ReviewChecks,
  SubmissionData,
  SubmissionStatus,
} from "./types";
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const categoryNames = {
  aircraft: "Aircraft",
  tail: "Airline & tail",
  airport: "Airport",
  atc: "ATC & airport operations",
  runway: "Runway",
  other: "Other aviation",
} as const;
export const channelNames = {
  games: "Game content",
  website: "Website & gallery",
  "plane-of-the-day": "Plane of the Day",
} as const;
const shortText = z.string().trim().max(160);
const webUrl = z
  .string()
  .trim()
  .max(600)
  .refine(
    (s) =>
      !s ||
      (/^https:\/\//i.test(s) &&
        (() => {
          try {
            return !!new URL(s).hostname;
          } catch {
            return false;
          }
        })()),
    "Use a full https:// link.",
  );
export const submissionSchema = z
  .object({
    title: shortText.min(3, "Add a title of at least 3 characters."),
    photographer: shortText.min(2, "Add the photographer's name."),
    email: z.string().trim().email("Add a valid contact email.").max(254),
    portfolio: webUrl,
    category: z.enum(["aircraft", "tail", "airport", "atc", "runway", "other"]),
    customCategory: shortText,
    targetGames: z
      .array(
        z.enum([
          "aircraft-identifier",
          "tail-identifier",
          "airport-spotter",
          "atc-match",
          "call-sign-match",
          "code-search",
          "runway-identifier",
        ]),
      )
      .max(7),
    aircraft: shortText,
    airline: shortText,
    registration: z.string().trim().max(40),
    location: shortText.min(2, "Add the photo location."),
    airportCode: z
      .string()
      .trim()
      .max(4)
      .refine(
        (s) => !s || /^[A-Za-z]{3,4}$/.test(s),
        "Use a 3-letter IATA or 4-letter ICAO code.",
      ),
    capturedOn: z
      .string()
      .refine(
        (s) =>
          !s || (validDate(s) && s <= new Date().toISOString().slice(0, 10)),
        "Use a valid capture date that is not in the future.",
      ),
    description: z
      .string()
      .trim()
      .min(15, "Tell us what the photo shows in at least 15 characters.")
      .max(2400),
    factualSource: webUrl,
    credit: shortText.min(2, "Add the credit you would like displayed."),
    rightsBasis: z.enum(["owner", "authorized"]),
    rightsEvidence: z.string().trim().max(2400),
    channels: z
      .array(z.enum(["games", "website", "plane-of-the-day"]))
      .min(1, "Select at least one proposed use."),
    imageOrigin: z.enum(["camera", "edited", "generated"]),
    consent: z.literal(true, {
      errorMap: () => ({
        message:
          "Confirm you have permission to submit for private editorial review.",
      }),
    }),
  })
  .superRefine((data, ctx) => {
    if (data.category === "other" && data.customCategory.length < 3)
      ctx.addIssue({
        code: "custom",
        path: ["customCategory"],
        message: "Name the proposed category.",
      });
    if (data.category === "aircraft" && data.aircraft.length < 2)
      ctx.addIssue({
        code: "custom",
        path: ["aircraft"],
        message:
          "Add the aircraft make/model, or state what needs identification.",
      });
  });
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}
export function localDay(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    throw new Error("Choose a valid IANA timezone.");
  }
}
export function reviewError(
  data: SubmissionData,
  current: SubmissionStatus,
  next: SubmissionStatus,
  checks: Partial<ReviewChecks>,
  note: string,
): string | null {
  if (!["pending", "changes_requested", "approved", "rejected"].includes(next))
    return "Unknown review action.";
  if (current === "rejected")
    return "A rejected submission cannot be approved. Ask the contributor to submit a new proposal.";
  if (next === "pending") return "Contributors resubmit their own proposals.";
  if (next === "changes_requested" || next === "rejected")
    return note.trim().length >= 10
      ? null
      : "Explain the requested change or rejection in at least 10 characters.";
  if (data.imageOrigin === "generated")
    return "Generated artwork cannot be approved as factual game photography.";
  if (data.rightsEvidence.trim().length < 10)
    return "Record permission or license evidence before approval.";
  if (!data.factualSource)
    return "Add an https factual source before approval.";
  if (
    !["identity", "quality", "credit", "rights", "category"].every(
      (key) => checks[key as keyof ReviewChecks] === true,
    )
  )
    return "Complete all five verification checks before approval.";
  return null;
}
export function editorialErrors(
  kind: "identifier" | "potd",
  data: EditorialData,
): string[] {
  const errors: string[] = [];
  if (data.title.trim().length < 3) errors.push("Add a descriptive title.");
  if (!data.credit.trim()) errors.push("Add a photographer credit.");
  if (!/^https:\/\//.test(data.factualSource))
    errors.push("Add an https factual source.");
  if (kind === "identifier") {
    const options = [data.correctAnswer, ...data.distractors].map((s) =>
      s.trim().toLowerCase(),
    );
    if (options.length !== 4 || options.some((s) => !s))
      errors.push("Provide one correct answer and three distractors.");
    if (new Set(options).size !== options.length)
      errors.push("All answer choices must be different.");
    if (
      ![
        "Trainee",
        "First Officer",
        "Captain",
        "Check Airman",
        "Chief Pilot",
      ].includes(data.difficulty)
    )
      errors.push("Choose a supported rank.");
  } else if (data.description.trim().length < 15)
    errors.push("Add the photo's factual context.");
  return errors;
}
export function imageInfo(bytes: Uint8Array): {
  mime: string;
  width: number;
  height: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n) &&
    bytes[12] === 73 &&
    bytes[13] === 72 &&
    bytes[14] === 68 &&
    bytes[15] === 82
  )
    return {
      mime: "image/png",
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    let position = 2;
    while (position + 3 < bytes.length) {
      if (bytes[position++] !== 255)
        throw new Error("The JPEG header is invalid.");
      while (bytes[position] === 255) position++;
      const marker = bytes[position++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (position + 2 > bytes.length) break;
      const length = view.getUint16(position);
      if (length < 2 || position + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 8
      )
        return {
          mime: "image/jpeg",
          height: view.getUint16(position + 3),
          width: view.getUint16(position + 5),
        };
      position += length;
    }
  }
  throw new Error("Upload a valid JPEG or PNG photograph.");
}

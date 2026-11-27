export type SubmissionStatus =
  "pending" | "changes_requested" | "approved" | "rejected";
export type Category =
  "aircraft" | "tail" | "airport" | "atc" | "runway" | "other";
export type Channel = "games" | "website" | "plane-of-the-day";
export type SubmissionData = {
  title: string;
  photographer: string;
  email: string;
  portfolio: string;
  category: Category;
  customCategory: string;
  targetGames: string[];
  aircraft: string;
  airline: string;
  registration: string;
  location: string;
  airportCode: string;
  capturedOn: string;
  description: string;
  factualSource: string;
  credit: string;
  rightsBasis: "owner" | "authorized";
  rightsEvidence: string;
  channels: Channel[];
  imageOrigin: "camera" | "edited" | "generated";
  consent: boolean;
};
export type ReviewChecks = {
  identity: boolean;
  quality: boolean;
  credit: boolean;
  rights: boolean;
  category: boolean;
};
export type Submission = {
  id: string;
  data: SubmissionData;
  status: SubmissionStatus;
  reviewNote: string;
  checks: Partial<ReviewChecks>;
  version: number;
  createdAt: string;
  updatedAt: string;
  width: number;
  height: number;
  imageBytes: number;
  photoUrl: string;
};
export type EditorialData = {
  title: string;
  aircraft: string;
  photographer: string;
  credit: string;
  description: string;
  correctAnswer: string;
  distractors: string[];
  difficulty: string;
  factualSource: string;
  imageUrl: string;
};
export type EditorialRecord = {
  id: string;
  kind: "identifier" | "potd";
  sourceId: string | null;
  data: EditorialData;
  status: "draft" | "scheduled" | "published" | "archived";
  dateKey: string | null;
  version: number;
  updatedAt: string;
};
/**
 * One Plane of the Day feature as `/api/featured` serves it (mapped from the backend's `PublicFeature`).
 * `credit` is the one public credit (`image.licence.credit`). Every nullable field is shown only when set:
 * no image when `imageUrl` is null, no licence, source or attribution line when they are missing.
 */
export type FeaturedPhoto = {
  id: string;
  date: string;
  title: string;
  aircraft: string;
  description: string;
  credit: string | null;
  licenceName: string | null;
  licenceUrl: string | null;
  sourceUrl: string | null;
  attribution: string | null;
  imageUrl: string | null;
  width: number;
  height: number;
};
/** `/api/featured`: the viewer's day, the newest feature and the rest of the recent features. */
export type FeaturedResponse = { day: string; featured: FeaturedPhoto | null; archive: FeaturedPhoto[] };

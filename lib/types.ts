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
export type FeaturedPhoto = {
  id: string;
  title: string;
  aircraft: string;
  photographer: string;
  credit: string;
  description: string;
  imageUrl: string;
  date: string;
};

/**
 * EditorialStore: the Military desk's persistence seam. Adapters (D1 now, the backend admin API
 * later) differ only in how they read and write; the rules below decide what a save, upload,
 * activation or restore may do, so every adapter refuses the same requests with the same words.
 *
 * A release is two steps. upload() records an immutable candidate built from the current
 * approved packages ("uploaded", visible but not live). activate() makes a candidate live, and
 * only if none of its package versions or linked photographs changed since it was uploaded.
 * Each step writes its own audit event, so a release made through release() leaves two.
 *
 * Relative imports only, so `node --test` can load this module.
 */
import {
  clientContent,
  militaryStages,
  parsePackageData,
  releaseBasis,
  releaseErrors,
  transitionError,
  type MilitaryAircraft,
  type MilitaryPackage,
  type MilitaryPackageData,
  type MilitaryRank,
  type MilitaryRelease,
  type MilitaryStage,
  type ReleaseAsset,
  type ReleasePointer,
} from "../military.ts";

export type Desk = "military";
export type Actor = { principal: string };

/** The client's sheet row. Read-only: staff input never changes it. */
export type Question = { answer: string; wrong: string[]; sourceFile: string; photographer: string };
export type Preparation = { stage: MilitaryStage; evidence: MilitaryPackageData };
export type EditorialItem = {
  desk: Desk;
  id: string;
  rank: MilitaryRank;
  question: Question;
  preparation: Preparation | null;
  /** 0 = never saved. */
  version: number;
  updatedAt: string | null;
};
export type ReleaseSummary = MilitaryRelease;
export type LiveState = ReleasePointer & { version: number; releases: ReleaseSummary[] };

export type DraftInput = { baseVersion: unknown; stage: unknown; evidence: unknown };
export type UploadInput = { basis: unknown; previewed: unknown };
export type ActivateInput = { release: unknown; liveVersion: unknown };
export type RestoreInput = { liveVersion: unknown };

export interface EditorialStore {
  list(desk: Desk): Promise<{ items: EditorialItem[]; live: LiveState }>;
  saveDraft(desk: Desk, id: string, input: DraftInput, actor: Actor): Promise<EditorialItem>;
  upload(desk: Desk, input: UploadInput, actor: Actor): Promise<ReleaseSummary>;
  activate(desk: Desk, input: ActivateInput, actor: Actor): Promise<LiveState>;
  restore(desk: Desk, input: RestoreInput, actor: Actor): Promise<LiveState>;
}

export class EditorialError extends Error {
  status: number;
  errors?: string[];
  // Plain fields, not parameter properties: node --test strips types and cannot run those.
  constructor(status: number, message: string, errors?: string[]) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
/** A stale baseVersion, liveVersion or basis, or a change during the write. Nothing was written. */
export class EditorialConflict extends EditorialError {
  constructor(message: string) {
    super(409, message);
  }
}
export class EditorialInvalid extends EditorialError {
  constructor(message: string, errors?: string[]) {
    super(422, message, errors);
  }
}
export class EditorialNotFound extends EditorialError {
  constructor(message: string) {
    super(404, message);
  }
}
export class EditorialUnavailable extends EditorialError {
  constructor(message = "The content database is unavailable. Please try again.") {
    super(503, message);
  }
}
/** For adapters that cannot perform a method yet (the backend adapter, until its releases ship). */
export class EditorialUnsupported extends EditorialError {
  constructor(message = "This action is not available yet.") {
    super(501, message);
  }
}

export const LIVE_CHANGED = "Another editor changed the release. Refresh to see it.";
export const RELEASE_CHANGED = "The packages or release changed. Refresh before releasing.";

/** A linked contribution as a store reads it: enough to check its rights and to guard a write. */
export type LinkedPhoto = ReleaseAsset & { id: string; version: number };

/** What a candidate keeps: the exact packages and photographs it was built from. */
export type ReleaseSnapshot = {
  number: number;
  basis: string;
  createdAt: string;
  packages: {
    aircraftId: string;
    rank: MilitaryRank;
    version: number;
    data: MilitaryPackageData;
    digest: string;
    submissionId: string;
    /** Missing on releases recorded before candidates existed; those are never activated again. */
    submissionVersion?: number;
  }[];
};

const idPattern = /^[a-zA-Z0-9-]{1,80}$/;
export const isSubmissionId = (id: string) => idPattern.test(id);

export function questionOf(aircraft: MilitaryAircraft): Question {
  return {
    answer: aircraft.name,
    wrong: [...aircraft.wrong],
    sourceFile: aircraft.file,
    photographer: aircraft.photographer,
  };
}

export function itemOf(
  aircraft: MilitaryAircraft,
  saved?: { stage: MilitaryStage; evidence: MilitaryPackageData; version: number; updatedAt: string },
): EditorialItem {
  return {
    desk: "military",
    id: aircraft.id,
    rank: aircraft.rank,
    question: questionOf(aircraft),
    preparation: saved ? { stage: saved.stage, evidence: saved.evidence } : null,
    version: saved?.version ?? 0,
    updatedAt: saved?.updatedAt ?? null,
  };
}

/** The desk's package view of an item, or null for a question never saved. */
export function packageOf(item: EditorialItem): MilitaryPackage | null {
  return item.preparation
    ? {
        aircraftId: item.id,
        stage: item.preparation.stage,
        data: item.preparation.evidence,
        version: item.version,
        updatedAt: item.updatedAt ?? "",
      }
    : null;
}
export const packagesOf = (items: EditorialItem[]) =>
  items.map(packageOf).filter((p): p is MilitaryPackage => p !== null);

export function checkDesk(desk: Desk) {
  if (desk !== "military") throw new EditorialNotFound("This desk does not exist.");
}

export type DraftPlan = {
  aircraft: MilitaryAircraft;
  from: MilitaryStage;
  to: MilitaryStage;
  evidence: MilitaryPackageData;
  payload: string;
  /** The contribution to look up, when the package links one. */
  submissionId: string | null;
};

/**
 * Checks a save against the sheet row and the stored item. Question content always comes
 * from the sheet. Throws before anything is written.
 */
export function planDraft(
  roster: MilitaryAircraft[],
  id: string,
  input: DraftInput,
  current: EditorialItem | undefined,
): DraftPlan {
  const aircraft = roster.find((a) => a.id === id);
  if (!aircraft) throw new EditorialNotFound("This question is not in the client's Military sheet.");
  const parsed = parsePackageData(input.evidence);
  if (!parsed) throw new EditorialInvalid("Check the package fields.");
  const evidence = clientContent(aircraft, parsed);
  if (!militaryStages.includes(input.stage as MilitaryStage))
    throw new EditorialInvalid("Unknown preparation stage.");
  if (input.baseVersion !== (current?.version ?? 0))
    throw new EditorialConflict("Another editor changed this package. Refresh to see their changes.");
  const from = current?.preparation?.stage ?? "missing_photo",
    to = input.stage as MilitaryStage,
    payload = JSON.stringify(evidence);
  if (
    from === "approved" &&
    to === "approved" &&
    JSON.stringify(current?.preparation?.evidence) !== payload
  )
    throw new EditorialInvalid("Step an approved package back to Previewed before changing it.");
  const error = transitionError(from, to, evidence);
  if (error) throw new EditorialInvalid(error);
  let submissionId: string | null = null;
  if (evidence.photoSource === "submission" && evidence.submissionId) {
    if (!isSubmissionId(evidence.submissionId)) throw new EditorialNotFound("Submission not found.");
    submissionId = evidence.submissionId;
  }
  return { aircraft, from, to, evidence, payload, submissionId };
}

/**
 * A contributed photograph must stay approved for game use; demo proposals carry no rights.
 * Returns the photograph the write must find unchanged, or null when nothing needs guarding.
 */
export function draftPhotoGuard(plan: DraftPlan, photo: LinkedPhoto | null): LinkedPhoto | null {
  if (plan.submissionId === null) return null;
  if (!photo) throw new EditorialNotFound("Submission not found.");
  if (militaryStages.indexOf(plan.to) < 1) return null;
  if (photo.status !== "approved" || !photo.games || photo.demo)
    throw new EditorialInvalid("The linked submission must be a real contribution approved for game use.");
  return photo;
}

export function draftAudit(plan: DraftPlan, baseVersion: number) {
  return {
    action: `military_${plan.to}`,
    detail: {
      aircraft: plan.aircraft.name,
      rank: plan.aircraft.rank,
      from: plan.from,
      version: baseVersion + 1,
    },
  };
}

/** The contributions an upload must read: every distinct valid submission id the packages link. */
export function linkedIds(packages: MilitaryPackage[]) {
  return [
    ...new Set(
      packages
        .filter((p) => p.data.photoSource === "submission" && isSubmissionId(p.data.submissionId))
        .map((p) => p.data.submissionId),
    ),
  ];
}

/**
 * Checks an upload and builds the candidate. Refuses a basis other than the current packages,
 * an unreviewed batch, the versions already live, and anything releaseErrors names.
 */
export function planUpload(
  roster: MilitaryAircraft[],
  items: EditorialItem[],
  live: LiveState,
  photos: Map<string, LinkedPhoto>,
  input: UploadInput,
  now: string,
): ReleaseSnapshot {
  const packages = packagesOf(items);
  if (input.basis !== releaseBasis(packages))
    throw new EditorialConflict(
      "Packages changed since this preview. Refresh and review the sample Trips again.",
    );
  if (input.previewed !== true)
    throw new EditorialInvalid("Review the sample Trips for every rank before releasing.");
  if (live.releases.find((r) => r.number === live.current)?.basis === input.basis)
    throw new EditorialInvalid("These package versions are already the current release.");
  const errors = releaseErrors(packages, photos, roster);
  if (errors.length) throw new EditorialInvalid("This batch cannot be released yet.", errors);
  return {
    number: Math.max(0, ...live.releases.map((r) => r.number)) + 1,
    basis: input.basis as string,
    createdAt: now,
    packages: roster.map((a) => {
      const p = packages.find((item) => item.aircraftId === a.id)!;
      const photo = photos.get(p.data.submissionId)!;
      return {
        aircraftId: a.id,
        rank: a.rank,
        version: p.version,
        data: p.data,
        digest: photo.digest,
        submissionId: photo.id,
        submissionVersion: photo.version,
      };
    }),
  };
}

export function summaryOf(snapshot: ReleaseSnapshot, status: ReleaseSummary["status"]): ReleaseSummary {
  return {
    number: snapshot.number,
    basis: snapshot.basis,
    aircraft: snapshot.packages.length,
    createdAt: snapshot.createdAt,
    status,
  };
}

/** Checks an activation. Returns the pointer to write; the adapter adds the unchanged-since-upload guards. */
export function planActivate(
  live: LiveState,
  candidate: ReleaseSummary | undefined,
  input: ActivateInput,
): ReleasePointer {
  if (input.liveVersion !== live.version) throw new EditorialConflict(LIVE_CHANGED);
  if (!candidate) throw new EditorialNotFound("This release does not exist.");
  if (candidate.status !== "uploaded")
    throw new EditorialInvalid("Only an uploaded release can be made live. Restore steps back to earlier ones.");
  if (live.releases.find((r) => r.number === live.current)?.basis === candidate.basis)
    throw new EditorialInvalid("These package versions are already the current release.");
  return {
    current: candidate.number,
    history: live.current === null ? live.history : [...live.history, live.current],
  };
}

/** Makes the release before the current one current again. */
export function planRestore(live: LiveState, input: RestoreInput, exists: boolean): ReleasePointer {
  if (input.liveVersion !== live.version) throw new EditorialConflict(LIVE_CHANGED);
  const history = [...live.history],
    previous = history.pop();
  if (!exists || previous === undefined)
    throw new EditorialInvalid("There is no earlier release to restore.");
  return { current: previous, history };
}

/** Upload then activate, for the desk's one-click release. A failed activation leaves the candidate visible. */
export async function release(
  store: EditorialStore,
  desk: Desk,
  input: UploadInput & { liveVersion: unknown },
  actor: Actor,
): Promise<LiveState> {
  const { live } = await store.list(desk);
  if (input.liveVersion !== live.version) throw new EditorialConflict(LIVE_CHANGED);
  const candidate = await store.upload(desk, input, actor);
  return store.activate(desk, { release: candidate.number, liveVersion: live.version }, actor);
}

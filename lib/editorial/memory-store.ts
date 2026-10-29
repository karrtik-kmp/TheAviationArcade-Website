/**
 * In-memory adapter for EditorialStore, for tests and for checking the D1 adapter against the
 * same contract. Each mutation reads, checks and writes without awaiting in between, so it is
 * as atomic as a D1 batch. Contributions are owned by the caller: pass the map and change it to
 * simulate a reviewer acting between an upload and its activation.
 */
import { militaryRoster, type MilitaryAircraft, type MilitaryPackageData, type MilitaryStage } from "../military.ts";
import {
  EditorialConflict,
  LIVE_CHANGED,
  RELEASE_CHANGED,
  checkDesk,
  draftAudit,
  draftPhotoGuard,
  itemOf,
  planActivate,
  planDraft,
  planRestore,
  planUpload,
  summaryOf,
  type EditorialItem,
  type EditorialStore,
  type LinkedPhoto,
  type LiveState,
  type ReleaseSnapshot,
} from "./store.ts";

export type MemoryAuditEvent = { actor: string; entity: string; action: string; detail: unknown };
type Saved = { stage: MilitaryStage; evidence: MilitaryPackageData; version: number; updatedAt: string };

export function memoryEditorialStore(
  options: { roster?: MilitaryAircraft[]; photos?: Map<string, LinkedPhoto> } = {},
): EditorialStore & { events: MemoryAuditEvent[] } {
  const roster = options.roster ?? militaryRoster;
  const photos = options.photos ?? new Map<string, LinkedPhoto>();
  const saved = new Map<string, Saved>();
  const releases = new Map<number, { snapshot: ReleaseSnapshot; status: "uploaded" | "released" }>();
  let pointer: { current: number | null; history: number[]; version: number } | null = null;
  const events: MemoryAuditEvent[] = [];

  const clone = <T>(value: T): T => structuredClone(value);
  const items = (): EditorialItem[] => roster.map((a) => itemOf(a, clone(saved.get(a.id))));
  const live = (): LiveState => ({
    current: pointer?.current ?? null,
    history: [...(pointer?.history ?? [])],
    version: pointer?.version ?? 0,
    releases: [...releases.values()]
      .sort((a, b) => b.snapshot.number - a.snapshot.number)
      .map((r) => summaryOf(r.snapshot, r.status)),
  });
  const audit = (actor: string, entity: string, action: string, detail: unknown) =>
    events.push({ actor, entity, action, detail });
  /** The candidate's packages and photographs are exactly as uploaded. */
  const unchanged = (snapshot: ReleaseSnapshot) =>
    snapshot.packages.every((p) => saved.get(p.aircraftId)?.version === p.version) &&
    snapshot.packages.every((p) => {
      const photo = photos.get(p.submissionId);
      return photo?.status === "approved" && photo.version === p.submissionVersion;
    });

  return {
    events,

    async list(desk) {
      checkDesk(desk);
      return { items: items(), live: live() };
    },

    async saveDraft(desk, id, input, actor) {
      checkDesk(desk);
      const aircraft = roster.find((a) => a.id === id);
      const current = aircraft && saved.has(id) ? itemOf(aircraft, clone(saved.get(id))) : undefined;
      const plan = planDraft(roster, id, input, current);
      const photo = plan.submissionId ? (photos.get(plan.submissionId) ?? null) : null;
      draftPhotoGuard(plan, photo && clone(photo));
      const baseVersion = current?.version ?? 0;
      if ((saved.get(id)?.version ?? 0) !== baseVersion)
        throw new EditorialConflict("This package or its photograph changed. Refresh before saving.");
      const next: Saved = {
        stage: plan.to,
        evidence: plan.evidence,
        version: baseVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      saved.set(id, next);
      const { action, detail } = draftAudit(plan, baseVersion);
      audit(actor.principal, `military-${id}`, action, detail);
      return itemOf(plan.aircraft, clone(next));
    },

    async upload(desk, input, actor) {
      checkDesk(desk);
      const linked = new Map([...photos].map(([k, v]) => [k, clone(v)]));
      const snapshot = planUpload(roster, items(), live(), linked, input, new Date().toISOString());
      if (releases.has(snapshot.number) || !unchanged(snapshot)) throw new EditorialConflict(RELEASE_CHANGED);
      releases.set(snapshot.number, { snapshot: clone(snapshot), status: "uploaded" });
      audit(actor.principal, `military-release-${snapshot.number}`, "military_release_uploaded", {
        release: snapshot.number,
        aircraft: snapshot.packages.length,
      });
      return summaryOf(snapshot, "uploaded");
    },

    async activate(desk, input, actor) {
      checkDesk(desk);
      const state = live();
      const number = Number(input.release);
      const stored = releases.get(number);
      const next = planActivate(state, stored && summaryOf(stored.snapshot, stored.status), input);
      if (!unchanged(stored!.snapshot)) throw new EditorialConflict(RELEASE_CHANGED);
      pointer = { ...next, version: state.version + 1 };
      stored!.status = "released";
      audit(actor.principal, "military-release-current", "military_released", {
        release: number,
        previous: state.current,
        aircraft: stored!.snapshot.packages.length,
      });
      return live();
    },

    async restore(desk, input, actor) {
      checkDesk(desk);
      const state = live();
      const next = planRestore(state, input, pointer !== null);
      if (pointer?.version !== state.version) throw new EditorialConflict(LIVE_CHANGED);
      pointer = { ...next, version: state.version + 1 };
      audit(actor.principal, "military-release-current", "military_release_restored", {
        release: next.current,
        replaced: state.current,
      });
      return live();
    },
  };
}

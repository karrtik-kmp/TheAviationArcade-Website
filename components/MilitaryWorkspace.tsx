"use client";

import {
  Button,
  Checkbox,
  Input,
  MessageBar,
  MessageBarBody,
  Textarea,
} from "@fluentui/react-components";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  CheckCircle,
  Package,
  Shuffle,
  Target,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
  checklistNames,
  clientContent,
  emptyPackageData,
  militaryRanks,
  militaryRoster,
  militaryStages,
  readiness,
  releaseBasis,
  releaseErrors,
  sampleTrips,
  stageErrors,
  stageNames,
  TRIP_SIZE,
  type MilitaryAircraft,
  type MilitaryPackage,
  type MilitaryPackageData,
  type MilitaryRelease,
  type MilitaryStage,
  type ReleaseAsset,
  type ReleasePointer,
} from "@/lib/military";
import { sitePath } from "@/lib/paths";
import type { Submission } from "@/lib/types";

const badge: Record<MilitaryStage, string> = {
  missing_photo: "",
  rights_checked: "status-changes-requested",
  content_prepared: "status-pending",
  previewed: "status-pending",
  approved: "status-approved",
};
export function StageBadge({ stage }: { stage: MilitaryStage }) {
  return <span className={`status-badge ${badge[stage]}`}>{stageNames[stage]}</span>;
}

/** The client's Military question sheet: preparation stages, per-rank coverage and Trip readiness. */
export function MilitaryWorkspace({
  packages,
  releases,
  pointer,
  submissions,
  busy,
  onOpen,
  onSave,
  onRelease,
}: {
  packages: MilitaryPackage[];
  releases: MilitaryRelease[];
  pointer: ReleasePointer & { version: number };
  submissions: Submission[];
  busy: boolean;
  onRelease: (action: "release" | "restore" | "activate", basis?: string, release?: number) => Promise<boolean>;
  /** Records the version a save will be based on (the draft session keeps it). */
  onOpen: (aircraftId: string, version: number) => void;
  onSave: (
    aircraft: MilitaryAircraft,
    stage: MilitaryStage,
    data: MilitaryPackageData,
  ) => Promise<MilitaryPackage | null>;
}) {
  const byId = useMemo(
    () => new Map(packages.map((p) => [p.aircraftId, p])),
    [packages],
  );
  const report = useMemo(() => readiness(packages), [packages]);
  const [filter, setFilter] = useState<"all" | MilitaryStage>("all");
  const [openId, setOpenId] = useState("");
  const [draft, setDraft] = useState<MilitaryPackageData | null>(null);
  // Only real contributions approved for game use can supply a photograph.
  const usable = submissions.filter(
    (s) =>
      s.status === "approved" &&
      s.data.channels.includes("games") &&
      !s.id.startsWith("demo-"),
  );
  const open = militaryRoster.find((a) => a.id === openId) ?? null;
  const saved = open ? byId.get(open.id) : undefined;
  const stage: MilitaryStage = saved?.stage ?? "missing_photo";
  function choose(aircraft: MilitaryAircraft) {
    const existing = byId.get(aircraft.id);
    setOpenId(aircraft.id);
    onOpen(aircraft.id, existing?.version ?? 0);
    setDraft(
      existing
        ? clientContent(aircraft, {
            ...existing.data,
            checklist: { ...existing.data.checklist },
          })
        : emptyPackageData(aircraft),
    );
  }
  async function save(next: MilitaryStage) {
    if (!open || !draft) return;
    await onSave(open, next, draft);
  }
  const set = <K extends keyof MilitaryPackageData>(key: K, value: MilitaryPackageData[K]) =>
    draft && setDraft({ ...draft, [key]: value });
  const at = militaryStages.indexOf(stage);
  const next = militaryStages[at + 1] as MilitaryStage | undefined;
  const missing = next && draft ? stageErrors(next, draft) : [];
  const locked = stage === "approved";

  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">LAUNCH PREPARATION</p>
          <h1>Military readiness</h1>
          <p>
            Prepare the {report.total} questions in the client&apos;s Military
            sheet (2026-10-26). Approval records an editorial decision; nothing
            is published and the game stays Coming Soon until every package and
            the playable integration pass their checks.
          </p>
        </div>
        <span className="admin-total">
          {report.approved} / {report.total} approved
        </span>
      </div>

      <section className="admin-panel military-report">
        <div className="admin-panel-header">
          <div>
            <h2>Rank coverage</h2>
            <p>
              As in the game, a Trip draws on its own rank and the ranks below it
              and needs {TRIP_SIZE} different approved questions.
            </p>
          </div>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-table military-table">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                {militaryStages.map((s) => (
                  <th scope="col" key={s}>
                    {stageNames[s]}
                  </th>
                ))}
                <th scope="col">Eligible approved</th>
                <th scope="col">Trip</th>
              </tr>
            </thead>
            <tbody>
              {report.ranks.map((r) => (
                <tr key={r.rank}>
                  <th scope="row">
                    {r.rank} <small>{r.slots} in sheet</small>
                  </th>
                  {militaryStages.map((s) => (
                    <td key={s}>{r.stages[s]}</td>
                  ))}
                  <td>
                    {r.eligibleApproved} / {r.eligibleTotal}
                  </td>
                  <td>
                    {r.tripReady ? (
                      <span className="status-badge status-approved">Ready</span>
                    ) : (
                      <span className="status-badge">
                        {TRIP_SIZE - r.eligibleApproved} short
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ReleasePanel
        packages={packages}
        releases={releases}
        pointer={pointer}
        submissions={submissions}
        busy={busy}
        onRelease={onRelease}
      />

      <div className="admin-toolbar content-toolbar">
        <select
          aria-label="Filter by stage"
          value={filter}
          onChange={(event) => setFilter(event.target.value as typeof filter)}
        >
          <option value="all">All stages</option>
          {militaryStages.map((s) => (
            <option key={s} value={s}>
              {stageNames[s]}
            </option>
          ))}
        </select>
        <span>Ranks, answers and wrong answers come from the client&apos;s sheet. Changes need a new sheet from Josh.</span>
      </div>

      <div className="admin-split content-split">
        <section
          className={`admin-panel admin-record-list military-roster ${open ? "mobile-hidden" : ""}`}
        >
          {militaryRanks.map(({ rank }) => {
            const rows = militaryRoster.filter(
              (a) =>
                a.rank === rank &&
                (filter === "all" ||
                  (byId.get(a.id)?.stage ?? "missing_photo") === filter),
            );
            if (!rows.length) return null;
            return (
              <div key={rank} role="group" aria-label={rank}>
                <div className="military-rank-head">{rank}</div>
                {rows.map((aircraft) => (
                  <button
                    key={aircraft.id}
                    className={`admin-record ${aircraft.id === openId ? "selected" : ""}`}
                    aria-current={aircraft.id === openId ? "true" : undefined}
                    onClick={() => choose(aircraft)}
                  >
                    <span>
                      <b>{aircraft.name}</b>
                      <small>
                        {byId.get(aircraft.id)
                          ? `Version ${byId.get(aircraft.id)!.version}`
                          : aircraft.file
                            ? "Not started"
                            : "Photo not supplied"}
                      </small>
                    </span>
                    <StageBadge
                      stage={byId.get(aircraft.id)?.stage ?? "missing_photo"}
                    />
                  </button>
                ))}
              </div>
            );
          })}
        </section>

        {open && draft ? (
          <section className="admin-panel content-editor">
            <div className="content-editor-head">
              <div>
                <button className="admin-back" onClick={() => setOpenId("")}>
                  <ArrowLeft size={16} /> Close package
                </button>
                <p className="eyebrow">{open.rank.toUpperCase()} · SHEET ROW {open.id.replace("mil-a", "")}</p>
                <h2>{open.name}</h2>
                <StageBadge stage={stage} />
              </div>
              <span className="editor-version">
                {saved ? `Version ${saved.version}` : "Not saved"}
              </span>
            </div>
            <ol className="military-stepper" aria-label="Preparation stages">
              {militaryStages.map((s, i) => (
                <li
                  key={s}
                  className={i < at ? "done" : i === at ? "current" : ""}
                  aria-current={i === at ? "step" : undefined}
                >
                  {i <= at && <CheckCircle size={14} weight="fill" />}
                  {stageNames[s]}
                </li>
              ))}
            </ol>
            {locked && (
              <MessageBar intent="success" layout="multiline">
                <MessageBarBody>
                  Approved. Step back to Previewed to change this package.
                  Approval does not publish or release it to the game.
                </MessageBarBody>
              </MessageBar>
            )}

            <fieldset className="form-grid admin-fieldset" disabled={locked || busy}>
              <h3 className="military-legend full">Photograph and rights</h3>
              <p className="field-hint full">
                {open.file
                  ? `Client photo: ${open.file}${open.photographer ? ` · ${open.photographer}` : " · no photographer named"}. Add it through Contribute to store it.`
                  : "The client has not supplied this photograph yet."}
              </p>
              <label className="admin-field">
                <span>Photograph source</span>
                <select
                  value={draft.photoSource}
                  onChange={(event) =>
                    set(
                      "photoSource",
                      event.target.value as MilitaryPackageData["photoSource"],
                    )
                  }
                >
                  <option value="">Not chosen</option>
                  <option value="submission">Approved contribution</option>
                  <option value="licensed">Separately licensed</option>
                </select>
              </label>
              {draft.photoSource === "submission" ? (
                <label className="admin-field">
                  <span>Approved contribution</span>
                  <select
                    value={draft.submissionId}
                    onChange={(event) => set("submissionId", event.target.value)}
                  >
                    <option value="">Choose a submission</option>
                    {usable.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.data.title} · {s.data.aircraft || "Unidentified"}
                      </option>
                    ))}
                    {draft.submissionId &&
                      !usable.some((s) => s.id === draft.submissionId) && (
                        <option value={draft.submissionId}>
                          No longer approved for game use
                        </option>
                      )}
                  </select>
                  {!usable.length && (
                    <small>No contributions are approved for game use yet.</small>
                  )}
                </label>
              ) : draft.photoSource === "licensed" ? (
                <Field
                  label="License or source (https://)"
                  value={draft.licenseUrl}
                  onChange={(v) => set("licenseUrl", v)}
                max={600}
                />
              ) : (
                <span />
              )}
              <Field
                label="Attribution"
                value={draft.attribution}
                onChange={(v) => set("attribution", v)}
              />
              <label className="admin-field full">
                <span>Permission or license terms</span>
                <Textarea
                  rows={2}
                  value={draft.permission}
                  onChange={(_, item) => set("permission", item.value)}
                />
              </label>

              <h3 className="military-legend full">Question content</h3>
              <Field
                label="Identity reference (https://)"
                value={draft.referenceUrl}
                onChange={(v) => set("referenceUrl", v)}
                max={600}
                full
              />
              <div className="admin-field full">
                <span>From the client&apos;s sheet</span>
                <dl className="military-client">
                  <dt>Answer</dt>
                  <dd>{open.name}</dd>
                  <dt>Wrong answers</dt>
                  <dd>{open.wrong.join(" · ")}</dd>
                </dl>
                <p className="field-hint">
                  If an answer looks wrong, note it below for Josh; it is not edited here.
                </p>
              </div>

              <h3 className="military-legend full">Preview checklist</h3>
              <div className="full military-checklist">
                {checklistNames.map(({ key, label }) => (
                  <Checkbox
                    key={key}
                    label={label}
                    checked={draft.checklist[key]}
                    onChange={(_, item) =>
                      set("checklist", {
                        ...draft.checklist,
                        [key]: item.checked === true,
                      })
                    }
                  />
                ))}
              </div>
              <label className="admin-field full">
                <span>Editorial notes</span>
                <Textarea
                  rows={2}
                  value={draft.notes}
                  onChange={(_, item) => set("notes", item.value)}
                />
              </label>
            </fieldset>

            {next && missing.length > 0 && (
              <div className="military-missing" role="status">
                <Target size={16} />
                <div>
                  <b>Before {stageNames[next]}</b>
                  <ul>
                    {missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="admin-actions editor-actions">
              {!locked && (
                <Button disabled={busy} onClick={() => void save(stage)}>
                  {busy ? "Saving…" : "Save"}
                </Button>
              )}
              {next && (
                <Button
                  appearance="primary"
                  disabled={busy || missing.length > 0}
                  onClick={() => void save(next)}
                >
                  {next === "approved" ? "Approve package" : `Mark ${stageNames[next]}`}
                </Button>
              )}
              {at > 0 && (
                <Button
                  appearance="subtle"
                  disabled={busy}
                  onClick={() => void save(militaryStages[at - 1])}
                >
                  Step back to {stageNames[militaryStages[at - 1]]}
                </Button>
              )}
            </div>
            <p className="admin-demo-note">
              Each save is versioned and recorded in Activity. Approved packages
              reach the game only through a batch release, and delivery to the
              game is not built yet.
            </p>
          </section>
        ) : (
          <section className="admin-panel detail-placeholder">
            <Target size={28} />
            <b>Select a question</b>
            <p>Open a row of the client&apos;s sheet to prepare its photograph and rights.</p>
          </section>
        )}
      </div>
    </>
  );
}

/**
 * Batch release: the server repeats every check, including the stored photographs,
 * and refuses a release built on package versions other than the previewed ones.
 */
function ReleasePanel({
  packages,
  releases,
  pointer,
  submissions,
  busy,
  onRelease,
}: {
  packages: MilitaryPackage[];
  releases: MilitaryRelease[];
  pointer: ReleasePointer & { version: number };
  submissions: Submission[];
  busy: boolean;
  onRelease: (action: "release" | "restore" | "activate", basis?: string, release?: number) => Promise<boolean>;
}) {
  const basis = releaseBasis(packages);
  // The browser cannot see file digests; the submission id stands in for this pre-check.
  const errors = useMemo(() => {
    const assets = new Map<string, ReleaseAsset>(
      submissions.map((s) => [
        s.id,
        {
          status: s.status,
          games: s.data.channels.includes("games"),
          demo: s.id.startsWith("demo-"),
          bytes: 1,
          digest: s.id,
        },
      ]),
    );
    return releaseErrors(packages, assets);
  }, [packages, submissions]);
  const [seed, setSeed] = useState(1);
  const [showTrips, setShowTrips] = useState(false);
  const [reviewed, setReviewed] = useState("");
  const trips = useMemo(
    () => sampleTrips(packages, `${basis}#${seed}`),
    [packages, basis, seed],
  );
  const current = releases.find((r) => r.number === pointer.current);
  const previous = pointer.history[pointer.history.length - 1];
  const confirmed = reviewed === basis && showTrips;
  const unchanged = current?.basis === basis;
  // An upload that never went live, for example because another editor released first.
  const candidate = releases.find((r) => r.status === "uploaded");
  const candidateReady = candidate?.basis === basis && !unchanged;

  return (
    <section className="admin-panel military-release" aria-labelledby="military-release-title">
      <div className="admin-panel-header">
        <div>
          <h2 id="military-release-title">Batch release</h2>
          <p>
            A release records the approved batch the game will receive once
            delivery is built. Nothing is published, and Military stays Coming Soon.
          </p>
        </div>
        <span className="status-badge">
          {current
            ? `Release ${current.number} current`
            : "No release yet"}
        </span>
      </div>
      {current && (
        <p className="military-release-current">
          Release {current.number} · {current.aircraft} questions ·{" "}
          {new Date(current.createdAt).toLocaleString()}
          {unchanged ? " · matches the packages below" : " · packages changed since"}
        </p>
      )}

      {candidate && (
        <p className="military-release-current">
          Release {candidate.number} uploaded, not live · {candidate.aircraft} questions ·{" "}
          {new Date(candidate.createdAt).toLocaleString()}
          {candidateReady ? " · matches the packages below" : " · packages changed since"}
        </p>
      )}

      {errors.length > 0 ? (
        <div className="military-missing" role="status">
          <Target size={16} />
          <div>
            <b>Before release</b>
            <ul>
              {errors.slice(0, 6).map((m) => (
                <li key={m}>{m}</li>
              ))}
              {errors.length > 6 && <li>and {errors.length - 6} more.</li>}
            </ul>
          </div>
        </div>
      ) : (
        <p className="military-release-ready">
          <CheckCircle size={16} weight="fill" /> All {militaryRoster.length} packages are
          approved with their own game-approved photographs.
        </p>
      )}

      <div className="admin-actions">
        <Button
          icon={<Package size={16} />}
          disabled={!trips.length}
          aria-expanded={showTrips}
          onClick={() => setShowTrips(!showTrips)}
        >
          {showTrips ? "Hide sample Trips" : "Preview sample Trips"}
        </Button>
        {showTrips && (
          <Button
            appearance="subtle"
            icon={<Shuffle size={16} />}
            onClick={() => {
              setSeed(seed + 1);
              setReviewed("");
            }}
          >
            Shuffle samples
          </Button>
        )}
        {candidate && candidateReady && (
          <Button
            appearance="subtle"
            icon={<CheckCircle size={16} />}
            disabled={busy}
            onClick={() => void onRelease("activate", undefined, candidate.number)}
          >
            Make release {candidate.number} live
          </Button>
        )}
        {previous !== undefined && (
          <Button
            appearance="subtle"
            icon={<ArrowCounterClockwise size={16} />}
            disabled={busy}
            onClick={() => void onRelease("restore")}
          >
            Restore release {previous}
          </Button>
        )}
      </div>
      {!trips.length && (
        <p className="field-hint">
          Sample Trips appear once a rank has {TRIP_SIZE} approved questions at or below it.
        </p>
      )}

      {showTrips && (
        <div className="military-trips">
          {militaryRanks.map(({ rank }) => {
            const trip = trips.find((t) => t.rank === rank);
            return (
              <details key={rank} className="military-trip">
                <summary>
                  {rank}{" "}
                  <small>
                    {trip
                      ? `${trip.questions.length} questions`
                      : `Needs ${TRIP_SIZE} approved questions`}
                  </small>
                </summary>
                {trip && (
                  <ol>
                    {trip.questions.map((q) => (
                      <li key={q.aircraftId}>
                        {q.submissionId ? (
                          <img
                            src={sitePath(`/api/submissions/${q.submissionId}/photo`)}
                            alt={`Photograph for ${q.name}`}
                            loading="lazy"
                          />
                        ) : (
                          <span className="military-trip-nophoto">No photo</span>
                        )}
                        <span>
                          <b>{q.name}</b>
                          <small>{q.options.join(" · ")}</small>
                          <small>{q.rank}</small>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </details>
            );
          })}
        </div>
      )}

      <div className="military-release-confirm">
        <Checkbox
          label="I reviewed the sample Trip for every rank"
          checked={confirmed}
          disabled={!showTrips || trips.length < militaryRanks.length}
          onChange={(_, item) => setReviewed(item.checked === true ? basis : "")}
        />
        <Button
          appearance="primary"
          disabled={busy || errors.length > 0 || !confirmed || unchanged}
          onClick={() =>
            void onRelease("release", basis).then((ok) => ok && setReviewed(""))
          }
        >
          {unchanged ? "Already released" : "Release batch"}
        </Button>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  full = false,
  max = 160,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  full?: boolean;
  /** Matches the server limit for this field. */
  max?: number;
}) {
  return (
    <label className={`admin-field ${full ? "full" : ""}`}>
      <span>{label}</span>
      <Input value={value} maxLength={max} onChange={(_, data) => onChange(data.value)} />
    </label>
  );
}

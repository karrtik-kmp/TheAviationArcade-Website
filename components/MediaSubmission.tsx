"use client";

import { SiteLink } from "@/components/SiteLink";
import {
  AGREEMENT,
  type ConfirmationId,
  type SubmissionField,
  type SubmissionValues,
} from "@/lib/media-form";
import type { MediaItem } from "@/lib/request/media";

/**
 * The client's photo submission form pieces (2026-11-24 form document, Backend API 0.29.0/0.30.0): the
 * submission fields, the rights summary with its links, the three confirmations, and the review notice a
 * photographer sees. Shared by the upload form and the "accept the new agreement" form on a v1 photo.
 */

export const blankSubmission: SubmissionValues = {
  fullName: "",
  title: "",
  credit: "",
  instagramHandle: "",
  instagramDisplayConsent: false,
};
export type Confirmations = Record<ConfirmationId, boolean>;
export const noConfirmations: Confirmations = { age: false, rights: false, agreement: false };
export const allConfirmed = (c: Confirmations) => AGREEMENT.confirmations.every((item) => c[item.id]);

/** What the photographer typed before, so a new version or the agreement move does not ask again. */
export function submissionFrom(item: MediaItem | null): SubmissionValues {
  if (!item) return blankSubmission;
  return {
    fullName: item.submission?.fullName ?? "",
    title: item.draft.title ?? "",
    credit: item.draft.licence.credit ?? "",
    instagramHandle: item.submission?.instagramHandle ?? "",
    instagramDisplayConsent: item.submission?.instagramDisplayConsent ?? false,
  };
}

function FieldError({ id, text }: { id: string; text?: string }) {
  return text ? (
    <span className="field-error" id={id}>
      {text}
    </span>
  ) : null;
}

const describedBy = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(" ") || undefined;

/**
 * Full name (private), email (private, the account's), photographer credit (public), Instagram handle
 * (optional) with its display consent, and photo title, in the client's order.
 */
export function SubmissionFields({
  idPrefix,
  values,
  errors,
  disabled,
  onChange,
}: {
  idPrefix: string;
  values: SubmissionValues;
  errors: Partial<Record<SubmissionField, string>>;
  disabled: boolean;
  onChange: (next: Partial<SubmissionValues>, field: SubmissionField) => void;
}) {
  const id = (field: string) => `${idPrefix}-${field}`;
  const text = (field: "fullName" | "credit" | "title", label: string, hint: string, autoComplete?: string) => (
    <div className={field === "title" ? "field full" : "field"}>
      <label htmlFor={id(field)}>{label}</label>
      <input
        id={id(field)}
        type="text"
        maxLength={400}
        autoComplete={autoComplete ?? "off"}
        value={values[field]}
        disabled={disabled}
        aria-required="true"
        aria-invalid={!!errors[field]}
        aria-describedby={describedBy(`${id(field)}-hint`, errors[field] && `${id(field)}-error`)}
        onChange={(event) => onChange({ [field]: event.target.value }, field)}
      />
      <small className="hint" id={`${id(field)}-hint`}>
        {hint}
      </small>
      <FieldError id={`${id(field)}-error`} text={errors[field]} />
    </div>
  );
  return (
    <div className="form-grid media-submission">
      {text("fullName", "Full name (private)", "Only the Airplane Games team sees this.", "name")}
      <div className="field">
        <span className="field-label">Email address (private)</span>
        <p className="hint media-account-email">
          We use the email address of the account you are signed in with. It is never shown publicly.
        </p>
      </div>
      {text("credit", "Photographer credit (public)", "How the photo is credited, such as your name.")}
      <div className="field">
        <label htmlFor={id("instagramHandle")}>Instagram handle (optional)</label>
        <input
          id={id("instagramHandle")}
          type="text"
          maxLength={64}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={values.instagramHandle}
          disabled={disabled}
          aria-invalid={!!errors.instagramHandle}
          aria-describedby={describedBy(`${id("instagramHandle")}-hint`, errors.instagramHandle && `${id("instagramHandle")}-error`)}
          onChange={(event) => onChange({ instagramHandle: event.target.value }, "instagramHandle")}
        />
        <small className="hint" id={`${id("instagramHandle")}-hint`}>
          Shown publicly only if you tick the box below.
        </small>
        <FieldError id={`${id("instagramHandle")}-error`} text={errors.instagramHandle} />
      </div>
      <div className="field full">
        <label className="check-label">
          <input
            id={id("instagramDisplayConsent")}
            type="checkbox"
            checked={values.instagramDisplayConsent}
            disabled={disabled}
            aria-invalid={!!errors.instagramDisplayConsent}
            aria-describedby={describedBy(errors.instagramDisplayConsent && `${id("instagramDisplayConsent")}-error`)}
            onChange={(event) => onChange({ instagramDisplayConsent: event.target.checked }, "instagramDisplayConsent")}
          />
          <span>{AGREEMENT.instagramConsent}</span>
        </label>
        <FieldError id={`${id("instagramDisplayConsent")}-error`} text={errors.instagramDisplayConsent} />
      </div>
      {text("title", "Photo title", "A short name for the photo.")}
    </div>
  );
}

/** "Your photography rights", the three confirmations, and the links to the agreement and the privacy policy. */
export function AgreementChecks({
  idPrefix,
  checked,
  error,
  disabled,
  onChange,
}: {
  idPrefix: string;
  checked: Confirmations;
  error?: string;
  disabled: boolean;
  onChange: (next: Confirmations) => void;
}) {
  const errorId = `${idPrefix}-confirm-error`;
  return (
    <>
      <section className="media-rights-summary" aria-labelledby={`${idPrefix}-summary-title`}>
        <h3 id={`${idPrefix}-summary-title`}>{AGREEMENT.summaryTitle}</h3>
        <ul>
          {AGREEMENT.summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <fieldset className="media-fieldset" aria-describedby={error ? errorId : undefined}>
        <legend className="visually-hidden">Confirmations</legend>
        {AGREEMENT.confirmations.map((item, index) => (
          <label className="check-label" key={item.id}>
            <input
              id={index === 0 ? `${idPrefix}-confirm` : undefined}
              type="checkbox"
              checked={checked[item.id]}
              disabled={disabled}
              aria-required="true"
              aria-invalid={!!error && !checked[item.id]}
              onChange={(event) => onChange({ ...checked, [item.id]: event.target.checked })}
            />
            <span>{item.label}</span>
          </label>
        ))}
        <FieldError id={errorId} text={error} />
      </fieldset>
      <p className="media-meta media-agreement-links">
        <SiteLink href="/photo-submission-policy" target="_blank" rel="noopener">
          Photo Submission Agreement
        </SiteLink>{" "}
        ·{" "}
        <SiteLink href="/privacy" target="_blank" rel="noopener">
          Privacy Policy
        </SiteLink>
      </p>
    </>
  );
}

export const reviewLabel = { changes_requested: "Changes requested", declined: "Declined" } as const;

/** The team's decision, with its reason word for word (plain text, line breaks kept). No reviewer is named. */
export function ReviewNotice({ review }: { review: NonNullable<MediaItem["review"]> }) {
  return (
    <div className={`media-review media-review-${review.decision}`} role="note">
      <h3>{reviewLabel[review.decision]}</h3>
      <p className="media-review-reason">{review.reason}</p>
      <p className="media-meta">
        {review.decision === "declined"
          ? "This photo can't be changed or sent again. You can still remove your name and Instagram details below."
          : "Fix it below with a new file or a change to its details. Your change goes back to the team."}
      </p>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { SiteLink as Link } from "@/components/SiteLink";
import { Airplane, ArrowUpRight } from "@phosphor-icons/react";
import type { FeaturedPhoto, FeaturedResponse } from "@/lib/types";
import { sitePath } from "@/lib/paths";

/**
 * Plane of the Day from `/api/featured` (the backend's public read, cached on this server). Four states: loading,
 * a feature, nothing published yet, unavailable. No sample photograph stands in for a feature (user, 2026-11-27).
 * The only credit is the image licence credit; missing licence, source or attribution lines are left out.
 */
type State =
  | { kind: "loading" }
  | { kind: "ready"; data: FeaturedResponse }
  | { kind: "unavailable" };

/** An empty frame in the image's place, so the layout holds when there is no image link. */
function Frame() {
  return (
    <div className="photo-frame" aria-hidden="true">
      <Airplane size={40} weight="thin" />
    </div>
  );
}

function Photo({ photo, hero }: { photo: FeaturedPhoto; hero?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (!photo.imageUrl || broken) return <Frame />;
  return (
    <img
      src={sitePath(photo.imageUrl)}
      alt={photo.aircraft || photo.title}
      width={photo.width}
      height={photo.height}
      loading={hero ? undefined : "lazy"}
      // A page left open past the signed link's expiry: show the frame, never a broken image.
      onError={() => setBroken(true)}
    />
  );
}

/** The licence, source and attribution lines, each only when the backend has it. */
function Licence({ photo }: { photo: FeaturedPhoto }) {
  if (!photo.licenceName && !photo.sourceUrl && !photo.attribution) return null;
  return (
    <div className="photo-licence">
      {photo.licenceName &&
        (photo.licenceUrl ? (
          <a href={photo.licenceUrl} rel="noopener noreferrer">
            {photo.licenceName}
          </a>
        ) : (
          <span>{photo.licenceName}</span>
        ))}
      {photo.sourceUrl && (
        <a href={photo.sourceUrl} rel="noopener noreferrer">
          Source
        </a>
      )}
      {photo.attribution && <span>{photo.attribution}</span>}
    </div>
  );
}

export function Featured({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    const abort = new AbortController();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch(sitePath(`/api/featured?timeZone=${encodeURIComponent(zone)}`), {
      signal: abort.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json() as Promise<FeaturedResponse>;
      })
      .then((data) => setState({ kind: "ready", data }))
      .catch((e) => {
        if (e.name !== "AbortError") setState({ kind: "unavailable" });
      });
    return () => abort.abort();
  }, []);

  const data = state.kind === "ready" ? state.data : null;
  const photo = data?.featured ?? null;
  const today = Boolean(photo && data && photo.date === data.day);
  const archive = data?.archive ?? [];
  const note =
    state.kind === "unavailable"
      ? "Plane of the Day is unavailable right now. Please check back soon."
      : state.kind === "ready" && !photo
        ? "No Plane of the Day has been published yet. The first one will appear here."
        : "";

  return (
    <>
      <div className="feature-grid" aria-busy={state.kind === "loading"}>
        <figure>
          {photo ? <Photo key={photo.id} photo={photo} hero /> : <Frame />}
          {photo && (
            <figcaption className="photo-credit">
              {photo.credit && <span>{photo.credit}</span>}
              <span>{photo.date}</span>
            </figcaption>
          )}
        </figure>
        <div className="feature-copy">
          <div className="photo-preview-label">Plane of the Day</div>
          {photo ? (
            <>
              <h2>{today ? "Today's Featured Aircraft" : "Recently Featured Aircraft"}</h2>
              {photo.aircraft && <div className="photo-aircraft">{photo.aircraft}</div>}
              <div className="photo-title">{photo.title}</div>
              <p>{photo.description}</p>
              <Licence photo={photo} />
            </>
          ) : (
            <h2>A reason to look up.</h2>
          )}
          {/* Mounted from the start so screen readers announce the note when it is filled in. */}
          <p role="status" className="feature-note">
            {note}
          </p>
          {compact ? (
            <Link className="text-link" href="/plane-of-the-day">
              Explore the collection <ArrowUpRight size={18} />
            </Link>
          ) : (
            <div className="actions">
              <Link className="btn" href="/games">
                Explore the Arcade <ArrowUpRight size={18} />
              </Link>
              <Link className="btn secondary" href="/contribute">
                Submit Your Photo
              </Link>
            </div>
          )}
        </div>
      </div>
      {!compact && (
        <>
          <section style={{ marginTop: 64 }}>
            <h2>Missed a Flight? We&apos;ve Got You Covered.</h2>
            <p className="archive-intro">
              Explore previously featured aircraft and rediscover amazing
              aviation moments from our growing photo collection.
            </p>
            {archive.length ? (
              <div className="archive-grid">
                {archive.map((p) => (
                  <article key={p.id}>
                    <Photo photo={p} />
                    <h3>{p.title}</h3>
                    {p.credit && <p>{p.credit}</p>}
                    <p>{p.date}</p>
                    <Licence photo={p} />
                  </article>
                ))}
              </div>
            ) : state.kind === "ready" ? (
              <div className="info-note">
                The archive will grow as reviewed photographs are published.
                Future scheduled entries stay private until their feature date.
              </div>
            ) : null}
          </section>
          <section className="closing-cta" style={{ marginTop: 64 }}>
            <h2>Your Photo Could Be Next!</h2>
            <p>
              Have an incredible aircraft photograph you&apos;d love to share?
              Submit it for consideration and help us celebrate the world of
              aviation.
            </p>
            <Link className="btn" href="/contribute">
              Share Your Aviation Photography <ArrowUpRight size={18} />
            </Link>
          </section>
        </>
      )}
    </>
  );
}

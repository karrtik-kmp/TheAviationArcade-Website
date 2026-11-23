"use client";
import { useEffect, useState } from "react";
import { SiteLink as Link } from "@/components/SiteLink";
import { ArrowUpRight } from "@phosphor-icons/react";
import type { FeaturedPhoto } from "@/lib/types";
import { sitePath } from "@/lib/paths";
const sample: FeaturedPhoto = {
  id: "preview",
  title: "Threshold Geometry",
  aircraft: "Boeing 757",
  photographer: "Josh M",
  credit: "Josh M (@iamjoshmark)",
  description:
    "A familiar aircraft, seen from a different perspective. Explore the photographs and people behind the collection.",
  imageUrl: "/media/potd-6.webp",
  date: "",
};
export function Featured({ compact = false }: { compact?: boolean }) {
  const [photo, setPhoto] = useState(sample),
    [archive, setArchive] = useState<FeaturedPhoto[]>([]),
    [error, setError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch(sitePath(`/api/featured?timeZone=${encodeURIComponent(zone)}`), {
      signal: abort.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json() as Promise<{
          featured: FeaturedPhoto | null;
          archive: FeaturedPhoto[];
        }>;
      })
      .then((d) => {
        if (d.featured) setPhoto(d.featured);
        setArchive(d.archive);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => abort.abort();
  }, []);
  return (
    <>
      <div className="feature-grid">
        <figure>
          <img
            src={sitePath(photo.imageUrl)}
            alt={`${photo.aircraft || "Aircraft"}, photographed by ${photo.photographer}`}
            width="1280"
            height="960"
            loading="lazy"
          />
          <figcaption className="photo-credit">
            <span>{photo.credit}</span>
            <span>{photo.date || "Client collection preview"}</span>
          </figcaption>
        </figure>
        <div className="feature-copy">
          <div className="photo-preview-label">
            {photo.date ? "Plane of the Day" : "From the photo collection"}
          </div>
          {/* "Today's" only for a real scheduled feature, never for the preview photograph. */}
          <h2>{photo.date ? "Today's Featured Aircraft" : "A reason to look up."}</h2>
          {photo.date && photo.aircraft && (
            <div className="photo-aircraft">{photo.aircraft}</div>
          )}
          <div className="photo-title">{photo.title}</div>
          {photo.date && <div className="photo-aircraft">{photo.credit}</div>}
          <p>{photo.description}</p>
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
          {error && (
            <p role="status" style={{ fontSize: 11 }}>
              The live collection is unavailable. Showing the client preview
              photograph.
            </p>
          )}
        </div>
      </div>
      {!compact && (
        <section style={{ marginTop: 64 }}>
          <h2>Missed a Flight? We&apos;ve Got You Covered.</h2>
          <p className="archive-intro">
            Explore previously featured aircraft and rediscover amazing aviation
            moments from our growing photo collection.
          </p>
          {archive.length ? (
            <div className="archive-grid">
              {archive.map((p) => (
                <article key={p.id}>
                  <img
                    src={sitePath(p.imageUrl)}
                    alt={p.aircraft || p.title}
                    width="640"
                    height="480"
                    loading="lazy"
                  />
                  <h3>{p.title}</h3>
                  <p>{p.credit}</p>
                  <p>{p.date}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="info-note">
              The archive will grow as reviewed photographs are published.
              Future scheduled entries stay private until their feature date.
            </div>
          )}
        </section>
      )}
      {!compact && (
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
      )}
    </>
  );
}

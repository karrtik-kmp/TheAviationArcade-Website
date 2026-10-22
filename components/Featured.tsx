"use client";
import { useEffect, useState } from "react";
import { SiteLink as Link } from "@/components/SiteLink";
import { ArrowUpRight } from "@phosphor-icons/react";
import type { FeaturedPhoto } from "@/lib/types";
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
    fetch(`/api/featured?timeZone=${encodeURIComponent(zone)}`, {
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
            src={photo.imageUrl}
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
          <h2>A reason to look up.</h2>
          <div className="photo-title">{photo.title}</div>
          <p>{photo.description}</p>
          {compact ? (
            <Link className="text-link" href="/plane-of-the-day">
              Explore the collection <ArrowUpRight size={18} />
            </Link>
          ) : (
            <Link className="btn" href="/contribute">
              Share a photo <ArrowUpRight size={18} />
            </Link>
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
          <h2>From the archive</h2>
          {archive.length ? (
            <div className="archive-grid">
              {archive.map((p) => (
                <article key={p.id}>
                  <img
                    src={p.imageUrl}
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
    </>
  );
}

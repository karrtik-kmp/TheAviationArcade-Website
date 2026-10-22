"use client";
import { useState } from "react";
import { SiteLink as Link } from "@/components/SiteLink";
import {
  ArrowUpRight,
  MagnifyingGlass,
  AirplaneTilt,
  Broadcast,
  MapPin,
  GridFour,
  ArrowsLeftRight,
  Path,
} from "@phosphor-icons/react";
import { games, type Game } from "@/lib/catalog";
export function GameVisual({ game }: { game: Game }) {
  const tone =
    game.slug === "tail-identifier" || game.slug === "code-search"
      ? "burgundy"
      : game.slug === "airport-spotter" || game.slug === "call-sign-match"
        ? "teal"
        : "navy";
  const Icon =
    game.slug === "airport-spotter"
      ? MapPin
      : game.slug === "call-sign-match"
        ? Broadcast
        : game.slug === "code-search"
          ? GridFour
          : game.slug === "runway-identifier"
            ? Path
            : AirplaneTilt;
  return (
    <div className={`game-visual ${tone}`}>
      {game.image ? (
        <img
          src={game.image}
          alt={game.imageAlt}
          width="960"
          height="640"
          loading="lazy"
        />
      ) : game.slug === "atc-match" ? (
        <div
          className="visual-matching"
          aria-label="Airport codes meet airport names"
        >
          <span className="visual-word">LHR</span>
          <ArrowsLeftRight size={36} />
          <span className="visual-word">LONDON</span>
        </div>
      ) : (
        <Icon weight="duotone" aria-hidden="true" />
      )}
    </div>
  );
}
export function GameCard({ game }: { game: Game }) {
  return (
    <article className="game-card">
      <Link href={`/games/${game.slug}`}>
        <GameVisual game={game} />
        <div className="game-card-copy">
          <div>
            <h3>{game.name}</h3>
            <p>{game.subtitle}</p>
            <span className="status-label">{game.status}</span>
          </div>
          <ArrowUpRight size={22} />
        </div>
      </Link>
    </article>
  );
}
export function Catalog() {
  const [category, setCategory] = useState("All games"),
    [query, setQuery] = useState("");
  const visible = games.filter(
    (g) =>
      (category === "All games" || g.category === category) &&
      `${g.name} ${g.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="wrap catalog" style={{ paddingBottom: 80 }}>
      <div className="catalog-controls">
        <div className="filter-group" aria-label="Filter games">
          {["All games", "Recognition", "Matching", "Word games"].map((c) => (
            <button
              key={c}
              className="filter-btn"
              aria-pressed={c === category}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="search-box">
          <MagnifyingGlass size={17} />
          <input
            aria-label="Search games"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find your next challenge"
          />
        </label>
      </div>
      <p className="sr-only" role="status">
        {visible.length} games shown
      </p>
      {visible.length ? (
        <div className="game-grid">
          {visible.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No matching games</h2>
          <p>Try another name or choose a different category.</p>
          <button
            className="btn secondary"
            onClick={() => {
              setCategory("All games");
              setQuery("");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}

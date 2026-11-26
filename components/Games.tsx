"use client";
import { useState } from "react";
import { SiteLink as Link } from "@/components/SiteLink";
import { ArrowUpRight, MagnifyingGlass } from "@phosphor-icons/react";
import { games, type Game } from "@/lib/catalog";
import { sitePath } from "@/lib/paths";
import { roundelFor } from "@/lib/game-art";
/** The tile colour follows the game's module ticket (navy, teal, burgundy). */
function toneFor(game: Game) {
  return game.slug === "tail-identifier" || game.slug === "code-search"
    ? "burgundy"
    : game.slug === "airport-spotter" || game.slug === "call-sign-match"
      ? "teal"
      : "navy";
}
export function GameVisual({ game }: { game: Game }) {
  return (
    <div className={`game-visual ${toneFor(game)}${game.image ? " has-photo" : ""}`}>
      {game.image ? (
        <img
          src={sitePath(game.image)}
          alt={game.imageAlt}
          width="960"
          height="640"
          loading="lazy"
        />
      ) : (
        <span className="game-radar" aria-hidden="true" />
      )}
      <img
        className="game-roundel"
        src={roundelFor(game)}
        alt=""
        width="128"
        height="128"
        loading="lazy"
      />
    </div>
  );
}
/** A card for one game. `teaser` swaps in page-specific copy (the homepage has its own). */
export function GameCard({
  game,
  teaser,
}: {
  game: Game;
  teaser?: { title: string; text: string };
}) {
  return (
    <article className="game-card">
      <Link href={`/games/${game.slug}`}>
        <GameVisual game={game} />
        <div className="game-card-copy">
          <div>
            <h3>{game.name}</h3>
            <p className="game-card-tagline">{teaser?.title ?? game.subtitle}</p>
            <p>{teaser?.text ?? game.description}</p>
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
            placeholder="Search games"
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

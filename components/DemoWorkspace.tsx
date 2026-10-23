"use client";

import { useEffect, useState } from "react";
import { useAccountSession } from "@/components/AccountSession";
import { SiteLink } from "@/components/SiteLink";
import { accountSignInPath } from "@/lib/account";
import { demoStorageKey, initialDemoState, liveries, parseDemoState, reviewStates, scenarios, type DemoState } from "@/lib/demo-model";
import snapshot from "@/data/demo-game-content.json";
import "./demo.css";

const sections = ["General settings", "Games & content", "Plane of the Day", "Submissions", "Website & services"] as const;
type Section = typeof sections[number];
const presets = [
  { title: "Commercial aircraft proposal", record: snapshot.identifier[0].id },
  { title: "Daily feature proposal", record: snapshot.potd[0].id },
  { title: "Tail crop awaiting review", record: snapshot.tail.records[0].id },
];
const liveryColors: Record<string, string> = { Chartroom: "#806127", Atlantic: "#215b87", Pacific: "#236d67", Continental: "#793c48" };

export function DemoWorkspace({ sessionKey }: { sessionKey: string }) {
  const account = useAccountSession();
  const [section, setSection] = useState<Section>("General settings");
  const [draft, setDraft] = useState<DemoState>(() => initialDemoState(snapshot.potd[0]));
  const [saved, setSaved] = useState<DemoState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [rank, setRank] = useState("All ranks");
  const matches = account.state === "ready" && !!account.account?.user && account.account.sessionKey === sessionKey;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => {
    // Read browser storage after hydration; cancel it when the account changes or unmounts.
    const frame = requestAnimationFrame(() => {
    const defaults = initialDemoState(snapshot.potd[0]);
    try {
      const stored = localStorage.getItem(demoStorageKey(sessionKey));
      const parsed = stored && stored.length < 20000 ? parseDemoState(JSON.parse(stored)) : null;
      if (stored && (!parsed || !snapshot.potd.some((entry) => entry.id === parsed.potdId)))
        setMessage("Saved demo data was out of date. Game defaults have been restored.");
      const next = parsed && snapshot.potd.some((entry) => entry.id === parsed.potdId) ? parsed : defaults;
      setDraft(next); setSaved(next);
    } catch { setError("Browser storage is unavailable or unreadable. You can explore this session; changes may not persist."); setSaved(defaults); }
    setLoaded(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [sessionKey]);

  useEffect(() => {
    if (!loaded || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, loaded]);

  function change<K extends keyof DemoState>(key: K, value: DemoState[K]) {
    setDraft((current) => ({ ...current, [key]: value })); setMessage("");
  }
  function save() {
    if (!matches) return;
    const parsed = parseDemoState(draft);
    if (!parsed) { setError("Add a website title, daily-feature title and description before saving."); return; }
    try {
      localStorage.setItem(demoStorageKey(sessionKey), JSON.stringify(parsed));
      setDraft(parsed); setSaved(parsed); setError(""); setMessage("Demo changes saved in this browser.");
    } catch { setError("Could not save in this browser. Your draft is still available; check browser storage and retry."); }
  }
  function reset() {
    if (!matches) return;
    const next = initialDemoState(snapshot.potd[0]);
    try {
      localStorage.removeItem(demoStorageKey(sessionKey)); setError("");
      setDraft(next); setSaved(next); setMessage("Demo reset to the imported game defaults.");
    } catch { setError("Could not reset browser storage. Your current draft is still available."); }
  }
  if (account.state === "error" || (account.state === "ready" && !matches)) return (
    <main id="main" className="demo-workspace"><section className="demo-panel" role="alert">
      <h1>Demo session needs attention</h1><p>Sign in with the same account or reload to open the current account’s workspace.</p>
      <a className="btn" href={accountSignInPath("/demo")}>Sign in</a>
      <button className="btn secondary" type="button" onClick={() => location.reload()}>Reload workspace</button>
    </section></main>
  );
  const questions = snapshot.identifier.filter((row) => (rank === "All ranks" || row.level === rank) &&
    `${row.id} ${row.answer} ${row.family}`.toLowerCase().includes(query.toLowerCase()));
  const feature = snapshot.potd.find((entry) => entry.id === draft.potdId) ?? snapshot.potd[0];
  return (
    <main id="main" className="demo-workspace">
      <header className="demo-heading">
        <div><span className="eyebrow">The Aviation Arcade · Preview</span><h1>Demo workspace</h1>
          <p>Real game defaults. Prefilled examples. Room to explore.</p></div>
        <span className="demo-badge">Browser-only demo</span>
      </header>
      <p className="demo-banner">Edits stay in this browser. Live website content, player balances and publishing rights are unchanged.</p>
      <div className="demo-layout">
        <nav className="demo-nav" aria-label="Demo sections">{sections.map((item, index) =>
          <button key={item} type="button" aria-label={item} aria-current={item === section ? "page" : undefined} onClick={() => setSection(item)}>
            <small>0{index + 1}</small>{item}
          </button>)}<SiteLink href="/account">Back to my account</SiteLink>
        </nav>
        <div className="demo-content">
          {(!loaded || !matches) && <p role="status">Checking your demo session…</p>}
          <fieldset className="demo-fields" disabled={!loaded || !matches}>
            <legend className="sr-only">{section}</legend>
            {section === "General settings" && <>
              <section className="demo-panel"><span className="eyebrow">01 / Preferences</span><h2>General settings</h2>
                <p>Prefilled from the mobile game. These controls preview a saved preference; sound and phone vibration are not played here.</p>
                <div className="demo-form-grid">
                  <label className="demo-field">Hangar livery<select value={draft.livery} onChange={(e) => change("livery", e.target.value as DemoState["livery"])}>{liveries.map((name) => <option key={name}>{name}</option>)}</select></label>
                  <label className="demo-field">Service scenario<select value={draft.scenario} onChange={(e) => change("scenario", e.target.value as DemoState["scenario"])}>{scenarios.map((name) => <option key={name}>{name}</option>)}</select></label>
                </div>
                <div className="demo-toggles">{([
                  ["sound", "Sound effects", "On by default in the game."],
                  ["navigationVibration", "Navigation vibration", "Feedback for interface actions."],
                  ["gameplayVibration", "Gameplay vibration", "Independent feedback for Flights."],
                  ["reducedMotion", "Reduced motion", "Parks looping game animations."],
                  ["untimedMode", "Untimed practice preview", "Default off; the game has no Settings row for this yet."],
                ] as const).map(([key, label, note]) => <label className="demo-toggle" key={key}>
                  <span><strong>{label}</strong><small>{note}</small></span>
                  <input type="checkbox" checked={draft[key]} onChange={(e) => change(key, e.target.checked)} />
                </label>)}</div>
              </section>
              <section className="demo-panel demo-behavior" style={{ borderInlineStartColor: liveryColors[draft.livery] }} aria-label="Behavior preview">
                <span className="eyebrow">Behavior preview</span><h2>{draft.scenario}</h2>
                <p>{draft.scenario === "Ready to fly" ? "A new player chooses a Callsign, then enters the Arcade. Each Trip contains ten Flights." : draft.scenario === "Flight Delayed" ? "The online-only game waits for the service to return before starting a Trip." : draft.scenario === "Maintenance" ? "The game shows a maintenance gate until service resumes." : "The game asks the player to update before continuing."}</p>
                <p>{draft.livery} livery · {draft.untimedMode ? "Untimed practice" : "Timed Flights"} · {draft.reducedMotion ? "Reduced motion" : "Standard motion"}</p>
              </section>
              <section className="demo-panel"><h2>Game rules & fresh player</h2><dl className="demo-facts">
                <div><dt>Miles / Status Points</dt><dd>0 / 0</dd></div><div><dt>Callsign</dt><dd>Not chosen</dd></div>
                <div><dt>Starter hints</dt><dd>{snapshot.hints.StarterHints}</dd></div><div><dt>Flights per Trip</dt><dd>{snapshot.hints.FlightsPerTrip}</dd></div>
                <div><dt>Hint grants</dt><dd>1 per {snapshot.hints.TripsPerHint} completed Trips; 1 per {snapshot.hints.DaysPerHint} consecutive played days</dd></div>
                <div><dt>Site day resets</dt><dd>{snapshot.defaults.dailyReset}</dd></div><div><dt>Monetization</dt><dd>Off · IAP, ads and First Class Pass deferred</dd></div>
              </dl><p>These are source rules, not editable live economy controls.</p>
              <div className="demo-table-wrap"><table><caption>Certified rank thresholds</caption><thead><tr><th>Rank</th><th>Status Points</th></tr></thead><tbody>{snapshot.thresholds.map((row) => <tr key={row.rank}><td>{row.rank}</td><td>{row.statusPoints.toLocaleString("en-US")}</td></tr>)}</tbody></table></div>
              </section>
            </>}
            {section === "Games & content" && <>
              <section className="demo-panel"><span className="eyebrow">02 / Imported catalog</span><h2>Games & content</h2><p>The current game registry includes the Commercial / Military split. Bundled demo availability is separate from a production release.</p>
                <ul className="demo-module-list">{snapshot.modules.map((module) => <li key={module.id}><span><strong>{module.name}</strong><small>{module.backendId}</small></span><span className="demo-badge">{module.status}</span></li>)}</ul>
              </section>
              <section className="demo-panel"><h2>Commercial question bank</h2><p>{snapshot.identifier.length} imported client questions. Photo IDs refer to assets bundled in the game.</p>
                <div className="demo-form-grid"><label className="demo-field">Search questions<input value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} placeholder="Aircraft, family or source ID" /></label>
                <label className="demo-field">Filter rank<select value={rank} onChange={(e) => setRank(e.target.value)}>{["All ranks", ...new Set(snapshot.identifier.map((row) => row.level))].map((name) => <option key={name}>{name}</option>)}</select></label></div>
                {questions.length ? <ul className="demo-question-list">{questions.map((row) => <li key={row.id}><span className="eyebrow">{row.id} · {row.level.replace(/([a-z])([A-Z])/g, "$1 $2")}</span><h3>{row.answer}</h3><p>Other choices: {row.wrong.join(" · ")}</p><small>{row.photographer} · {row.credit} · Photo {row.photoId}</small></li>)}</ul> : <p role="status">No questions match these filters.</p>}
              </section>
              <section className="demo-panel"><h2>Other bundled packs</h2><dl className="demo-facts">
                <div><dt>ATC Match</dt><dd>{snapshot.atc.records.length} airports · {snapshot.atc.reviewState}</dd></div>
                <div><dt>Call Sign Match</dt><dd>{snapshot.callsign.records.length} airlines · {snapshot.callsign.reviewState}</dd></div>
                <div><dt>Code Search</dt><dd>{snapshot.codeSearch.records.length} puzzles · {snapshot.codeSearch.reviewState}</dd></div>
                <div><dt>Tail Identifier</dt><dd>{snapshot.tail.records.length} questions · {snapshot.tail.reviewState}</dd></div>
              </dl><p>Source review states are preserved. Sample data does not authorize publication.</p></section>
            </>}
            {section === "Plane of the Day" && <section className="demo-panel"><span className="eyebrow">03 / Daily content</span><h2>Plane of the Day</h2><p>Preview an imported record. Selecting another entry replaces this draft’s title and description.</p>
              <label className="demo-field">Imported feature<select value={draft.potdId} onChange={(e) => { const next = snapshot.potd.find((entry) => entry.id === e.target.value); if (next) setDraft((current) => ({ ...current, potdId: next.id, potdTitle: next.title, potdDescription: next.description })); setMessage(""); }}>{snapshot.potd.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>
              <label className="demo-field">Feature title<input value={draft.potdTitle} maxLength={120} required onChange={(e) => change("potdTitle", e.target.value)} /></label>
              <label className="demo-field">Feature description<textarea value={draft.potdDescription} maxLength={2000} rows={6} required onChange={(e) => change("potdDescription", e.target.value)} /></label>
              <dl className="demo-facts"><div><dt>Aircraft</dt><dd>{feature.manufacturer} {feature.model}</dd></div><div><dt>Photographer</dt><dd>{feature.photographer} · {feature.credit}</dd></div><div><dt>Source / photo</dt><dd>{feature.id} / {feature.photoId}</dd></div><div><dt>Daily behavior</dt><dd>Once per local calendar day in the app; server decides grants.</dd></div></dl>
              <p>Photo stays in the game pack. This browser copy is not scheduled or published.</p>
            </section>}
            {section === "Submissions" && <section className="demo-panel"><span className="eyebrow">04 / Editorial examples</span><h2>Submissions</h2><p>Three illustrative proposals show the review states. Change a sample status and save to inspect persistence. Usage rights still require separate review.</p>
              <ul className="demo-submissions">{presets.map((row, index) => <li key={row.record}><div><span className="eyebrow">Sample {index + 1} · {row.record}</span><h3>{row.title}</h3><p>Credit reference: Josh M · @iamjoshmark</p><p>Rights: pending review · Publishing: unavailable</p></div>
                <label className="demo-field">Review state — sample {index + 1}<select value={draft.reviews[index]} onChange={(e) => { const reviews = [...draft.reviews]; reviews[index] = e.target.value as DemoState["reviews"][number]; change("reviews", reviews); }}>{reviewStates.map((state) => <option key={state}>{state}</option>)}</select></label>
              </li>)}</ul>
            </section>}
            {section === "Website & services" && <>
              <section className="demo-panel"><span className="eyebrow">05 / Website</span><h2>Website & services</h2><label className="demo-field">Preview site title<input value={draft.siteTitle} maxLength={80} required onChange={(e) => change("siteTitle", e.target.value)} /></label><div className="demo-title-preview"><h3>{draft.siteTitle || "Add a site title"}</h3><p>The Aviation Arcade</p></div><p>This title preview does not alter the public website header.</p>
                <dl className="demo-facts"><div><dt>Product sign-in</dt><dd>Firebase email/password and Google</dd></div><div><dt>Hosting / storage</dt><dd>Cloudflare / Bunny</dd></div><div><dt>Game-account linking</dt><dd>Pending account-policy decision</dd></div><div><dt>Staff roles & MFA</dt><dd>Current editor allowlist; expanded roles/MFA still planned</dd></div><div><dt>Support queue & reporting</dt><dd>Planned; no live player reports connected</dd></div><div><dt>Release controls & purchases</dt><dd>Unavailable in demo; monetization deferred</dd></div></dl>
              </section>
              <section className="demo-panel"><h2>Imported source record</h2><p>Snapshot: {snapshot.sourceDate}. These paths and checksums identify the game metadata used for this demo.</p><ul className="demo-sources">{snapshot.provenance.map((source) => <li key={source.path}><code>{source.path}</code><small>SHA-256 {source.sha256}</small></li>)}</ul></section>
            </>}
            <footer className="demo-save-bar"><span>{dirty ? "Unsaved demo changes" : "Game defaults or saved demo loaded"}</span><div><button className="btn secondary" type="button" onClick={reset}>Reset demo</button><button className="btn" type="button" onClick={save} disabled={!dirty}>Save demo changes</button></div></footer>
          </fieldset>
          <div className="demo-feedback" aria-live="polite">{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</div>
        </div>
      </div>
    </main>
  );
}

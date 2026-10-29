// Runs the EditorialStore contract against the in-memory adapter and the D1 adapter
// (node:sqlite with the real migration).
import { d1EditorialStore } from "../lib/editorial/d1-store.ts";
import { memoryEditorialStore } from "../lib/editorial/memory-store.ts";
import { editorialStoreContract } from "./editorial-store.contract.mjs";
import { d1Sqlite } from "./support/d1-sqlite.mjs";

editorialStoreContract("memory", ({ roster, photos }) => {
  const map = new Map(photos.map((p) => [p.id, p]));
  const store = memoryEditorialStore({ roster, photos: map });
  return {
    store,
    audits: async () => store.events.length,
    changePhoto: async (id, patch) => Object.assign(map.get(id), patch),
  };
});

editorialStoreContract("d1", ({ roster, photos }) => {
  const db = d1Sqlite();
  const insert = db.sqlite.prepare(
    "INSERT INTO submissions (id,owner_id,request_key,payload,image_key,image_mime,image_bytes,width,height,digest,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  const payload = (games) => JSON.stringify({ channels: games ? ["games"] : ["website"] });
  for (const p of photos)
    insert.run(p.id, "firebase:demo-airplane-games:photographer", p.id, payload(p.games), `k/${p.id}`,
      "image/jpeg", p.bytes, 1200, 800, p.demo ? `demo:${p.id}` : p.digest, p.status, p.version, "t", "t");
  return {
    store: d1EditorialStore(db, { roster }),
    audits: async () => db.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events").get().n,
    async changePhoto(id, patch) {
      const row = db.sqlite.prepare("SELECT * FROM submissions WHERE id=?").get(id);
      const games = patch.games ?? JSON.parse(row.payload).channels.includes("games");
      db.sqlite
        .prepare("UPDATE submissions SET status=?, payload=?, digest=?, version=? WHERE id=?")
        .run(
          patch.status ?? row.status,
          payload(games),
          patch.demo ? `demo:${id}` : row.digest,
          patch.version ?? row.version,
          id,
        );
    },
  };
});

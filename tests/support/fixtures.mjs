// Shared test fixtures: an in-memory photo store and seeded submission rows for the D1 shim.

export function memoryPhotos() {
  const objects = new Map();
  return {
    objects,
    async put(key, bytes) {
      objects.set(key, bytes);
    },
    async get(key) {
      return objects.has(key) ? { body: null } : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

export const submissionData = (overrides = {}) => ({
  title: "Approach at dawn",
  photographer: "Client Photographer",
  email: "photographer@example.com",
  portfolio: "",
  category: "aircraft",
  customCategory: "",
  targetGames: ["aircraft-identifier"],
  aircraft: "Boeing 767-200",
  airline: "",
  registration: "",
  location: "Somewhere",
  airportCode: "",
  capturedOn: "",
  description: "A photograph supplied for testing the editorial desk.",
  factualSource: "https://example.com/source",
  credit: "Client Photographer",
  rightsBasis: "owner",
  rightsEvidence: "",
  channels: ["games", "website", "plane-of-the-day"],
  imageOrigin: "camera",
  consent: true,
  ...overrides,
});

/** Inserts a submission row directly, as if a photographer had sent it earlier. */
export function seedSubmission(db, { id, owner = "firebase:demo-airplane-games:photographer", status = "approved", data = submissionData(), digest = `sha-${id}`, version = 1 }) {
  db.sqlite
    .prepare(
      "INSERT INTO submissions (id,owner_id,request_key,payload,image_key,image_mime,image_bytes,width,height,digest,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(id, owner, `${owner}:${id}`, JSON.stringify(data), `submissions/${id}/key`, "image/jpeg", 1000, 1200, 800, digest, status, version, new Date().toISOString(), new Date().toISOString());
}

import type { Category } from "./types.ts";

export type Game = {
  id: string;
  /** The module id on the wire (backend, Unity ModuleRegistry); see contracts/catalog.v1.json. */
  backendId: string;
  /** Website URL slug. Website-local, kept even where it differs from the module id. */
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  category: "Recognition" | "Matching" | "Word games";
  image: string;
  imageAlt: string;
  status: string;
  /** The photo category a contributor form starts with when it is opened for this game. */
  submissionCategory: Category;
};

/**
 * The Flight Crew Hierarchy, lowest first, the same for every game: contracts/catalog.v1.json
 * `ranks` (Unity FlightRank is the origin). tests/catalog.test.mjs keeps this equal to the contract.
 */
export const ranks = [
  { id: "trainee", name: "Trainee", statusPoints: 0 },
  { id: "first-officer", name: "First Officer", statusPoints: 10000 },
  { id: "captain", name: "Captain", statusPoints: 50000 },
  { id: "check-airman", name: "Check Airman", statusPoints: 100000 },
  { id: "chief-pilot", name: "Chief Pilot", statusPoints: 400000 },
] as const;
export const rankNames = ranks.map((r) => r.name) as unknown as readonly [
  "Trainee",
  "First Officer",
  "Captain",
  "Check Airman",
  "Chief Pilot",
];
export type RankName = (typeof ranks)[number]["name"];
export type RankId = (typeof ranks)[number]["id"];

export const photographer = "Josh M";
export const photographerUrl = "https://www.instagram.com/iamjoshmark/";

// Backend IDs are the module ids in contracts/catalog.v1.json (Unity ModuleRegistry is the
// origin). URL slugs are the website's own. A catalog entry describes the planned game, and
// does not claim a production app release.
export const games: Game[] = [
  {
    id: "identifier",
    backendId: "identifier",
    slug: "aircraft-identifier",
    name: "Aircraft Identifier",
    subtitle: "What plane is that?",
    description:
      "Read the silhouette, study the engines and choose the aircraft. Familiar airliners lead to harder angles and finer details.",
    category: "Recognition",
    image: "/media/aircraft.webp",
    imageAlt:
      "KLM twin-engine airliner approaching with its landing gear lowered.",
    status: "In development",
    submissionCategory: "aircraft",
  },
  // Working title: the client has confirmed an eighth game, a military variant of
  // Aircraft Identifier. Its final name is not yet set; its module id is decided.
  {
    id: "military-identifier",
    backendId: "aircraft-identifier-military",
    slug: "military-aircraft-identifier",
    name: "Military Aircraft Identifier",
    subtitle: "What jet is that?",
    description:
      "The Aircraft Identifier challenge, flown with military types. Tell fighters, transports and trainers apart by silhouette, engines and finer details.",
    category: "Recognition",
    image: "",
    imageAlt: "",
    status: "In development",
    submissionCategory: "aircraft",
  },
  {
    id: "tail-identifier",
    backendId: "tail-identifier",
    slug: "tail-identifier",
    name: "Tail Identifier",
    subtitle: "Know it by its colours.",
    description:
      "Identify the airline from its tail livery. Discover the details that distinguish familiar carriers, regional airlines and historic fleets.",
    category: "Recognition",
    image: "/media/tail.webp",
    imageAlt:
      "KLM aircraft with its blue crown tail livery visible; contextual photography, not a cropped game question.",
    status: "In development",
    submissionCategory: "tail",
  },
  {
    id: "airport-spotter",
    backendId: "airport-spotter",
    slug: "airport-spotter",
    name: "Airport Spotter",
    subtitle: "Every airport has a tell.",
    description:
      "Recognize airports from real photographs. Start with distinctive landmarks, then look for smaller clues in terminals and airfield details.",
    category: "Recognition",
    image: "",
    imageAlt: "",
    status: "In development",
    submissionCategory: "airport",
  },
  {
    id: "atc-match",
    backendId: "atc-match",
    slug: "atc-match",
    name: "ATC Match",
    subtitle: "Three letters. One airport.",
    description:
      "Match airport names to their three-letter IATA codes before time runs out. Turn familiar destinations into confident recall.",
    category: "Matching",
    image: "",
    imageAlt: "",
    status: "In development",
    submissionCategory: "atc",
  },
  {
    id: "call-sign-match",
    backendId: "call-sign-match",
    slug: "call-sign-match",
    name: "Call Sign Match",
    subtitle: "Tune in to the airline.",
    description:
      "Match radio callsigns to their airlines against the clock. Learn the names heard on the frequency, from major carriers to historic operators.",
    category: "Matching",
    image: "",
    imageAlt: "",
    status: "In development",
    submissionCategory: "atc",
  },
  {
    id: "code-search",
    backendId: "code-search",
    slug: "code-search",
    name: "Code Search",
    subtitle: "Find your next destination.",
    description:
      "Find airport codes hidden in a letter grid. Later challenges turn city names into clues, testing recall as well as your eye.",
    category: "Word games",
    image: "",
    imageAlt: "",
    status: "In development",
    submissionCategory: "atc",
  },
  {
    id: "runway-identifier",
    backendId: "runway-identifier",
    slug: "runway-identifier",
    name: "Runway Identifier",
    subtitle: "Read the shape of the airfield.",
    description:
      "Identify airports from their runway layouts. Distinctive footprints give way to intersecting patterns and unfamiliar airfields.",
    category: "Recognition",
    image: "",
    imageAlt: "",
    status: "In development",
    submissionCategory: "runway",
  },
];

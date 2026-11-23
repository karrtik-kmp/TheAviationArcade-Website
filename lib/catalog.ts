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
  /**
   * The game's own page, in the client's words (website notes 1, 2026-11). Absent until the
   * client supplies it; the page then falls back to `description`.
   */
  detail?: {
    heading: string;
    body: string[];
    mission?: string;
    actionsHeading: string;
  };
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
    subtitle: "Can You Name That Plane?",
    description:
      "Think you know a Boeing from an Airbus? Look closely at the wings, engines, and shape to identify everything from familiar passenger jets to more challenging aircraft.",
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
    subtitle: "Mission: Identify That Aircraft!",
    description:
      "Fighter jets, military transports, and legendary aircraft. Take on a new identification challenge and see if you've got the eye of an aviation expert.",
    category: "Recognition",
    image: "",
    imageAlt: "",
    status: "In development",
    submissionCategory: "aircraft",
    detail: {
      heading: "You've Got an Aircraft to Identify!",
      body: [
        "From legendary fighter jets to massive military transports, the skies are filled with incredible machines.",
        "Do you have what it takes to tell them apart? Study the shape, examine the details, and put your military aviation knowledge to the test.",
      ],
      mission: "Identify the aircraft and build your skills across increasingly difficult challenges.",
      actionsHeading: "Identify the Military Aircraft!",
    },
  },
  {
    id: "tail-identifier",
    backendId: "tail-identifier",
    slug: "tail-identifier",
    name: "Tail Identifier",
    subtitle: "Whose Tail Is That?",
    description:
      "How well do you know the world's airlines? From iconic logos to colorful liveries, identify the airline using only its tail. Some are easy. Others might leave you scratching your head!",
    category: "Recognition",
    image: "/media/tail.webp",
    imageAlt:
      "KLM aircraft with its blue crown tail livery visible; contextual photography, not a cropped game question.",
    status: "In development",
    submissionCategory: "tail",
    detail: {
      heading: "A Little Tail Can Tell You a Lot.",
      body: [
        "Some airline tails are instantly recognizable. Others? Not so much.",
        "From the world's biggest carriers to regional airlines and historic liveries, discover how much you can learn from a single tail design.",
      ],
      mission: "Identify the airline using the aircraft's tail artwork. Look for colors, patterns, and logos.",
      actionsHeading: "Test Your Airline Knowledge",
    },
  },
  {
    id: "airport-spotter",
    backendId: "airport-spotter",
    slug: "airport-spotter",
    name: "Airport Spotter",
    subtitle: "Where in the world are you?",
    description:
      "From famous international hubs to hidden aviation gems, see how many airports you can recognize.",
    category: "Recognition",
    image: "",
    imageAlt: "",
    status: "In development",
    submissionCategory: "airport",
    detail: {
      heading: "Welcome to your next mystery destination.",
      body: [
        "A terminal. A tower. A runway. A familiar mountain in the distance. Every picture offers clues to where you've landed.",
      ],
      mission: "Study the airport photograph, look for recognizable features, and identify the destination.",
      actionsHeading: "Start Exploring Airports",
    },
  },
  {
    id: "atc-match",
    backendId: "atc-match",
    slug: "atc-match",
    name: "ATC Match",
    subtitle: "Three Letters. One Destination.",
    description:
      "LAX. JFK. LHR. Think you know your airport codes? Match airport names with their three-letter codes before the clock runs out.",
    category: "Matching",
    image: "",
    imageAlt: "",
    status: "In development",
    submissionCategory: "atc",
    detail: {
      heading: "Know Your Airport ABCs?",
      body: [
        "Three letters can take you almost anywhere.",
        "From LAX to LHR, the world's airports have their own unique codes. Some are obvious. Others are full of surprises.",
      ],
      mission: "Match airport names with their three-letter IATA codes before the clock runs out.",
      actionsHeading: "Put Your Airport Knowledge to Work",
    },
  },
  {
    id: "call-sign-match",
    backendId: "call-sign-match",
    slug: "call-sign-match",
    name: "Call Sign Match",
    subtitle: "Who's Calling the Tower?",
    description:
      "Speedbird. Cactus. Shamrock. Every airline has a voice on the radio. Match aviation call signs to the airlines behind them and see how well you know the airwaves.",
    category: "Matching",
    image: "",
    imageAlt: "",
    status: "In development",
    submissionCategory: "atc",
    detail: {
      heading: "Do You Speak Airline?",
      body: [
        "When an airline calls air traffic control, it doesn't always use the name painted on its airplanes.",
        "Ever wondered who's behind names like Speedbird or Shamrock?",
      ],
      mission: "Match the airline's radio call sign with the correct airline. Keep your eyes sharp and your aviation knowledge sharper.",
      actionsHeading: "Tune In to the Challenge",
    },
  },
  {
    id: "code-search",
    backendId: "code-search",
    slug: "code-search",
    name: "Code Search",
    subtitle: "Find the Code. Beat the Clock.",
    description:
      "Your favorite word search just got its wings! Hunt for hidden three-letter airport codes in a grid of letters. As you climb the ranks, the clues get trickier and your airport knowledge really gets put to the test.",
    category: "Word games",
    image: "",
    imageAlt: "",
    status: "In development",
    submissionCategory: "atc",
    detail: {
      heading: "Your Next Destination Is Hidden in Plain Sight.",
      body: [
        "Airport codes are hiding in a sea of letters, and the clock is ticking!",
        "Search the grid, find the right codes, and discover how good you really are at recognizing aviation's three-letter language.",
      ],
      mission: "Find hidden IATA airport codes in a word-search puzzle. As the difficulty increases, city names become clues that you must translate into airport codes.",
      actionsHeading: "Find Your First Code",
    },
  },
  {
    id: "runway-identifier",
    backendId: "runway-identifier",
    slug: "runway-identifier",
    name: "Runway Identifier",
    subtitle: "Can You Recognize an Airport From the Runway Layout?",
    description:
      "Every airport has a unique layout. Study the runways, look for distinctive patterns, and identify the airport without seeing its name.",
    category: "Recognition",
    image: "",
    imageAlt: "",
    status: "In development",
    submissionCategory: "runway",
    detail: {
      heading: "All Runways Lead Somewhere. But Where?",
      body: [
        "Every airport has its own unique fingerprint.",
        "Some have parallel runways stretching for miles. Others have intersecting layouts or unusual shapes.",
      ],
      mission: "Study an airport's runway diagram and identify the airport using only its layout. No airport name. Just you and the runways.",
      actionsHeading: "Take the Runway Challenge",
    },
  },
];

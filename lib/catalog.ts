export type Game = {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  category: "Recognition" | "Matching" | "Word games";
  image: string;
  imageAlt: string;
  status: string;
  guide: string[];
};

export const photographer = "Josh M";
export const photographerUrl = "https://www.instagram.com/iamjoshmark/";

// Public slugs and backend IDs follow the Unity ModuleRegistry. A catalog entry
// describes the planned game, and does not claim a production app release.
export const games: Game[] = [
  {
    id: "identifier",
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
    guide: [
      "Study a real aircraft photograph.",
      "Choose the aircraft from the answer options.",
      "Complete ten Flights to finish a Trip and review your debrief.",
    ],
  },
  {
    id: "tail-identifier",
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
    guide: [
      "Look closely at the tail livery in the game photograph.",
      "Choose the airline that matches the design.",
      "Progress toward less familiar carriers and historic liveries.",
    ],
  },
  {
    id: "airport-spotter",
    slug: "airport-spotter",
    name: "Airport Spotter",
    subtitle: "Every airport has a tell.",
    description:
      "Recognize airports from real photographs. Start with distinctive landmarks, then look for smaller clues in terminals and airfield details.",
    category: "Recognition",
    image: "",
    imageAlt: "",
    status: "In development",
    guide: [
      "Study the airport photograph and its visible landmarks.",
      "Choose the airport supported by the image.",
      "Take on tighter views and subtler clues as the challenge grows.",
    ],
  },
  {
    id: "atc-match",
    slug: "atc-match",
    name: "ATC Match",
    subtitle: "Three letters. One airport.",
    description:
      "Match airport names to their three-letter IATA codes before time runs out. Turn familiar destinations into confident recall.",
    category: "Matching",
    image: "",
    imageAlt: "",
    status: "In development",
    guide: [
      "Read the airport names and available IATA codes.",
      "Connect each airport to its matching code.",
      "Complete the board before the countdown ends.",
    ],
  },
  {
    id: "call-sign-match",
    slug: "call-sign-match",
    name: "Call Sign Match",
    subtitle: "Tune in to the airline.",
    description:
      "Match radio callsigns to their airlines against the clock. Learn the names heard on the frequency, from major carriers to historic operators.",
    category: "Matching",
    image: "",
    imageAlt: "",
    status: "In development",
    guide: [
      "Read the callsigns and airline names.",
      "Connect each callsign to its airline.",
      "Finish the matching board before time runs out.",
    ],
  },
  {
    id: "code-search",
    slug: "code-search",
    name: "Code Search",
    subtitle: "Find your next destination.",
    description:
      "Find airport codes hidden in a letter grid. Later challenges turn city names into clues, testing recall as well as your eye.",
    category: "Word games",
    image: "",
    imageAlt: "",
    status: "In development",
    guide: [
      "Read the list of target airport codes or city clues.",
      "Find and trace each matching code in the letter grid.",
      "Complete the puzzle by finding every target.",
    ],
  },
  {
    id: "runway-identifier",
    slug: "runway-identifier",
    name: "Runway Identifier",
    subtitle: "Read the shape of the airfield.",
    description:
      "Identify airports from their runway layouts. Distinctive footprints give way to intersecting patterns and unfamiliar airfields.",
    category: "Recognition",
    image: "",
    imageAlt: "",
    status: "In development",
    guide: [
      "Study the airport runway diagram.",
      "Compare the layout and any provided geography clues.",
      "Choose the airport that matches the diagram.",
    ],
  },
];

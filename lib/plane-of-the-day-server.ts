import { setting } from "@/lib/settings";
import { createPlaneOfTheDayCache } from "@/lib/plane-of-the-day";

/** Today's Plane of the Day, cached for this server process (see lib/plane-of-the-day.ts). */
export const getPlaneOfTheDay = createPlaneOfTheDayCache({ baseUrl: () => setting("GAME_API_BASE_URL") });

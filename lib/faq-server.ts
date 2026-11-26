import { setting } from "@/lib/settings";
import { createFaqCache } from "@/lib/faq";

/** The published FAQ, cached for this server process (see lib/faq.ts). */
export const getFaq = createFaqCache({ baseUrl: () => setting("GAME_API_BASE_URL") });

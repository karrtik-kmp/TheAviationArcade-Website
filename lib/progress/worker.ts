/**
 * Chooses the ProgressSource from the server environment. Server-only. The labelled sample is used
 * only in a development build with `PROGRESS_SOURCE=mock`; otherwise progress comes from
 * `GAME_API_BASE_URL`, and with no URL the page says the website is not connected.
 */
import { runtime } from "#runtime";
import { backendClient } from "@/lib/request/backend";
import { httpProgressSource } from "@/lib/progress/http";
import { mockProgressSource } from "@/lib/progress/mock";
import type { ProgressSource } from "@/lib/progress/source";

export function progressSource(): ProgressSource {
  if (import.meta.env.DEV === true && runtime.setting("PROGRESS_SOURCE") === "mock") return mockProgressSource;
  return httpProgressSource((bearer) => backendClient({ baseUrl: runtime.setting("GAME_API_BASE_URL") }, bearer));
}

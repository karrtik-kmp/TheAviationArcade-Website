import { z } from "zod";

export const liveries = ["Chartroom", "Atlantic", "Pacific", "Continental"] as const;
export const scenarios = ["Ready to fly", "Flight Delayed", "Maintenance", "Update required"] as const;
export const reviewStates = ["Pending review", "Approved sample", "Needs changes"] as const;
const demoSchema = z.object({
  version: z.literal(1),
  livery: z.enum(liveries), sound: z.boolean(), navigationVibration: z.boolean(),
  gameplayVibration: z.boolean(), reducedMotion: z.boolean(), untimedMode: z.boolean(),
  scenario: z.enum(scenarios), siteTitle: z.string().trim().min(1).max(80),
  potdId: z.string().min(1).max(80), potdTitle: z.string().trim().min(1).max(120),
  potdDescription: z.string().trim().min(1).max(2000),
  reviews: z.array(z.enum(reviewStates)).length(3),
});
export type DemoState = z.infer<typeof demoSchema>;
export function initialDemoState(potd: { id: string; title: string; description: string }): DemoState {
  return { version: 1, livery: "Chartroom", sound: true, navigationVibration: true,
    gameplayVibration: true, reducedMotion: false, untimedMode: false, scenario: "Ready to fly",
    siteTitle: "Airplane Games", potdId: potd.id, potdTitle: potd.title, potdDescription: potd.description,
    reviews: ["Pending review", "Approved sample", "Needs changes"] };
}
export function parseDemoState(value: unknown): DemoState | null {
  const result = demoSchema.safeParse(value);
  return result.success ? result.data : null;
}
export function demoStorageKey(sessionKey: string) {
  return `aa-website-demo-v1:${sessionKey}`;
}

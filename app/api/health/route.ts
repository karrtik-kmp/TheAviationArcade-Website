/** Liveness for the server's deploy and process manager: 200 whenever the process can serve. No auth. */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

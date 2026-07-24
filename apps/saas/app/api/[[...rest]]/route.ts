import { app } from "@repo/api";
import { handle } from "hono/vercel";

// FABLE_AUDIT P2: headroom for the heavier RPCs behind this catch-all
// (news publish fan-out, feed fan-out) beyond the platform default.
export const maxDuration = 60;

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;

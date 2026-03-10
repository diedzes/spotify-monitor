import { handlers } from "@/auth";

// Auth.js v5: AUTH_URL/NEXTAUTH_URL breken action-parsing (UnknownAction).
// Tijdelijk uitzetten zodat reqWithEnvURL(req) de originele request doorgeeft.
function wrap(
  handler: (req: Request) => Promise<Response>
): (req: Request, context?: unknown) => Promise<Response> {
  return async (req: Request) => {
    const prevAuthUrl = process.env.AUTH_URL;
    const prevNextAuthUrl = process.env.NEXTAUTH_URL;
    try {
      delete process.env.AUTH_URL;
      delete process.env.NEXTAUTH_URL;
      return await handler(req);
    } finally {
      if (prevAuthUrl !== undefined) process.env.AUTH_URL = prevAuthUrl;
      if (prevNextAuthUrl !== undefined) process.env.NEXTAUTH_URL = prevNextAuthUrl;
    }
  };
}

export const GET = wrap(handlers.GET as (req: Request) => Promise<Response>);
export const POST = wrap(handlers.POST as (req: Request) => Promise<Response>);

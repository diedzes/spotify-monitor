import NextAuth from "next-auth";
import { authOptions } from "@/auth";

const handler = NextAuth(authOptions);

// Next.js 15+ geeft params als Promise; NextAuth verwacht een object met params.
type Context = { params: Promise<{ nextauth?: string[] }> };
async function withContext(req: Request, context: Context) {
  const params = await context.params;
  return handler(req, { params } as Parameters<typeof handler>[1]);
}

export const GET = (req: Request, context: Context) => withContext(req, context);
export const POST = (req: Request, context: Context) => withContext(req, context);

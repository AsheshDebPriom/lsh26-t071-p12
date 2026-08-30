import type { NextRequest } from "next/server";

import { updateSession } from "@/utils/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * Everything except static assets and the image optimiser. There are no
   * accounts in this build, so this is inert today — but keeping it off the
   * asset paths means it costs nothing while it waits for auth.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sample-data|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps a Supabase auth session fresh across requests.
 *
 * Honest note: this build has **no accounts**, so there is no session to
 * refresh and this currently does nothing but pass the request through. It is
 * wired up now so that adding Supabase Auth later is a configuration change
 * rather than a new request pipeline — and the matcher in `src/middleware.ts`
 * keeps it off static assets so it costs nothing on the paths that matter.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const updateSession = async (request: NextRequest) => {
  let supabaseResponse = NextResponse.next({ request });

  // Nothing is configured: pass straight through rather than throwing on every
  // request. The app is designed to work with no database at all.
  if (!supabaseUrl || !supabaseKey) return supabaseResponse;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Touching the user is what actually refreshes an expiring token. With no
  // accounts it simply returns null, which is fine and cheap.
  await supabase.auth.getUser();

  return supabaseResponse;
};

/** Kept for parity with the Supabase quickstart's naming. */
export const createClient = updateSession;

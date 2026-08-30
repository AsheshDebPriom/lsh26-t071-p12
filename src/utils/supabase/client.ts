import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client.
 *
 * The publishable key is public by design — it ships in the bundle and is meant
 * to. What keeps a ledger private is not this key: the tables have row level
 * security on with no policies, so this client can read nothing directly. The
 * only surface it can reach is `save_ledger` / `load_ledger`, and those need the
 * ledger's own unguessable id.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const createClient = () => createBrowserClient(supabaseUrl!, supabaseKey!);

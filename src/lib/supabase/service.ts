import { createClient as createSupabaseClient, SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Create a Supabase client with service role key.
 * Use this for server-side operations that need elevated permissions.
 */
// Singleton service client — avoids creating new realtime WebSocket connections per call
let _serviceClient: SupabaseClient<Database> | null = null;

export function createServiceClient(): SupabaseClient<Database> {
  if (_serviceClient) return _serviceClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service role configuration");
  }

  _serviceClient = createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Disconnect realtime — service client only needs REST
  _serviceClient.realtime.disconnect();

  return _serviceClient;
}

/**
 * Authenticate a request using Bearer token.
 * Returns the user and supabase client if valid, null otherwise.
 */
export async function authenticateWithToken(authHeader: string | null): Promise<{
  user: User;
  supabase: SupabaseClient<Database>;
} | null> {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const supabase = createSupabaseClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return null;
  }

  return { user, supabase };
}

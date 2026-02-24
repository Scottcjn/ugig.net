import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authenticateApiKey } from "./api-key";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthenticatedUser = {
  id: string;
  email?: string;
  authMethod: "session" | "api_key";
};

export type AuthContext = {
  user: AuthenticatedUser;
  supabase: SupabaseClient<Database>;
};

/**
 * Get the auth context (user + supabase client) from session cookies or API key.
 * For session auth, returns the session-scoped client (with RLS).
 * For API key auth, returns the service role client (bypasses RLS).
 * Routes already filter by user.id so data access is correctly scoped.
 */
export async function getAuthContext(
  request: NextRequest
): Promise<AuthContext | null> {
  // Try session-based auth first
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return {
      user: {
        id: user.id,
        email: user.email,
        authMethod: "session",
      },
      supabase,
    };
  }

  // Try Bearer token auth (Supabase JWT via Authorization header)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ") && !authHeader.slice(7).startsWith("ugig_live_")) {
    const token = authHeader.slice(7);
    const bearerClient = createSupabaseAdmin<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user: bearerUser }, error } = await bearerClient.auth.getUser(token);
    if (bearerUser && !error) {
      return {
        user: { id: bearerUser.id, email: bearerUser.email, authMethod: "session" as const },
        supabase: bearerClient,
      };
    }
  }

  // Fall back to API key auth
  const apiKeyHeader = request.headers.get("x-api-key");
  const apiKeyResult = await authenticateApiKey(authHeader, apiKeyHeader);

  if (apiKeyResult) {
    const serviceClient = createServiceClient();
    return {
      user: {
        id: apiKeyResult.userId,
        authMethod: "api_key",
      },
      supabase: serviceClient,
    };
  }

  return null;
}

/**
 * Create a Supabase client with service role (admin) privileges.
 * Used for API key authenticated requests where there is no user session.
 */
export function createServiceClient() {
  return createSupabaseAdmin<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

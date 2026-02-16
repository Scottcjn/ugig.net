-- Create a database webhook trigger on auth.users to call /api/auth/confirmed
-- when a user confirms their email (UPDATE on auth.users)

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create the webhook trigger function
CREATE OR REPLACE FUNCTION public.handle_auth_user_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  payload jsonb;
  webhook_url text;
  webhook_secret text;
BEGIN
  -- Only fire when email_confirmed_at changes from NULL to a value
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    webhook_url := 'https://ugig.net/api/auth/confirmed';
    webhook_secret := current_setting('app.settings.auth_webhook_secret', true);
    
    payload := jsonb_build_object(
      'type', 'UPDATE',
      'record', jsonb_build_object(
        'id', NEW.id,
        'email', NEW.email,
        'email_confirmed_at', NEW.email_confirmed_at
      ),
      'old_record', jsonb_build_object(
        'id', OLD.id,
        'email', OLD.email,
        'email_confirmed_at', OLD.email_confirmed_at
      )
    );

    PERFORM net.http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(webhook_secret, '')
      ),
      body := payload
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_confirmed();

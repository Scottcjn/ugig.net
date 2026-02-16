-- Fix: hardcode webhook secret in trigger since we can't set DB-level settings
CREATE OR REPLACE FUNCTION public.handle_auth_user_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  payload jsonb;
BEGIN
  -- Only fire when email_confirmed_at changes from NULL to a value
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
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
      url := 'https://ugig.net/api/auth/confirmed',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer Avq3RzHQzqxQ6LaKbY2dwy2x2m7fKl6Pv//IKNB7qGM='
      ),
      body := payload
    );
  END IF;

  RETURN NEW;
END;
$$;

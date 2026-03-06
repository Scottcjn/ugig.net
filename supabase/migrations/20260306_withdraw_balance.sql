-- Atomic balance withdrawal to prevent race conditions / double-spend
CREATE OR REPLACE FUNCTION withdraw_balance(p_user_id uuid, p_amount integer)
RETURNS TABLE(user_id uuid, balance_sats integer) AS $$
BEGIN
  RETURN QUERY
  UPDATE wallets w
  SET balance_sats = w.balance_sats - p_amount,
      updated_at = now()
  WHERE w.user_id = p_user_id
    AND w.balance_sats >= p_amount
  RETURNING w.user_id, w.balance_sats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

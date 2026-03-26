-- Add 'funding' to the payment_type enum
ALTER TYPE payment_type ADD VALUE IF NOT EXISTS 'funding';

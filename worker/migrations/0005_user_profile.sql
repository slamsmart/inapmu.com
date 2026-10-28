-- Account settings: optional WhatsApp number (E.164 without "+", e.g. 6281234567890).
-- Also used as the default mobile number for Mayar QRIS invoices.
ALTER TABLE users ADD COLUMN phone TEXT;

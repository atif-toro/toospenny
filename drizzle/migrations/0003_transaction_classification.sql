ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS classification text,
  ADD COLUMN IF NOT EXISTS classification_source text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS link_id text,
  ADD COLUMN IF NOT EXISTS counterpart_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS suggestion jsonb,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

UPDATE public.transactions SET classification = type WHERE classification IS NULL;

ALTER TABLE public.transactions ADD CONSTRAINT transactions_classification_check
  CHECK (classification IS NULL OR classification IN ('income','expense','transfer','internal','excluded'));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_classification_source_check
  CHECK (classification_source IN ('auto','user'));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_review_status_check
  CHECK (review_status IN ('none','needs_review','confirmed','dismissed'));

CREATE OR REPLACE FUNCTION public.transactions_default_classification()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.classification IS NULL THEN NEW.classification := NEW.type; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER transactions_default_classification
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.transactions_default_classification();

CREATE INDEX IF NOT EXISTS transactions_user_class_idx ON public.transactions(user_id, classification, date);
CREATE INDEX IF NOT EXISTS transactions_link_idx ON public.transactions(user_id, link_id);
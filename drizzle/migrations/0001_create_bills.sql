CREATE TABLE public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'fixed' CHECK (kind IN ('fixed','subscription')),
  amount_pence bigint NOT NULL CHECK (amount_pence >= 0),
  cadence text NOT NULL DEFAULT 'monthly' CHECK (cadence IN ('weekly','monthly','quarterly','annual')),
  due_day integer NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 31),
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills TO authenticated;
GRANT ALL ON public.bills TO service_role;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bills" ON public.bills FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.bill_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  period text NOT NULL,
  amount_pence bigint NOT NULL CHECK (amount_pence >= 0),
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bill_id, period)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_payments TO authenticated;
GRANT ALL ON public.bill_payments TO service_role;
ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bill payments" ON public.bill_payments FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX bills_user_idx ON public.bills (user_id, active);
CREATE INDEX bill_payments_user_period_idx ON public.bill_payments (user_id, period);

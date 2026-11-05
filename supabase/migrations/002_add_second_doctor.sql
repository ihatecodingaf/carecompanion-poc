-- ── RPC: get_org_doctors ──────────────────────────────────────────────────
-- Returns all doctors for an org via dynamic schema (accessible from public RPC)
CREATE OR REPLACE FUNCTION public.get_org_doctors(p_org_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema TEXT := quote_ident('org_' || p_org_slug);
  v_result JSONB;
BEGIN
  EXECUTE format(
    'SELECT COALESCE(json_agg(d ORDER BY d.name), ''[]''::json) FROM %I.doctors d',
    ('org_' || p_org_slug)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- ── Seed: second demo doctor ───────────────────────────────────────────────
INSERT INTO org_care_demo.doctors (id, name, specialty, clinic_name, clinic_location, email, phone)
VALUES (
  'dr-sharma-002',
  'Dr. Anil Sharma',
  'Dermatology & Trichology',
  'DermaCare Clinic',
  'Mumbai, MH',
  'dr.sharma@careai.demo',
  '+91 98765 43210'
)
ON CONFLICT (id) DO NOTHING;

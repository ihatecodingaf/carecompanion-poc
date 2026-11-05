-- RPC: list_org_patients
-- Returns patients who have a doctor assigned AND have an email (can log into patient app).
-- Called with anon key from patient app LoginPage to build dynamic patient list.
CREATE OR REPLACE FUNCTION public.list_org_patients(p_org_slug TEXT)
RETURNS TABLE (
  id        TEXT,
  name      TEXT,
  email     TEXT,
  condition TEXT,
  current_day INTEGER,
  status    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY EXECUTE format(
    $sql$
      SELECT id, name, email, condition, current_day, status
      FROM %I.patients
      WHERE doctor_id IS NOT NULL
        AND email IS NOT NULL
      ORDER BY name
    $sql$,
    'org_' || p_org_slug
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_org_patients(TEXT) TO anon, authenticated;

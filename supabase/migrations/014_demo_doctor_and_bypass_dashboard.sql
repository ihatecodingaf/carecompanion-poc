-- ============================================================
-- Migration 014: bypass dashboard RPC for the doctor PWA demo login
--
-- The doctor PWA's demo login offers two doctors (Dr. Sofia Martinez and
-- Dr. Priya Nair) and loads their dashboard via get_doctor_dashboard_bypass.
-- Both were created by hand in the original project and never captured in a
-- migration (007 was left empty), so a fresh database could not serve the
-- demo login. The function lives here; the second doctor is in seed.sql.
-- ============================================================

-- ── Dashboard for one doctor in one org, no Supabase Auth required ─────────
-- Returns { patients: [...], alerts: [...], stats: {...} } — the DashboardData
-- shape in apps/doctor/src/store/useStore.ts.
CREATE OR REPLACE FUNCTION public.get_doctor_dashboard_bypass(
  p_doctor_id TEXT,
  p_org_slug  TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema   TEXT := 'org_' || p_org_slug;
  v_org_name TEXT;
  v_result   JSONB;
BEGIN
  SELECT name INTO v_org_name FROM public.orgs WHERE slug = p_org_slug;

  EXECUTE format($q$
    WITH pts AS (
      SELECT p.id, p.name, p.age, p.gender, p.condition, p.treatment_name,
             p.current_day, p.status, p.adherence_percent, p.avatar_url, p.phone,
             $2::text AS org_slug, $3::text AS org_name
      FROM %I.patients p
      WHERE p.doctor_id = $1
    ),
    open_alerts AS (
      SELECT a.id, a.patient_id, a.severity, a.title, a.ai_analysis, a.created_at,
             $2::text AS org_slug, $3::text AS org_name
      FROM %I.alerts a
      JOIN pts ON pts.id = a.patient_id
      WHERE a.resolved = false
    )
    SELECT jsonb_build_object(
      'patients', COALESCE((SELECT jsonb_agg(to_jsonb(pts) ORDER BY
                     CASE pts.status WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 ELSE 2 END, pts.name)
                   FROM pts), '[]'::jsonb),
      'alerts',   COALESCE((SELECT jsonb_agg(to_jsonb(open_alerts) ORDER BY open_alerts.created_at DESC)
                   FROM open_alerts), '[]'::jsonb),
      'stats', jsonb_build_object(
        'total_patients', (SELECT count(*) FROM pts),
        'alerts_open',    (SELECT count(*) FROM open_alerts),
        'red_count',      (SELECT count(*) FROM pts WHERE status = 'red'),
        'yellow_count',   (SELECT count(*) FROM pts WHERE status = 'yellow'),
        'green_count',    (SELECT count(*) FROM pts WHERE status = 'green'),
        'avg_adherence',  COALESCE((SELECT round(avg(adherence_percent))::int FROM pts), 0)
      )
    )
  $q$, v_schema, v_schema)
  INTO v_result
  USING p_doctor_id, p_org_slug, v_org_name;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_doctor_dashboard_bypass(TEXT, TEXT) TO anon, authenticated;

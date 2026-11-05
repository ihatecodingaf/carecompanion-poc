-- Fix get_org_dashboard: rewrite using format()/%I instead of quote_ident+||
-- The live function had a broken format() call causing "too few arguments" error.

CREATE OR REPLACE FUNCTION public.get_org_dashboard(p_org_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schema   TEXT := 'org_' || p_org_slug;
  v_patients JSONB;
  v_alerts   JSONB;
  v_stats    JSONB;
BEGIN
  EXECUTE format(
    'SELECT json_agg(p ORDER BY CASE p.status WHEN ''red'' THEN 0 WHEN ''yellow'' THEN 1 ELSE 2 END, p.name)
     FROM %I.patients p',
    v_schema
  ) INTO v_patients;

  EXECUTE format(
    'SELECT json_agg(a ORDER BY a.created_at DESC)
     FROM %I.alerts a WHERE a.resolved = false',
    v_schema
  ) INTO v_alerts;

  EXECUTE format(
    'SELECT json_build_object(
       ''total'',         count(*),
       ''red'',           count(*) FILTER (WHERE status = ''red''),
       ''yellow'',        count(*) FILTER (WHERE status = ''yellow''),
       ''green'',         count(*) FILTER (WHERE status = ''green''),
       ''avg_adherence'', round(avg(adherence_percent)::numeric, 1),
       ''alerts_open'',   (SELECT count(*) FROM %I.alerts WHERE resolved = false)
     ) FROM %I.patients',
    v_schema, v_schema
  ) INTO v_stats;

  RETURN json_build_object(
    'patients',           COALESCE(v_patients, '[]'::jsonb),
    'unresolved_alerts',  COALESCE(v_alerts,   '[]'::jsonb),
    'stats',              COALESCE(v_stats,    '{}'::jsonb)
  );
END;
$$;

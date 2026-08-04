-- Rename plural tables to singular (lecturer requirement).
-- Safe to re-run: only renames when the plural name still exists.

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL AND to_regclass('public.user') IS NULL THEN
    ALTER TABLE users RENAME TO "user";
  END IF;

  IF to_regclass('public.reporter_profiles') IS NOT NULL AND to_regclass('public.reporter_profile') IS NULL THEN
    ALTER TABLE reporter_profiles RENAME TO reporter_profile;
  END IF;

  IF to_regclass('public.police_officer_profiles') IS NOT NULL AND to_regclass('public.police_officer_profile') IS NULL THEN
    ALTER TABLE police_officer_profiles RENAME TO police_officer_profile;
  END IF;

  IF to_regclass('public.ngo_profiles') IS NOT NULL AND to_regclass('public.ngo_profile') IS NULL THEN
    ALTER TABLE ngo_profiles RENAME TO ngo_profile;
  END IF;

  IF to_regclass('public.admin_profiles') IS NOT NULL AND to_regclass('public.admin_profile') IS NULL THEN
    ALTER TABLE admin_profiles RENAME TO admin_profile;
  END IF;

  IF to_regclass('public.police_stations') IS NOT NULL AND to_regclass('public.police_station') IS NULL THEN
    ALTER TABLE police_stations RENAME TO police_station;
  END IF;

  IF to_regclass('public.ngo_orgs') IS NOT NULL AND to_regclass('public.ngo_org') IS NULL THEN
    ALTER TABLE ngo_orgs RENAME TO ngo_org;
  END IF;

  IF to_regclass('public.emergency_contacts') IS NOT NULL AND to_regclass('public.emergency_contact') IS NULL THEN
    ALTER TABLE emergency_contacts RENAME TO emergency_contact;
  END IF;

  IF to_regclass('public.reports') IS NOT NULL AND to_regclass('public.report') IS NULL THEN
    ALTER TABLE reports RENAME TO report;
  END IF;

  IF to_regclass('public.evidences') IS NOT NULL AND to_regclass('public.evidence') IS NULL THEN
    ALTER TABLE evidences RENAME TO evidence;
  END IF;

  IF to_regclass('public.ai_analyses') IS NOT NULL AND to_regclass('public.ai_analysis') IS NULL THEN
    ALTER TABLE ai_analyses RENAME TO ai_analysis;
  END IF;

  -- "case" is a reserved word in PostgreSQL
  IF to_regclass('public.cases') IS NOT NULL AND to_regclass('public.case') IS NULL THEN
    ALTER TABLE cases RENAME TO "case";
  END IF;

  IF to_regclass('public.alerts') IS NOT NULL AND to_regclass('public.alert') IS NULL THEN
    ALTER TABLE alerts RENAME TO alert;
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL AND to_regclass('public.notification') IS NULL THEN
    ALTER TABLE notifications RENAME TO notification;
  END IF;

  IF to_regclass('public.auth_sessions') IS NOT NULL AND to_regclass('public.auth_session') IS NULL THEN
    ALTER TABLE auth_sessions RENAME TO auth_session;
  END IF;

  IF to_regclass('public.audit_logs') IS NOT NULL AND to_regclass('public.audit_log') IS NULL THEN
    ALTER TABLE audit_logs RENAME TO audit_log;
  END IF;

  IF to_regclass('public.live_locations') IS NOT NULL AND to_regclass('public.live_location') IS NULL THEN
    ALTER TABLE live_locations RENAME TO live_location;
  END IF;

  IF to_regclass('public.tracking_sessions') IS NOT NULL AND to_regclass('public.tracking_session') IS NULL THEN
    ALTER TABLE tracking_sessions RENAME TO tracking_session;
  END IF;
END $$;

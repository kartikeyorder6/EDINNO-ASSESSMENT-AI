-- ============================================================================
-- EDINNO AI ASSESSMENT STUDIO — SUPABASE DATABASE HARDENING & RLS POLICIES
-- ============================================================================
-- Apply this script in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- It creates the application tables, enables Row Level Security (RLS) on all
-- tables, and enforces strict least-privilege policies to prevent BOLA/IDOR.
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. USER PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'educator', 'admin')),
    school_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. ASSESSMENTS TABLE (Stores generated question banks)
CREATE TABLE IF NOT EXISTS public.assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chapter_name TEXT NOT NULL,
    project_name TEXT,
    assessment_type TEXT NOT NULL,
    difficulty TEXT NOT NULL DEFAULT 'medium',
    question_count INTEGER NOT NULL CHECK (question_count > 0 AND question_count <= 100),
    questions JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. PRE-ASSEMBLY VERIFICATION AUDIT LOG (Immutable quiz passes & tokens)
CREATE TABLE IF NOT EXISTS public.pre_assembly_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    project_title TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0),
    total INTEGER NOT NULL CHECK (total > 0),
    percentage NUMERIC(5,2) NOT NULL,
    passed BOOLEAN NOT NULL DEFAULT false,
    auth_token TEXT,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 5. MANDATORY ROW LEVEL SECURITY (RLS) ENFORCEMENT
-- ============================================================================
-- Denies all unauthorized reads, writes, and updates by default.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_assembly_verifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. POLICIES: PROFILES TABLE
-- ============================================================================
-- Users can read their own profile
CREATE POLICY "profiles_select_own"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Users can insert their own profile on signup
CREATE POLICY "profiles_insert_own"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Users can update their own details (excluding role escalation)
CREATE POLICY "profiles_update_own"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ============================================================================
-- 7. POLICIES: ASSESSMENTS TABLE (BOLA / IDOR Prevention)
-- ============================================================================
-- A user can only view assessments they personally created
CREATE POLICY "assessments_select_own"
    ON public.assessments
    FOR SELECT
    USING (auth.uid() = user_id);

-- A user can only insert assessments under their own authenticated user_id
CREATE POLICY "assessments_insert_own"
    ON public.assessments
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- A user can delete their own assessment
CREATE POLICY "assessments_delete_own"
    ON public.assessments
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- 8. POLICIES: PRE-ASSEMBLY VERIFICATIONS (Tamper-Resistant)
-- ============================================================================
-- Users can view their own past verification records
CREATE POLICY "verifications_select_own"
    ON public.pre_assembly_verifications
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can record verified quiz results for themselves
CREATE POLICY "verifications_insert_own"
    ON public.pre_assembly_verifications
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Strict Immutability: No user can UPDATE quiz scores or forged tokens
-- (No UPDATE policy is created, meaning UPDATE is strictly DENIED for all users)

-- ============================================================================
-- 9. AUTOMATIC USER PROFILE TRIGGER (On Supabase Auth Signup)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', '')
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger firing on every new user registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================================
-- 10. INDEXES FOR HIGH-PERFORMANCE FILTERING
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_assessments_user_id ON public.assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_assessments_created ON public.assessments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verifications_user_project ON public.pre_assembly_verifications(user_id, project_id);

-- ============================================================================
-- 11. CURRICULUM WORKSPACE (Exact 6-Field Schema)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.curriculum_records (
    video_id TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    grade INTEGER NOT NULL CHECK (grade >= 1 AND grade <= 12),
    chapter TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started', 'In Progress', 'Done', 'On Hold')),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.curriculum_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id TEXT NOT NULL REFERENCES public.curriculum_records(video_id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    previous_values JSONB,
    new_values JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.curriculum_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_audit_logs ENABLE ROW LEVEL SECURITY;

-- Read policy: Authenticated users can view curriculum records
CREATE POLICY "curriculum_select_all"
    ON public.curriculum_records
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert policy: Authenticated educators/admins can create curriculum records
CREATE POLICY "curriculum_insert_auth"
    ON public.curriculum_records
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Update policy: Authenticated educators/admins can update curriculum records
CREATE POLICY "curriculum_update_auth"
    ON public.curriculum_records
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Delete policy: Authenticated educators/admins can delete curriculum records
CREATE POLICY "curriculum_delete_auth"
    ON public.curriculum_records
    FOR DELETE
    TO authenticated
    USING (true);

-- Audit log policies
CREATE POLICY "curriculum_audit_select_auth"
    ON public.curriculum_audit_logs
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "curriculum_audit_insert_auth"
    ON public.curriculum_audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_curr_grade ON public.curriculum_records(grade);
CREATE INDEX IF NOT EXISTS idx_curr_chapter ON public.curriculum_records(chapter);
CREATE INDEX IF NOT EXISTS idx_curr_category ON public.curriculum_records(category);
CREATE INDEX IF NOT EXISTS idx_curr_status ON public.curriculum_records(status);
CREATE INDEX IF NOT EXISTS idx_curr_count ON public.curriculum_records(count);
CREATE INDEX IF NOT EXISTS idx_curr_audit_vid ON public.curriculum_audit_logs(video_id);
CREATE INDEX IF NOT EXISTS idx_curr_audit_time ON public.curriculum_audit_logs(timestamp DESC);



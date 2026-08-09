-- Reset database tables for a clean start
DROP TABLE IF EXISTS public.workflow_outputs CASCADE;
DROP TABLE IF EXISTS public.step_runs CASCADE;
DROP TABLE IF EXISTS public.workflow_runs CASCADE;
DROP TABLE IF EXISTS public.workflow_triggers CASCADE;
DROP TABLE IF EXISTS public.workflow_steps CASCADE;
DROP TABLE IF EXISTS public.workflows CASCADE;
DROP TABLE IF EXISTS public.org_members CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;
DROP TABLE IF EXISTS auth.users CASCADE;

-- Create auth schema if not exists
CREATE SCHEMA IF NOT EXISTS auth;

-- Create auth.users table (mocking Nhost Auth users)
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- public.organizations
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    allowed_quota INT NOT NULL DEFAULT 100,
    calls_used INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- public.org_members
CREATE TABLE IF NOT EXISTS public.org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, org_id)
);

-- public.workflows
CREATE TABLE IF NOT EXISTS public.workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- public.workflow_steps
CREATE TABLE IF NOT EXISTS public.workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate')),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    position INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- public.workflow_triggers
CREATE TABLE IF NOT EXISTS public.workflow_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('manual', 'webhook', 'scheduled', 'db_event')),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- public.workflow_runs
CREATE TABLE IF NOT EXISTS public.workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'completed', 'failed')),
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    trigger_type TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- public.step_runs
CREATE TABLE IF NOT EXISTS public.step_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
    step_id UUID NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    output JSONB NOT NULL DEFAULT '{}'::jsonb,
    error TEXT,
    attempt_count INT NOT NULL DEFAULT 1,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- public.workflow_outputs
CREATE TABLE IF NOT EXISTS public.workflow_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
    step_id UUID NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for ordering step runs
CREATE INDEX IF NOT EXISTS idx_step_runs_workflow_run_id ON public.step_runs(workflow_run_id);

-- Insert initial seed data
-- 1. Create Mock Users
INSERT INTO auth.users (id, email, display_name) VALUES
('11111111-1111-1111-1111-111111111111', 'owner_a@example.com', 'Owner Org A') ON CONFLICT DO NOTHING;
INSERT INTO auth.users (id, email, display_name) VALUES
('22222222-2222-2222-2222-222222222222', 'editor_a@example.com', 'Editor Org A') ON CONFLICT DO NOTHING;
INSERT INTO auth.users (id, email, display_name) VALUES
('33333333-3333-3333-3333-333333333333', 'viewer_a@example.com', 'Viewer Org A') ON CONFLICT DO NOTHING;
INSERT INTO auth.users (id, email, display_name) VALUES
('44444444-4444-4444-4444-444444444444', 'owner_b@example.com', 'Owner Org B') ON CONFLICT DO NOTHING;
INSERT INTO auth.users (id, email, display_name) VALUES
('55555555-5555-5555-5555-555555555555', 'editor_b@example.com', 'Editor Org B') ON CONFLICT DO NOTHING;

-- 2. Create Organizations
INSERT INTO public.organizations (id, name, allowed_quota, calls_used) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Organization A', 15, 0) ON CONFLICT DO NOTHING;
INSERT INTO public.organizations (id, name, allowed_quota, calls_used) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Organization B', 10, 0) ON CONFLICT DO NOTHING;

-- 3. Associate Users with Organizations
INSERT INTO public.org_members (user_id, org_id, role) VALUES
('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner') ON CONFLICT DO NOTHING;
INSERT INTO public.org_members (user_id, org_id, role) VALUES
('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'editor') ON CONFLICT DO NOTHING;
INSERT INTO public.org_members (user_id, org_id, role) VALUES
('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'viewer') ON CONFLICT DO NOTHING;
INSERT INTO public.org_members (user_id, org_id, role) VALUES
('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner') ON CONFLICT DO NOTHING;
INSERT INTO public.org_members (user_id, org_id, role) VALUES
('55555555-5555-5555-5555-555555555555', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'editor') ON CONFLICT DO NOTHING;

-- 4. Pre-seed a default workflow for Organization A
INSERT INTO public.workflows (id, name, org_id) VALUES
('4b36e5bc-523c-40a6-9b5e-415b7f752f55', 'AI Content Moderation Pipeline', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ON CONFLICT DO NOTHING;

-- 5. Pre-seed workflow steps
INSERT INTO public.workflow_steps (id, workflow_id, name, type, config, position) VALUES
('599808f2-f98f-47de-ba81-efd515b28031', '4b36e5bc-523c-40a6-9b5e-415b7f752f55', 'Gemini Spam Analysis', 'llm_call', '{"prompt": "Determine if this review is spam or valid: ''{{input}}''"}'::jsonb, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.workflow_steps (id, workflow_id, name, type, config, position) VALUES
('05d4510d-b4ca-490b-9ba8-1f439c345585', '4b36e5bc-523c-40a6-9b5e-415b7f752f55', 'Spam Check Filter', 'conditional_branch', '{"condition": "APPROVED"}'::jsonb, 2) ON CONFLICT DO NOTHING;
INSERT INTO public.workflow_steps (id, workflow_id, name, type, config, position) VALUES
('856b50b7-47d7-4c7e-9a7b-46a4011c03da', '4b36e5bc-523c-40a6-9b5e-415b7f752f55', 'Human-in-the-Loop Escrow', 'approval_gate', '{"roleRequired": "editor"}'::jsonb, 3) ON CONFLICT DO NOTHING;
INSERT INTO public.workflow_steps (id, workflow_id, name, type, config, position) VALUES
('72b180fa-b3e5-4c95-b38b-e7f71bdd51c6', '4b36e5bc-523c-40a6-9b5e-415b7f752f55', 'Insert Approved Record', 'db_write', '{"message": "Stored safe review content"}'::jsonb, 4) ON CONFLICT DO NOTHING;

-- 6. Pre-seed workflow triggers
INSERT INTO public.workflow_triggers (workflow_id, type, config) VALUES
('4b36e5bc-523c-40a6-9b5e-415b7f752f55', 'manual', '{}'::jsonb) ON CONFLICT DO NOTHING;

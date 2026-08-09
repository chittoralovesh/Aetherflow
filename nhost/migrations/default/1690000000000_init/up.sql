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

CREATE INDEX IF NOT EXISTS idx_step_runs_workflow_run_id ON public.step_runs(workflow_run_id);

CREATE TABLE IF NOT EXISTS public.workflow_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
    step_id UUID REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
    data JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

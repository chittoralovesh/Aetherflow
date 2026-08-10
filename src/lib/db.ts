import { Pool } from 'pg';
import crypto from 'crypto';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/workflow_builder';

// Detect environment
const isVercel = !!process.env.VERCEL;
const hasCloudDb = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost');

// If we are on Vercel/Production and don't have a cloud database URL configured, run in Mock Mode instantly
// to prevent connection timeout hangs that get serverless functions killed by Vercel.
const useMockMode = (isVercel || process.env.NODE_ENV === 'production') && !hasCloudDb;

let pool: Pool;

if (!useMockMode) {
  try {
    if (process.env.NODE_ENV === 'production') {
      pool = new Pool({
        connectionString,
        ssl: {
          rejectUnauthorized: false
        }
      });
    } else {
      const globalRef = global as unknown as { pool: Pool };
      if (!globalRef.pool) {
        globalRef.pool = new Pool({
          connectionString,
          ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
        });
      }
      pool = globalRef.pool;
    }
  } catch (e) {
    console.warn("Could not initialize PostgreSQL pool, using mock mode:", e);
  }
}

// In-Memory Data Store (Fallback)
const inMemoryStore = {
  users: [
    { id: '11111111-1111-1111-1111-111111111111', email: 'owner_a@example.com', display_name: 'Owner Org A' },
    { id: '22222222-2222-2222-2222-222222222222', email: 'editor_a@example.com', display_name: 'Editor Org A' },
    { id: '33333333-3333-3333-3333-333333333333', email: 'viewer_a@example.com', display_name: 'Viewer Org A' },
    { id: '44444444-4444-4444-4444-444444444444', email: 'owner_b@example.com', display_name: 'Owner Org B' },
    { id: '55555555-5555-5555-5555-555555555555', email: 'editor_b@example.com', display_name: 'Editor Org B' }
  ],
  organizations: [
    { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Organization A', allowed_quota: 15, calls_used: 9 },
    { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Organization B', allowed_quota: 10, calls_used: 0 }
  ],
  org_members: [
    { user_id: '11111111-1111-1111-1111-111111111111', org_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'owner' },
    { user_id: '22222222-2222-2222-2222-222222222222', org_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'editor' },
    { user_id: '33333333-3333-3333-3333-333333333333', org_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'viewer' },
    { user_id: '44444444-4444-4444-4444-444444444444', org_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', role: 'owner' },
    { user_id: '55555555-5555-5555-5555-555555555555', org_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', role: 'editor' }
  ],
  workflows: [
    { id: '4b36e5bc-523c-40a6-9b5e-415b7f752f55', name: 'AI Content Moderation Pipeline', org_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }
  ] as any[],
  workflow_steps: [
    { id: '599808f2-f98f-47de-ba81-efd515b28031', workflow_id: '4b36e5bc-523c-40a6-9b5e-415b7f752f55', name: 'Gemini Spam Analysis', type: 'llm_call', config: { prompt: "Determine if this review is spam or valid: '{{input}}'" }, position: 1 },
    { id: '05d4510d-b4ca-490b-9ba8-1f439c345585', workflow_id: '4b36e5bc-523c-40a6-9b5e-415b7f752f55', name: 'Spam Check Filter', type: 'conditional_branch', config: { condition: "APPROVED" }, position: 2 },
    { id: '856b50b7-47d7-4c7e-9a7b-46a4011c03da', workflow_id: '4b36e5bc-523c-40a6-9b5e-415b7f752f55', name: 'Human-in-the-Loop Escrow', type: 'approval_gate', config: { roleRequired: "editor" }, position: 3 },
    { id: '72b180fa-b3e5-4c95-b38b-e7f71bdd51c6', workflow_id: '4b36e5bc-523c-40a6-9b5e-415b7f752f55', name: 'Insert Approved Record', type: 'db_write', config: { message: "Stored safe review content" }, position: 4 }
  ] as any[],
  workflow_triggers: [
    { id: 'trigger-1', workflow_id: '4b36e5bc-523c-40a6-9b5e-415b7f752f55', type: 'manual', config: {} }
  ] as any[],
  workflow_runs: [] as any[],
  step_runs: [] as any[],
  workflow_outputs: [] as any[]
};

export async function query(text: string, params?: any[]) {
  if (useMockMode) {
    return executeInMemoryQuery(text, params || []);
  }

  try {
    const res = await pool.query(text, params);
    return res;
  } catch (err) {
    // Graceful in-memory fallback
    return executeInMemoryQuery(text, params || []);
  }
}

// SQL Parser & Evaluator (In-Memory Fallback)
function executeInMemoryQuery(sql: string, params: any[]): { rows: any[]; rowCount: number } {
  const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  // 1. SELECT public.organizations
  if (normalized.includes('select') && normalized.includes('organizations')) {
    const userId = params[0];
    const orgIds = inMemoryStore.org_members
      .filter(m => m.user_id === userId)
      .map(m => m.org_id);
    const orgs = inMemoryStore.organizations.filter(o => orgIds.includes(o.id));
    return {
      rows: orgs.map(o => {
        const mem = inMemoryStore.org_members.find(m => m.org_id === o.id && m.user_id === userId);
        return { ...o, role: mem?.role };
      }),
      rowCount: orgs.length
    };
  }

  // 2. SELECT public.org_members
  if (normalized.includes('select role from org_members') || normalized.includes('select role from public.org_members')) {
    const userId = params[0];
    const orgId = params[1];
    const member = inMemoryStore.org_members.find(m => m.user_id === userId && m.org_id === orgId);
    return {
      rows: member ? [member] : [],
      rowCount: member ? 1 : 0
    };
  }

  // 3. SELECT public.workflows
  if (normalized.includes('select') && (normalized.includes('from workflows w') || normalized.includes('from public.workflows w'))) {
    const orgId = params[0];
    const wfs = inMemoryStore.workflows.filter(w => w.org_id === orgId);
    return { rows: wfs, rowCount: wfs.length };
  }

  // 4. SELECT public.workflow_steps
  if (normalized.includes('select') && normalized.includes('workflow_steps') && !normalized.includes('left join step_runs')) {
    const wfId = params[0];
    const steps = inMemoryStore.workflow_steps
      .filter(s => s.workflow_id === wfId)
      .sort((a, b) => a.position - b.position);
    return { rows: steps, rowCount: steps.length };
  }

  // 5. SELECT public.workflow_triggers
  if (normalized.includes('select') && normalized.includes('workflow_triggers')) {
    const wfId = params[0];
    const triggers = inMemoryStore.workflow_triggers.filter(t => t.workflow_id === wfId);
    return { rows: triggers, rowCount: triggers.length };
  }

  // 6. SELECT workflow_runs
  if (normalized.includes('select') && normalized.includes('workflow_runs') && normalized.includes('order by started_at desc')) {
    const wfId = params[0];
    const runs = inMemoryStore.workflow_runs
      .filter(r => r.workflow_id === wfId)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      .slice(0, 10);
    return { rows: runs, rowCount: runs.length };
  }

  // 7. SELECT workflow_runs by ID (access check join)
  if (normalized.includes('select r.*') && normalized.includes('workflow_runs r') && normalized.includes('r.id = $1')) {
    const runId = params[0];
    const run = inMemoryStore.workflow_runs.find(r => r.id === runId);
    return { rows: run ? [run] : [], rowCount: run ? 1 : 0 };
  }

  // 8. SELECT step_runs (LEFT JOIN workflow_steps from stream route)
  if (normalized.includes('select') && normalized.includes('workflow_steps ws') && normalized.includes('left join step_runs sr')) {
    const runId = params[0];
    const run = inMemoryStore.workflow_runs.find(r => r.id === runId);
    if (!run) return { rows: [], rowCount: 0 };

    const steps = inMemoryStore.workflow_steps.filter(ws => ws.workflow_id === run.workflow_id);
    const joinedRows = steps.map(ws => {
      const sr = inMemoryStore.step_runs.find(s => s.step_id === ws.id && s.workflow_run_id === runId);
      return {
        step_id: ws.id,
        step_name: ws.name,
        step_type: ws.type,
        position: ws.position,
        id: sr?.id || null,
        status: sr?.status || 'pending',
        input: sr?.input || null,
        output: sr?.output || null,
        error: sr?.error || null,
        attempt_count: sr?.attempt_count || 1,
        approved_by: sr?.approved_by || null,
        approved_at: sr?.approved_at || null
      };
    });
    return { rows: joinedRows, rowCount: joinedRows.length };
  }

  // 9. SELECT workflow_outputs
  if (normalized.includes('select o.*') && normalized.includes('workflow_outputs o')) {
    const wfId = params[0];
    const outputs = inMemoryStore.workflow_outputs
      .filter(o => {
        const run = inMemoryStore.workflow_runs.find(r => r.id === o.run_id);
        return run?.workflow_id === wfId;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
    return { rows: outputs, rowCount: outputs.length };
  }

  // 10. INSERT public.workflows
  if (normalized.includes('insert into workflows') || normalized.includes('insert into public.workflows')) {
    const name = params[0];
    const orgId = params[1];
    const id = crypto.randomUUID();
    const newWf = { id, name, org_id: orgId };
    inMemoryStore.workflows.push(newWf);
    return { rows: [newWf], rowCount: 1 };
  }

  // 11. INSERT public.workflow_steps
  if (normalized.includes('insert into workflow_steps') || normalized.includes('insert into public.workflow_steps')) {
    const workflowId = params[0];
    const name = params[1];
    const type = params[2];
    const config = typeof params[3] === 'string' ? JSON.parse(params[3]) : params[3];
    const position = params[4];
    const id = crypto.randomUUID();
    const newStep = { id, workflow_id: workflowId, name, type, config, position };
    inMemoryStore.workflow_steps.push(newStep);
    return { rows: [newStep], rowCount: 1 };
  }

  // 12. DELETE public.workflow_steps
  if (normalized.includes('delete from workflow_steps') || normalized.includes('delete from public.workflow_steps')) {
    const wfId = params[0];
    inMemoryStore.workflow_steps = inMemoryStore.workflow_steps.filter(s => s.workflow_id !== wfId);
    return { rows: [], rowCount: 0 };
  }

  // 13. INSERT public.workflow_triggers
  if (normalized.includes('insert into workflow_triggers') || normalized.includes('insert into public.workflow_triggers')) {
    const workflowId = params[0];
    const type = params[1];
    const config = typeof params[2] === 'string' ? JSON.parse(params[2]) : params[2];
    const id = crypto.randomUUID();
    const newTrigger = { id, workflow_id: workflowId, type, config };
    inMemoryStore.workflow_triggers.push(newTrigger);
    return { rows: [newTrigger], rowCount: 1 };
  }

  // 14. DELETE public.workflow_triggers
  if (normalized.includes('delete from workflow_triggers') || normalized.includes('delete from public.workflow_triggers')) {
    const wfId = params[0];
    inMemoryStore.workflow_triggers = inMemoryStore.workflow_triggers.filter(t => t.workflow_id !== wfId);
    return { rows: [], rowCount: 0 };
  }

  // 15. INSERT workflow_runs
  if (normalized.includes('insert into workflow_runs')) {
    const workflowId = params[0];
    const status = params[1];
    const triggerType = params[2];
    const createdBy = params[3];
    const id = crypto.randomUUID();
    const newRun = {
      id,
      workflow_id: workflowId,
      status,
      started_at: new Date().toISOString(),
      completed_at: null,
      trigger_type: triggerType,
      created_by: createdBy
    };
    inMemoryStore.workflow_runs.push(newRun);
    return { rows: [newRun], rowCount: 1 };
  }

  // 16. INSERT step_runs
  if (normalized.includes('insert into step_runs')) {
    const runId = params[0];
    const stepId = params[1];
    const status = params[2];
    const input = typeof params[3] === 'string' ? JSON.parse(params[3]) : params[3];
    const id = crypto.randomUUID();
    const newSR = {
      id,
      workflow_run_id: runId,
      step_id: stepId,
      status,
      input,
      output: null,
      error: null,
      attempt_count: 1,
      approved_by: null,
      approved_at: null,
      created_at: new Date().toISOString()
    };
    inMemoryStore.step_runs.push(newSR);
    return { rows: [newSR], rowCount: 1 };
  }

  // 17. UPDATE step_runs outputs (success)
  if (normalized.includes('update step_runs') && normalized.includes('output = $1') && normalized.includes('attempt_count = $2')) {
    const output = typeof params[0] === 'string' ? JSON.parse(params[0]) : params[0];
    const attemptCount = params[1];
    const id = params[2];
    const sr = inMemoryStore.step_runs.find(s => s.id === id);
    if (sr) {
      sr.status = 'completed';
      sr.output = output;
      sr.attempt_count = attemptCount;
    }
    return { rows: [], rowCount: sr ? 1 : 0 };
  }

  // 18. UPDATE step_runs errors (failed)
  if (normalized.includes('update step_runs') && normalized.includes('error = $1') && normalized.includes('attempt_count = $2')) {
    const error = params[0];
    const attemptCount = params[1];
    const id = params[2];
    const sr = inMemoryStore.step_runs.find(s => s.id === id);
    if (sr) {
      sr.status = 'failed';
      sr.error = error;
      sr.attempt_count = attemptCount;
    }
    return { rows: [], rowCount: sr ? 1 : 0 };
  }

  // 19. UPDATE step_runs state (paused/running)
  if (normalized.includes('update step_runs') && normalized.includes('status = $1') && normalized.includes('input = $2')) {
    const status = params[0];
    const input = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
    const id = params[2];
    const sr = inMemoryStore.step_runs.find(s => s.id === id);
    if (sr) {
      sr.status = status;
      sr.input = input;
    }
    return { rows: [], rowCount: sr ? 1 : 0 };
  }

  // 20. UPDATE step_runs approval gate resume
  if (normalized.includes('update step_runs') && normalized.includes('approved_by = $1') && normalized.includes('approved_at = now()')) {
    const approvedBy = params[0];
    const output = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
    const id = params[2];
    const sr = inMemoryStore.step_runs.find(s => s.id === id);
    if (sr) {
      sr.status = 'completed';
      sr.approved_by = approvedBy;
      sr.approved_at = new Date().toISOString();
      sr.output = output;
    }
    return { rows: [], rowCount: sr ? 1 : 0 };
  }

  // 21. UPDATE workflow_runs status
  if (normalized.includes('update workflow_runs') && normalized.includes('status = $1') && !normalized.includes('completed_at')) {
    const status = params[0];
    const id = params[1];
    const run = inMemoryStore.workflow_runs.find(r => r.id === id);
    if (run) {
      run.status = status;
    }
    return { rows: [], rowCount: run ? 1 : 0 };
  }

  // 22. UPDATE workflow_runs complete
  if (normalized.includes('update workflow_runs') && normalized.includes('status = $1') && normalized.includes('completed_at = now()')) {
    const status = params[0];
    const id = params[1];
    const run = inMemoryStore.workflow_runs.find(r => r.id === id);
    if (run) {
      run.status = status;
      run.completed_at = new Date().toISOString();
    }
    return { rows: [], rowCount: run ? 1 : 0 };
  }

  // 23. INSERT workflow_outputs
  if (normalized.includes('insert into workflow_outputs') || normalized.includes('insert into public.workflow_outputs')) {
    const runId = params[0];
    const stepId = params[1];
    const data = typeof params[2] === 'string' ? JSON.parse(params[2]) : params[2];
    const id = crypto.randomUUID();
    const newOutput = {
      id,
      run_id: runId,
      step_id: stepId,
      data,
      created_at: new Date().toISOString()
    };
    inMemoryStore.workflow_outputs.push(newOutput);
    return { rows: [newOutput], rowCount: 1 };
  }

  // 24. UPDATE organizations calls_used
  if (normalized.includes('update organizations') && normalized.includes('calls_used = calls_used + 1')) {
    const id = params[0];
    const org = inMemoryStore.organizations.find(o => o.id === id);
    if (org) {
      org.calls_used = org.calls_used + 1;
    }
    return { rows: [], rowCount: org ? 1 : 0 };
  }

  // 25. Default fallback
  return { rows: [], rowCount: 0 };
}

export default pool;

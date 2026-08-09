import { NextResponse } from 'next/server';
import { graphql, buildSchema } from 'graphql';
import { query } from '../../../lib/db';
import { executeWorkflowRun } from '../../../lib/engine';

// Define the schema
const schema = buildSchema(`
  type Organization {
    id: String!
    name: String!
    allowed_quota: Int!
    calls_used: Int!
    role: String
  }

  type Workflow {
    id: String!
    name: String!
    org_id: String!
    steps: [WorkflowStep!]!
    triggers: [WorkflowTrigger!]!
    recent_run_status: String
  }

  type WorkflowStep {
    id: String!
    name: String!
    type: String!
    config: String!
    position: Int!
  }

  type WorkflowTrigger {
    id: String!
    type: String!
    config: String!
  }

  type WorkflowRun {
    id: String!
    workflow_id: String!
    status: String!
    started_at: String!
    completed_at: String
    trigger_type: String!
  }

  input StepInput {
    id: String
    name: String!
    type: String!
    config: String!
    position: Int!
  }

  input TriggerInput {
    id: String
    type: String!
    config: String!
  }

  type WorkflowOutput {
    id: String!
    run_id: String!
    step_id: String!
    data: String!
    created_at: String!
  }

  type Query {
    organizations(userId: String!): [Organization!]!
    workflows(orgId: String!, userId: String!): [Workflow!]!
    workflowRun(runId: String!, userId: String!): WorkflowRun
    workflowRuns(workflowId: String!, userId: String!): [WorkflowRun!]!
    workflowOutputs(workflowId: String!, userId: String!): [WorkflowOutput!]!
  }

  type Mutation {
    saveWorkflow(
      id: String
      name: String!
      orgId: String!
      steps: [StepInput!]!
      triggers: [TriggerInput!]!
      userId: String!
    ): Workflow!
    triggerWorkflow(workflowId: String!, userId: String!): WorkflowRun!
    approveStepRun(stepRunId: String!, userId: String!): WorkflowRun!
  }
`);

// Helper to get user's role in an organization
async function getUserRole(userId: string, orgId: string): Promise<string | null> {
  const result = await query(
    'SELECT role FROM org_members WHERE user_id = $1 AND org_id = $2',
    [userId, orgId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].role;
}

// Helper to check workflow ownership/access
async function checkWorkflowAccess(userId: string, workflowId: string): Promise<{ orgId: string; role: string } | null> {
  const result = await query(
    `SELECT w.org_id, m.role FROM workflows w
     JOIN org_members m ON w.org_id = m.org_id
     WHERE w.id = $1 AND m.user_id = $2`,
    [workflowId, userId]
  );
  if (result.rows.length === 0) return null;
  return { orgId: result.rows[0].org_id, role: result.rows[0].role };
}

// Define the root resolvers
const rootValue = {
  // Query: organizations
  organizations: async ({ userId }: { userId: string }) => {
    const result = await query(
      `SELECT o.*, m.role FROM organizations o
       JOIN org_members m ON o.id = m.org_id
       WHERE m.user_id = $1`,
      [userId]
    );
    return result.rows;
  },

  // Query: workflows
  workflows: async ({ orgId, userId }: { orgId: string; userId: string }) => {
    // Layer 1 validation: Caller must belong to the organization
    const role = await getUserRole(userId, orgId);
    if (!role) {
      throw new Error('Access denied: You do not belong to this organization.');
    }

    const result = await query(
      `SELECT w.*, 
       (SELECT status FROM workflow_runs WHERE workflow_id = w.id ORDER BY started_at DESC LIMIT 1) as recent_run_status
       FROM workflows w
       WHERE w.org_id = $1
       ORDER BY w.created_at DESC`,
      [orgId]
    );

    const workflows = [];
    for (const row of result.rows) {
      const steps = await query(
        'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY position ASC',
        [row.id]
      );
      const triggers = await query(
        'SELECT * FROM workflow_triggers WHERE workflow_id = $1',
        [row.id]
      );
      workflows.push({
        ...row,
        steps: steps.rows.map(s => ({ ...s, config: JSON.stringify(s.config) })),
        triggers: triggers.rows.map(t => ({ ...t, config: JSON.stringify(t.config) }))
      });
    }
    return workflows;
  },

  // Query: workflowRun
  workflowRun: async ({ runId, userId }: { runId: string; userId: string }) => {
    // Cross-org isolation validation: Check if user belongs to the org that owns this run
    const result = await query(
      `SELECT r.*, w.org_id FROM workflow_runs r
       JOIN workflows w ON r.workflow_id = w.id
       JOIN org_members m ON w.org_id = m.org_id
       WHERE r.id = $1 AND m.user_id = $2`,
      [runId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Access denied: Run not found or access restricted.');
    }

    return result.rows[0];
  },
  // Query: workflowRuns
  workflowRuns: async ({ workflowId, userId }: { workflowId: string; userId: string }) => {
    const access = await checkWorkflowAccess(userId, workflowId);
    if (!access) {
      throw new Error('Access denied: Workflow not found or access restricted.');
    }
    const result = await query(
      'SELECT * FROM workflow_runs WHERE workflow_id = $1 ORDER BY started_at DESC LIMIT 10',
      [workflowId]
    );
    return result.rows;
  },
  // Query: workflowOutputs
  workflowOutputs: async ({ workflowId, userId }: { workflowId: string; userId: string }) => {
    const access = await checkWorkflowAccess(userId, workflowId);
    if (!access) {
      throw new Error('Access denied: Workflow not found or access restricted.');
    }
    const result = await query(
      `SELECT o.* FROM workflow_outputs o
       JOIN workflow_runs r ON o.run_id = r.id
       WHERE r.workflow_id = $1
       ORDER BY o.created_at DESC
       LIMIT 10`,
      [workflowId]
    );
    return result.rows.map(o => ({ ...o, data: JSON.stringify(o.data) }));
  },
  // Mutation: saveWorkflow
  saveWorkflow: async ({ id, name, orgId, steps, triggers, userId }: any) => {
    // Layer 1 validation: user role in organization
    const role = await getUserRole(userId, orgId);
    if (!role) {
      throw new Error('Access denied: You do not belong to this organization.');
    }

    if (role === 'viewer') {
      throw new Error('Access denied: Viewers cannot create or edit workflows.');
    }

    // Layer 2 validation: step-level gating
    // "only an owner can add a db_write, a webhook trigger, or a notify step"
    const hasSensitiveStep = steps.some((s: any) => s.type === 'db_write' || s.type === 'notify');
    const hasSensitiveTrigger = triggers.some((t: any) => t.type === 'webhook' || t.type === 'db_event');

    if ((hasSensitiveStep || hasSensitiveTrigger) && role !== 'owner') {
      throw new Error('Access denied: Only an owner can create/edit db_write steps, notify steps, webhook triggers, or database event triggers.');
    }

    // Save workflow
    let workflowId = id;
    if (workflowId) {
      await query(
        'UPDATE workflows SET name = $1, updated_at = now() WHERE id = $2 AND org_id = $3',
        [name, workflowId, orgId]
      );
    } else {
      const insertW = await query(
        'INSERT INTO workflows (name, org_id) VALUES ($1, $2) RETURNING id',
        [name, orgId]
      );
      workflowId = insertW.rows[0].id;
    }

    // Replace steps and triggers in a transaction-like sequence (delete then insert)
    await query('DELETE FROM workflow_steps WHERE workflow_id = $1', [workflowId]);
    for (const step of steps) {
      const configObj = JSON.parse(step.config || '{}');
      await query(
        'INSERT INTO workflow_steps (workflow_id, name, type, config, position) VALUES ($1, $2, $3, $4, $5)',
        [workflowId, step.name, step.type, configObj, step.position]
      );
    }

    await query('DELETE FROM workflow_triggers WHERE workflow_id = $1', [workflowId]);
    for (const trigger of triggers) {
      const configObj = JSON.parse(trigger.config || '{}');
      await query(
        'INSERT INTO workflow_triggers (workflow_id, type, config) VALUES ($1, $2, $3)',
        [workflowId, trigger.type, configObj]
      );
    }

    // Fetch and return the updated workflow
    const dbSteps = await query(
      'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY position ASC',
      [workflowId]
    );
    const dbTriggers = await query(
      'SELECT * FROM workflow_triggers WHERE workflow_id = $1',
      [workflowId]
    );

    return {
      id: workflowId,
      name,
      org_id: orgId,
      steps: dbSteps.rows.map(s => ({ ...s, config: JSON.stringify(s.config) })),
      triggers: dbTriggers.rows.map(t => ({ ...t, config: JSON.stringify(t.config) }))
    };
  },

  // Mutation: triggerWorkflow (Action: triggerWorkflowRun)
  triggerWorkflow: async ({ workflowId, userId }: { workflowId: string; userId: string }) => {
    // 1. Verify access
    const access = await checkWorkflowAccess(userId, workflowId);
    if (!access) {
      throw new Error('Access denied: Workflow not found or access restricted.');
    }

    if (access.role === 'viewer') {
      throw new Error('Access denied: Viewers cannot trigger workflow runs.');
    }

    // 2. Check Quota
    const orgResult = await query(
      'SELECT allowed_quota, calls_used FROM organizations WHERE id = $1',
      [access.orgId]
    );
    const org = orgResult.rows[0];
    if (org.calls_used >= org.allowed_quota) {
      throw new Error('Usage quota exceeded for this period. Please upgrade.');
    }

    // 3. Create run entry
    const runResult = await query(
      `INSERT INTO workflow_runs (workflow_id, status, trigger_type, created_by)
       VALUES ($1, 'running', 'manual', $2)
       RETURNING id, workflow_id, status, started_at, completed_at, trigger_type`,
      [workflowId, userId]
    );
    const run = runResult.rows[0];

    // 4. Run asynchronously to start executing steps
    // In Next.js, we trigger step execution but do not block the HTTP thread
    setTimeout(async () => {
      try {
        await executeWorkflowRun(run.id, userId);
      } catch (e) {
        console.error('Async workflow run execution failed:', e);
      }
    }, 10);

    return run;
  },

  // Mutation: approveStepRun (Action: approveStep)
  approveStepRun: async ({ stepRunId, userId }: { stepRunId: string; userId: string }) => {
    // 1. Find the step run, the corresponding run, and the organization
    const stepRunResult = await query(
      `SELECT sr.*, wr.workflow_id, w.org_id, ws.type
       FROM step_runs sr
       JOIN workflow_runs wr ON sr.workflow_run_id = wr.id
       JOIN workflows w ON wr.workflow_id = w.id
       JOIN workflow_steps ws ON sr.step_id = ws.id
       WHERE sr.id = $1`,
      [stepRunId]
    );

    if (stepRunResult.rows.length === 0) {
      throw new Error('Step run not found.');
    }

    const stepRun = stepRunResult.rows[0];

    // 2. Check if the step run is actually pending approval
    if (stepRun.status !== 'paused' || stepRun.type !== 'approval_gate') {
      throw new Error('Step run is not currently paused in an approval gate.');
    }

    // 3. Layer 2 Check: Approver role must be Owner or Editor in the organization
    const role = await getUserRole(userId, stepRun.org_id);
    if (!role || (role !== 'owner' && role !== 'editor')) {
      throw new Error('Access denied: Only an owner or editor can approve and resume runs.');
    }

    // 4. Mark step run as approved and completed
    await query(
      `UPDATE step_runs 
       SET status = 'completed', approved_by = $1, approved_at = now(), output = $2
       WHERE id = $3`,
      [userId, JSON.stringify({ approved: true, approved_by: userId }), stepRunId]
    );

    // 5. Update workflow run to running
    await query(
      "UPDATE workflow_runs SET status = 'running' WHERE id = $1",
      [stepRun.workflow_run_id]
    );

    // 6. Resume execution from the next step
    setTimeout(async () => {
      try {
        await executeWorkflowRun(stepRun.workflow_run_id, userId, stepRun.id);
      } catch (e) {
        console.error('Async workflow resume execution failed:', e);
      }
    }, 10);

    // Return the updated run
    const runResult = await query(
      'SELECT * FROM workflow_runs WHERE id = $1',
      [stepRun.workflow_run_id]
    );
    return runResult.rows[0];
  }
};

export async function POST(req: Request) {
  try {
    const { query: queryText, variables } = await req.json();

    const response = await graphql({
      schema,
      source: queryText,
      rootValue,
      variableValues: variables
    });

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { errors: [{ message: error.message || 'Internal server error' }] },
      { status: 500 }
    );
  }
}

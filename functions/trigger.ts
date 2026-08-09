import { query } from './_shared/db';
import { executeWorkflowRun } from './_shared/engine';

export default async function handler(req: any, res: any) {
  try {
    // 1. Extract inputs
    const workflowId = req.body?.input?.workflow_id || req.body?.workflowId;
    const sessionVars = req.body?.session_variables || {};
    const userId = sessionVars['x-hasura-user-id'] || req.body?.userId || '11111111-1111-1111-1111-111111111111';

    if (!workflowId) {
      return res.status(400).json({ message: 'Missing workflow_id input parameter' });
    }

    // 2. Security validation: Verify caller's role in the organization
    const accessRes = await query(
      `SELECT w.org_id, m.role, o.allowed_quota, o.calls_used
       FROM workflows w
       JOIN org_members m ON w.org_id = m.org_id
       JOIN organizations o ON w.org_id = o.id
       WHERE w.id = $1 AND m.user_id = $2`,
      [workflowId, userId]
    );

    if (accessRes.rows.length === 0) {
      return res.status(403).json({ message: 'Access denied: Workflow not found or user not authorized' });
    }

    const { role, allowed_quota, calls_used } = accessRes.rows[0];
    if (role === 'viewer') {
      return res.status(403).json({ message: 'Access denied: Viewers cannot trigger workflow runs' });
    }

    // 3. Quota check
    if (calls_used >= allowed_quota) {
      return res.status(400).json({ message: 'Quota exceeded: Calls used meets or exceeds allowed limit' });
    }

    // 4. Create workflow run record
    const runRes = await query(
      `INSERT INTO workflow_runs (workflow_id, status, trigger_type, created_by)
       VALUES ($1, 'running', 'webhook', $2)
       RETURNING id, status`,
      [workflowId, userId]
    );
    const run = runRes.rows[0];

    // 5. Execute steps asynchronously so we return a fast response to Hasura
    setTimeout(async () => {
      try {
        await executeWorkflowRun(run.id, userId);
      } catch (err) {
        console.error('Async steps execution in Nhost Function failed:', err);
      }
    }, 10);

    // 6. Return response matching Hasura's TriggerWorkflowOutput
    return res.status(200).json({
      runId: run.id,
      status: run.status
    });
  } catch (error: any) {
    console.error('Nhost Function trigger error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
}

import { query } from './_shared/db';
import { executeWorkflowRun } from './_shared/engine';

export default async function handler(req: any, res: any) {
  try {
    // 1. Extract inputs
    const stepRunId = req.body?.input?.step_run_id || req.body?.stepRunId;
    const sessionVars = req.body?.session_variables || {};
    const userId = sessionVars['x-hasura-user-id'] || req.body?.userId || '11111111-1111-1111-1111-111111111111';

    if (!stepRunId) {
      return res.status(400).json({ message: 'Missing step_run_id input parameter' });
    }

    // 2. Fetch the step run details
    const stepRunRes = await query(
      `SELECT sr.*, wr.workflow_id, w.org_id, ws.type
       FROM step_runs sr
       JOIN workflow_runs wr ON sr.workflow_run_id = wr.id
       JOIN workflows w ON wr.workflow_id = w.id
       JOIN workflow_steps ws ON sr.step_id = ws.id
       WHERE sr.id = $1`,
      [stepRunId]
    );

    if (stepRunRes.rows.length === 0) {
      return res.status(404).json({ message: 'Step run not found' });
    }

    const stepRun = stepRunRes.rows[0];

    // Check if the step run is actually paused in an approval gate
    if (stepRun.status !== 'paused' || stepRun.type !== 'approval_gate') {
      return res.status(400).json({ message: 'Step run is not currently paused in an approval gate' });
    }

    // 3. Security validation: Verify approver's role (must be owner or editor)
    const accessRes = await query(
      'SELECT role FROM org_members WHERE user_id = $1 AND org_id = $2',
      [userId, stepRun.org_id]
    );

    if (accessRes.rows.length === 0) {
      return res.status(403).json({ message: 'Access denied: You do not belong to this organization' });
    }

    const role = accessRes.rows[0].role;
    if (role !== 'owner' && role !== 'editor') {
      return res.status(403).json({ message: 'Access denied: Only owners or editors can approve and resume runs' });
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

    // 6. Resume execution from the next step asynchronously
    setTimeout(async () => {
      try {
        await executeWorkflowRun(stepRun.workflow_run_id, userId, stepRun.id);
      } catch (err) {
        console.error('Async steps execution during resume failed:', err);
      }
    }, 10);

    // 7. Return success response matching Hasura's ApproveStepOutput
    return res.status(200).json({
      status: 'resumed'
    });
  } catch (error: any) {
    console.error('Nhost Function approve error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
}

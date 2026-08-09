import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import { executeWorkflowRun } from '../../../lib/engine';

export async function GET(req: Request) {
  try {
    // In a real Nhost project, this endpoint would be called by Nhost Cron
    // Here we query all workflows with a 'scheduled' trigger config
    const scheduledTriggers = await query(
      `SELECT t.*, w.org_id, o.allowed_quota, o.calls_used, 
       (SELECT id FROM org_members WHERE org_id = w.org_id AND role = 'owner' LIMIT 1) as owner_id
       FROM workflow_triggers t
       JOIN workflows w ON t.workflow_id = w.id
       JOIN organizations o ON w.org_id = o.id
       WHERE t.type = 'scheduled'`
    );

    const triggeredRuns = [];

    for (const trigger of scheduledTriggers.rows) {
      // 1. Quota check
      if (trigger.calls_used >= trigger.allowed_quota) {
        console.warn(`Cron execution skipped for workflow ${trigger.workflow_id}: Quota exceeded.`);
        continue;
      }

      // Use the organization owner's user ID as the trigger executor
      const userId = trigger.owner_id || '11111111-1111-1111-1111-111111111111';

      // 2. Create workflow run
      const runResult = await query(
        `INSERT INTO workflow_runs (workflow_id, status, trigger_type, created_by)
         VALUES ($1, 'running', 'scheduled', $2)
         RETURNING id, status, started_at`,
        [trigger.workflow_id, userId]
      );
      const run = runResult.rows[0];

      // 3. Execute
      await executeWorkflowRun(run.id, userId);

      triggeredRuns.push({
        workflowId: trigger.workflow_id,
        runId: run.id,
        status: 'triggered'
      });
    }

    return NextResponse.json({
      message: 'Scheduled cron execution run completed',
      jobsRunCount: triggeredRuns.length,
      runs: triggeredRuns
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

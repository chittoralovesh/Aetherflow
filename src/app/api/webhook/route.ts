import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import { executeWorkflowRun } from '../../../lib/engine';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { workflowId, userId } = body;

    if (!workflowId || !userId) {
      return NextResponse.json(
        { error: 'Missing required parameters: workflowId and userId' },
        { status: 400 }
      );
    }

    // 1. Verify caller has permissions (owner/editor) in workflow's org
    const result = await query(
      `SELECT w.org_id, m.role, o.allowed_quota, o.calls_used 
       FROM workflows w
       JOIN org_members m ON w.org_id = m.org_id
       JOIN organizations o ON w.org_id = o.id
       WHERE w.id = $1 AND m.user_id = $2`,
      [workflowId, userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Access denied: Workflow not found or user is not a member of the organization.' },
        { status: 403 }
      );
    }

    const { org_id, role, allowed_quota, calls_used } = result.rows[0];

    if (role === 'viewer') {
      return NextResponse.json(
        { error: 'Access denied: Viewers cannot trigger workflow runs.' },
        { status: 403 }
      );
    }

    // 2. Check Quota
    if (calls_used >= allowed_quota) {
      return NextResponse.json(
        { error: 'Usage quota exceeded for this organization.' },
        { status: 429 }
      );
    }

    // 3. Create run
    const runResult = await query(
      `INSERT INTO workflow_runs (workflow_id, status, trigger_type, created_by)
       VALUES ($1, 'running', 'webhook', $2)
       RETURNING id, status, started_at`,
      [workflowId, userId]
    );
    const run = runResult.rows[0];

    // 4. Execute asynchronously
    setTimeout(async () => {
      try {
        await executeWorkflowRun(run.id, userId);
      } catch (e) {
        console.error('Async workflow execution via Webhook failed:', e);
      }
    }, 10);

    return NextResponse.json({
      message: 'Workflow run triggered successfully via Webhook',
      runId: run.id,
      status: run.status,
      startedAt: run.started_at
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

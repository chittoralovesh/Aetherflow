import { NextRequest } from 'next/server';
import { query } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const runId = params.id;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  });

  if (!userId) {
    return new Response('Unauthorized: Missing userId parameter', { status: 401 });
  }

  // 1. Verify access (Layer 1 security / cross-org isolation check)
  const accessResult = await query(
    `SELECT wr.id, w.org_id, m.role FROM workflow_runs wr
     JOIN workflows w ON wr.workflow_id = w.id
     JOIN org_members m ON w.org_id = m.org_id
     WHERE wr.id = $1 AND m.user_id = $2`,
    [runId, userId]
  );

  if (accessResult.rows.length === 0) {
    return new Response('Forbidden: Access denied to this workflow run', { status: 403 });
  }

  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      let lastSerializedState = '';

      const sendUpdate = async () => {
        if (isClosed) return true;

        try {
          // Fetch workflow run status
          const runRes = await query(
            'SELECT status, started_at, completed_at FROM workflow_runs WHERE id = $1',
            [runId]
          );
          if (runRes.rows.length === 0) return true;
          const run = runRes.rows[0];

          // Fetch all workflow steps left-joined with their step run execution statuses
          const stepsRes = await query(
            `SELECT 
               ws.id as step_id,
               ws.name as step_name,
               ws.type as step_type,
               ws.position,
               sr.id as id,
               COALESCE(sr.status, 'pending') as status,
               sr.input,
               sr.output,
               sr.error,
               COALESCE(sr.attempt_count, 1) as attempt_count,
               sr.approved_by,
               sr.approved_at
             FROM workflow_steps ws
             LEFT JOIN step_runs sr ON ws.id = sr.step_id AND sr.workflow_run_id = $1
             WHERE ws.workflow_id = (SELECT workflow_id FROM workflow_runs WHERE id = $1)
             ORDER BY ws.position ASC`,
            [runId]
          );
          
          const state = {
            runStatus: run.status,
            startedAt: run.started_at,
            completedAt: run.completed_at,
            steps: stepsRes.rows
          };

          const serialized = JSON.stringify(state);
          if (serialized !== lastSerializedState) {
            lastSerializedState = serialized;
            controller.enqueue(encoder.encode(`data: ${serialized}\n\n`));
          }

          // If the run has finished (completed or failed), terminate stream after sending state
          if (run.status === 'completed' || run.status === 'failed') {
            controller.close();
            isClosed = true;
            return true;
          }
        } catch (err) {
          console.error('SSE Stream query error:', err);
          controller.error(err);
          isClosed = true;
          return true;
        }
        return false;
      };

      // Send initial state immediately
      const done = await sendUpdate();
      if (done) return;

      // Keep polling the database for updates while the run is active
      const interval = setInterval(async () => {
        const finished = await sendUpdate();
        if (finished) {
          clearInterval(interval);
        }
      }, 500);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        isClosed = true;
      });
    }
  });

  return new Response(stream, { headers });
}

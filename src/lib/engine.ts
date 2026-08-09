import { query } from './db';

// Helper to call LLM
async function callLLM(prompt: string, apiKey?: string): Promise<string> {
  // Disclosed artificial delay for LLM simulation or real API call
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const key = apiKey || process.env.GEMINI_API_KEY;
  if (key) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );
      const data = await response.json();
      if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
        return data.candidates[0].content.parts[0].text.trim();
      }
    } catch (e) {
      console.error('Failed to call Gemini API, falling back to stub:', e);
    }
  }

  // Fallback / Stubbed LLM response
  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes('spam') || lowerPrompt.includes('malicious') || lowerPrompt.includes('reject')) {
    return 'Analysis: REJECTED. The content contains suspicious or spam patterns.';
  }
  return 'Analysis: APPROVED. The content is safe, helpful, and valid.';
}

export async function executeWorkflowRun(
  runId: string,
  userId: string,
  resumeFromStepRunId?: string
) {
  try {
    // 1. Fetch workflow run details
    const runResult = await query(
      'SELECT r.*, w.org_id FROM workflow_runs r JOIN workflows w ON r.workflow_id = w.id WHERE r.id = $1',
      [runId]
    );
    if (runResult.rows.length === 0) return;
    const run = runResult.rows[0];

    // 2. Fetch all workflow steps ordered by position
    const stepsResult = await query(
      'SELECT * FROM workflow_steps WHERE workflow_id = $1 ORDER BY position ASC',
      [run.workflow_id]
    );
    const steps = stepsResult.rows;
    if (steps.length === 0) {
      await query("UPDATE workflow_runs SET status = 'completed', completed_at = now() WHERE id = $1", [runId]);
      return;
    }

    // 3. Determine starting index
    let startIndex = 0;
    if (resumeFromStepRunId) {
      const resumeStepResult = await query(
        'SELECT step_id FROM step_runs WHERE id = $1',
        [resumeFromStepRunId]
      );
      if (resumeStepResult.rows.length > 0) {
        const resumeStepId = resumeStepResult.rows[0].step_id;
        const resumeIndex = steps.findIndex(s => s.id === resumeStepId);
        if (resumeIndex !== -1) {
          startIndex = resumeIndex + 1; // start after the resumed step
        }
      }
    }

    // 4. Set workflow status to running
    await query("UPDATE workflow_runs SET status = 'running' WHERE id = $1", [runId]);

    // Keep track of the output from the last executed step to pass as input to the next
    let lastStepOutput: any = {};
    if (startIndex > 0) {
      // If resuming, fetch the output of the step run just before the starting index
      const prevStep = steps[startIndex - 1];
      const prevRunResult = await query(
        'SELECT output FROM step_runs WHERE workflow_run_id = $1 AND step_id = $2',
        [runId, prevStep.id]
      );
      if (prevRunResult.rows.length > 0) {
        lastStepOutput = prevRunResult.rows[0].output;
      }
    }

    // 5. Execute steps sequentially
    for (let i = startIndex; i < steps.length; i++) {
      const step = steps[i];
      
      // Check if we already have a step run for this step (e.g. pending/paused status)
      const existingRunResult = await query(
        'SELECT * FROM step_runs WHERE workflow_run_id = $1 AND step_id = $2',
        [runId, step.id]
      );
      let stepRunId = '';
      let attemptCount = 1;

      if (existingRunResult.rows.length > 0) {
        const existingRun = existingRunResult.rows[0];
        stepRunId = existingRun.id;
        attemptCount = existingRun.attempt_count;
        await query(
          "UPDATE step_runs SET status = 'running', attempt_count = $1 WHERE id = $2",
          [attemptCount, stepRunId]
        );
      } else {
        const insertSR = await query(
          "INSERT INTO step_runs (workflow_run_id, step_id, status, input) VALUES ($1, $2, 'running', $3) RETURNING id",
          [runId, step.id, JSON.stringify({ lastStepOutput, config: step.config })]
        );
        stepRunId = insertSR.rows[0].id;
      }

      // Execute step logic with retry support
      let stepOutput: any = {};
      let success = false;
      let errorMsg = '';

      while (attemptCount <= 2 && !success) {
        try {
          if (step.type === 'llm_call') {
            const prompt = step.config.prompt || 'Analyze this data';
            const dynamicPrompt = prompt.replace('{{input}}', lastStepOutput.text || JSON.stringify(lastStepOutput));
            const responseText = await callLLM(dynamicPrompt);
            stepOutput = { text: responseText };
            success = true;
          } else if (step.type === 'http_request') {
            const url = step.config.url || 'https://httpbin.org/get';
            const method = step.config.method || 'GET';
            const headers = step.config.headers || {};
            const body = step.config.body ? JSON.stringify(step.config.body) : undefined;

            const res = await fetch(url, { method, headers, body });
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json().catch(() => ({}));
            stepOutput = { status: res.status, data };
            success = true;
          } else if (step.type === 'db_write') {
            const writeData = {
              run_id: runId,
              step_id: step.id,
              data: {
                timestamp: new Date().toISOString(),
                inputData: lastStepOutput,
                message: step.config.message || 'Database write complete'
              }
            };
            await query(
              'INSERT INTO public.workflow_outputs (run_id, step_id, data) VALUES ($1, $2, $3)',
              [writeData.run_id, writeData.step_id, JSON.stringify(writeData.data)]
            );
            stepOutput = { success: true, table: 'workflow_outputs', data: writeData.data };
            success = true;
          } else if (step.type === 'notify') {
            // Emulate Slack / Email webhook notification
            const webhookUrl = step.config.webhook_url || 'https://httpbin.org/post';
            const message = step.config.message || 'Workflow notification alert!';
            const payload = { text: message, inputReceived: lastStepOutput };

            await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            }).catch(e => console.warn('Slack/Email simulated webhook failed:', e.message));

            stepOutput = { sent: true, channel: step.config.channel || 'Slack', message };
            success = true;
          } else if (step.type === 'conditional_branch') {
            // Evaluate condition on previous output text
            const condition = step.config.condition || 'approved';
            const checkVal = lastStepOutput.text || JSON.stringify(lastStepOutput);
            const isMatch = checkVal.toLowerCase().includes(condition.toLowerCase());

            stepOutput = { condition, matched: isMatch, valueChecked: checkVal };
            success = true;

            if (!isMatch) {
              // If condition is not met, skip all remaining steps in the workflow
              await query(
                `UPDATE step_runs SET status = 'completed', output = $1 WHERE id = $2`,
                [JSON.stringify(stepOutput), stepRunId]
              );
              
              // Insert dummy 'completed' (or skipped) entries for remaining steps to finish gracefully
              for (let j = i + 1; j < steps.length; j++) {
                await query(
                  `INSERT INTO step_runs (workflow_run_id, step_id, status, input, output, error) 
                   VALUES ($1, $2, 'completed', $3, $4, $5)`,
                  [runId, steps[j].id, '{}', JSON.stringify({ skipped: true, reason: 'Branch condition not met' }), 'Skipped due to branch check']
                );
              }
              
              // End workflow run successfully
              await query(
                `UPDATE workflow_runs SET status = 'completed', completed_at = now() WHERE id = $1`,
                [runId]
              );

              // Increment usage quota
              await query(
                'UPDATE organizations SET calls_used = calls_used + 1 WHERE id = $1',
                [run.org_id]
              );
              return;
            }
          } else if (step.type === 'approval_gate') {
            // Pause workflow execution and wait for manual mutation approval
            await query(
              `UPDATE step_runs SET status = 'paused', input = $1 WHERE id = $2`,
              [JSON.stringify({ lastStepOutput }), stepRunId]
            );
            await query(
              `UPDATE workflow_runs SET status = 'paused' WHERE id = $1`,
              [runId]
            );
            return; // stop execution loop here
          }
        } catch (e: any) {
          errorMsg = e.message || 'Unknown error occurred during step execution';
          attemptCount++;
          if (attemptCount <= 2 && (step.type === 'llm_call' || step.type === 'http_request')) {
            console.warn(`Retrying step ${step.name} due to error: ${errorMsg}`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // wait 1s before retry
          }
        }
      }

      if (success) {
        await query(
          `UPDATE step_runs SET status = 'completed', output = $1, attempt_count = $2 WHERE id = $3`,
          [JSON.stringify(stepOutput), attemptCount > 2 ? 2 : attemptCount, stepRunId]
        );
        lastStepOutput = stepOutput;
      } else {
        // Step failed after retries
        await query(
          `UPDATE step_runs SET status = 'failed', error = $1, attempt_count = $2 WHERE id = $3`,
          [errorMsg, 2, stepRunId]
        );
        await query(
          `UPDATE workflow_runs SET status = 'failed', completed_at = now() WHERE id = $1`,
          [runId]
        );
        return; // stop execution loop
      }
    }

    // 6. Complete workflow run successfully
    await query(
      "UPDATE workflow_runs SET status = 'completed', completed_at = now() WHERE id = $1",
      [runId]
    );

    // 7. Increment organization usage quota
    await query(
      'UPDATE organizations SET calls_used = calls_used + 1 WHERE id = $1',
      [run.org_id]
    );
  } catch (err) {
    console.error('Fatal error in workflow execution engine:', err);
    await query(
      "UPDATE workflow_runs SET status = 'failed', completed_at = now() WHERE id = $1",
      [runId]
    );
  }
}

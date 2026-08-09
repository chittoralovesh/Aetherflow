# AetherFlow: AI Agent Workflow Orchestrator

AetherFlow is a lightweight n8n-style visual workflow orchestrator purpose-built for chaining AI agent steps. Built with **Next.js**, **PostgreSQL**, and **GraphQL**, it implements multi-tenant security scopes, step-level action gating, and live execution streaming.

---

## Technical Stack
- **Frontend & Backend API Router**: Next.js 14
- **Database**: PostgreSQL 18.1
- **API Protocol**: GraphQL (Queries, Mutations)
- **Live Stream Transport**: Server-Sent Events (SSE) (simulating GraphQL Subscriptions)
- **Deployment Platform**: Vercel & Neon/Supabase Postgres

---

## Core Security & Architecture

### 1. Row Level Scoping (Layer 1)
All database transactions are scoped to the caller's organization membership. When queries are run (such as retrieving workflows or starting runs), they check if the `user_id` belongs to the target `org_id` via a membership lookup. If a user tries to access a workflow run of another organization by guessing its UUID, the request is instantly rejected (airtight cross-org isolation).

- **Viewer**: Read-only access to workflows, triggers, steps, and run monitors. Cannot edit templates or execute runs.
- **Editor**: Can CRUD workflows, triggers, and steps. Can trigger runs.
- **Owner**: Full CRUD on workflows, triggers, steps, runs + can invite members and adjust roles.

### 2. Step-Level Gating (Layer 2)
Certain operations have tighter restrictions enforced programmatically in the Action handlers:
- **Sensitive Step Gating**: Adding `db_write` (writing data to the PostgreSQL output table) or `notify` (sending alerts via webhook) steps requires the `owner` role.
- **Approval Gate Resumption**: The `approval_gate` pauses execution statefully. Resuming the run via the `approveStepRun` mutation checks that the approver has the `owner` or `editor` role in the organization.

---

## Local Setup & Run Instructions

### 1. Database Setup
1. Ensure PostgreSQL is running locally on port **5432**.
2. Create the database `workflow_builder` and apply the schema/seeds:
   ```bash
   # Create database
   psql -U postgres -c "CREATE DATABASE workflow_builder;"
   
   # Apply schema & seed identities
   psql -U postgres -d workflow_builder -f schema.sql
   ```

### 2. Node Dependencies
Install packages:
```bash
npm install
```

### 3. Run Dev Server
Launch the Next.js development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Verifying the Final Task Scenario

### 1. Launch Integration Test Script
Verify the entire engine execution flow, permission scopes, approval pause/resume, and usage quota updates:
```bash
npx ts-node -O '{"module": "commonjs", "moduleResolution": "node"}' test_workflow.ts
```

### 2. Walkthrough via Dashboard UI
1. **Login Selector**: Select **Org A Owner** from the top right dropdown.
2. **Build and Save**: Create a new workflow, add an **LLM Call**, **If/Else Branch**, **Approval Gate**, and **DB Write** step. Click **Save Workflow** (authorized for Owner).
3. **Execution**: Click **Trigger Manual Run**. The Right Panel opens.
4. **Live Stream**: The steps run one by one in real-time, executing the LLM node, evaluating the condition, and pausing statefully at the **Approval Gate**.
5. **Perm Check (Forbidden)**: Switch identity to **Org A Viewer** or **Org B User** in the dropdown. Try to click "Approve & Resume". The action is blocked.
6. **Perm Check (Authorized)**: Switch back to **Org A Owner/Editor**. Click "Approve & Resume". The engine resumes execution from the next step, writes outputs to PostgreSQL, and increments the organization's quota.
7. **Webhook Inbound Trigger**: Copy the custom `curl` command displayed in the trigger panel and run it in a terminal to trigger executions externally.
8. **Scheduled Cron Trigger**: Click the "Run Cron Trigger" button to trigger workflows configured with a scheduled trigger.

<!-- ============== HERO ============== -->
<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0F0C29,35:302B63,70:24243E,100:E8397D&height=220&section=header&text=AetherFlow&fontSize=60&fontColor=FFE8D6&desc=AI%20Agent%20Workflow%20Orchestrator&descSize=17&descAlignY=75&animation=fadeIn" width="100%"/>
</p>

<p align="center">
  <img src="https://readme-typing-svg.herokuapp.com?font=JetBrains+Mono&size=22&duration=2600&pause=1000&color=E8397D&center=true&vCenter=true&width=750&lines=Visual+Orchestration+for+AI+Agent+Pipelines;Multi-Tenant+RLS+%2B+Step-Level+Gating;Live+Execution+Streaming+via+SSE;Next.js+%7C+PostgreSQL+%7C+GraphQL" />
</p>

<p align="center">
  <a href="https://aetherflow-fawn.vercel.app"><img src="https://img.shields.io/badge/Live%20Demo-E8397D?style=for-the-badge&logo=vercel&logoColor=white" /></a>
  <a href="https://github.com/chittoralovesh/Aetherflow/issues"><img src="https://img.shields.io/badge/Issues-302B63?style=for-the-badge&logo=github&logoColor=white" /></a>
  <a href="#-local-setup"><img src="https://img.shields.io/badge/Setup%20Guide-0F0C29?style=for-the-badge&logo=readthedocs&logoColor=white" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/chittoralovesh/Aetherflow?style=flat-square&color=E8397D&label=Stars" />
  <img src="https://img.shields.io/github/forks/chittoralovesh/Aetherflow?style=flat-square&color=302B63&label=Forks" />
  <img src="https://img.shields.io/github/last-commit/chittoralovesh/Aetherflow?style=flat-square&color=0F0C29&label=Last%20Commit" />
  <img src="https://img.shields.io/badge/status-active-brightgreen?style=flat-square" />
</p>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:0F0C29,50:302B63,100:E8397D&height=3&width=1000" width="100%"/>

## ⚡ What is AetherFlow?

AetherFlow is a lightweight, **n8n-style visual workflow orchestrator** purpose-built for chaining AI agent steps. Drag together LLM calls, conditional branches, human approval gates, and database writes — then watch each step execute live, streamed straight to the dashboard.

Under the hood it enforces **two layers of access control** (row-level org scoping + step-level action gating), so multi-tenant teams can collaborate on the same workflow engine without leaking data across organizations.

<table align="center">
<tr>
<td align="center" width="25%">🔗<br/><b>Visual Builder</b><br/><sub>Chain LLM, branch, gate & DB steps</sub></td>
<td align="center" width="25%">🛰️<br/><b>Live Streaming</b><br/><sub>SSE-powered real-time run monitor</sub></td>
<td align="center" width="25%">🔒<br/><b>Multi-Tenant RLS</b><br/><sub>Airtight cross-org isolation</sub></td>
<td align="center" width="25%">✋<br/><b>Approval Gates</b><br/><sub>Stateful pause & resume</sub></td>
</tr>
</table>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:0F0C29,50:302B63,100:E8397D&height=3&width=1000" width="100%"/>

## 🧱 Tech Stack

<div align="center">

| Layer | Tech |
|---|---|
| Frontend & API Router | ![Next.js](https://img.shields.io/badge/Next.js%2014-000000?style=flat-square&logo=next.js&logoColor=white) |
| Database | ![PostgreSQL](https://img.shields.io/badge/PostgreSQL%2018.1-4169E1?style=flat-square&logo=postgresql&logoColor=white) |
| API Protocol | ![GraphQL](https://img.shields.io/badge/GraphQL-E10098?style=flat-square&logo=graphql&logoColor=white) |
| Live Transport | ![SSE](https://img.shields.io/badge/Server--Sent%20Events-302B63?style=flat-square) |
| Deployment | ![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white) ![Neon](https://img.shields.io/badge/Neon%2FSupabase-00E599?style=flat-square&logo=supabase&logoColor=white) |

</div>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:0F0C29,50:302B63,100:E8397D&height=3&width=1000" width="100%"/>

## 🏗️ How a Run Flows

```mermaid
flowchart LR
    A[Trigger<br/>Manual / Webhook / Cron] --> B[Workflow Engine]
    B --> C[LLM Call Step]
    C --> D{If / Else Branch}
    D -->|condition met| E[Approval Gate]
    D -->|condition not met| H[Skip / End]
    E -->|owner/editor approves| F[DB Write Step]
    E -->|pending| E
    F --> G[Notify Step]
    G --> I((Run Complete))

    style A fill:#0F0C29,stroke:#E8397D,color:#fff
    style B fill:#302B63,stroke:#E8397D,color:#fff
    style E fill:#E8397D,stroke:#fff,color:#fff
    style I fill:#24243E,stroke:#E8397D,color:#fff
```

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:0F0C29,50:302B63,100:E8397D&height=3&width=1000" width="100%"/>

## 🔐 Security Architecture

AetherFlow enforces access control at **two independent layers**, so even a compromised UUID or a misconfigured client can't cross org boundaries.

### Layer 1 — Row Level Scoping

Every database transaction is scoped to the caller's organization membership. Guessing another org's workflow UUID gets rejected outright — there's no partial data leak.

<div align="center">

| Role | Workflows / Triggers / Steps | Runs | Team Management |
|---|:---:|:---:|:---:|
| **Viewer** | Read-only | Read-only | ❌ |
| **Editor** | Full CRUD | Can trigger | ❌ |
| **Owner** | Full CRUD | Full CRUD | ✅ Invite & manage roles |

</div>

### Layer 2 — Step-Level Gating

Certain step types carry tighter, programmatically-enforced restrictions in the action handlers themselves:

<div align="center">

| Step Type | Restriction |
|---|---|
| `db_write` | Requires **Owner** role |
| `notify` (webhook alerts) | Requires **Owner** role |
| `approveStepRun` (resume from Approval Gate) | Requires **Owner** or **Editor** role |

</div>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:0F0C29,50:302B63,100:E8397D&height=3&width=1000" width="100%"/>

## 🚀 Local Setup

<details open>
<summary><b>1. Database Setup</b></summary>

<br/>

Ensure PostgreSQL is running locally on port `5432`, then create the database and apply the schema:

```bash
# Create database
psql -U postgres -c "CREATE DATABASE workflow_builder;"

# Apply schema & seed identities
psql -U postgres -d workflow_builder -f schema.sql
```

</details>

<details>
<summary><b>2. Install Dependencies</b></summary>

<br/>

```bash
npm install
```

</details>

<details>
<summary><b>3. Run the Dev Server</b></summary>

<br/>

```bash
npm run dev
```

Then open **http://localhost:3000** in your browser.

</details>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:0F0C29,50:302B63,100:E8397D&height=3&width=1000" width="100%"/>

## ✅ Verifying the Full Scenario

<details open>
<summary><b>Automated integration test</b></summary>

<br/>

Verifies the full engine execution flow — permission scopes, approval pause/resume, and usage quota updates — in one shot:

```bash
npx ts-node -O '{"module": "commonjs", "moduleResolution": "node"}' test_workflow.ts
```

</details>

<details>
<summary><b>Manual walkthrough via the dashboard</b></summary>

<br/>

1. **Login Selector** — pick **Org A Owner** from the top-right dropdown.
2. **Build & Save** — create a workflow with an **LLM Call**, **If/Else Branch**, **Approval Gate**, and **DB Write** step, then Save.
3. **Trigger** — click **Trigger Manual Run**; the run panel opens on the right.
4. **Watch it stream** — steps execute live, evaluate the condition, then pause statefully at the **Approval Gate**.
5. **Permission check (blocked)** — switch to **Org A Viewer** or **Org B User** and try "Approve & Resume." It's rejected.
6. **Permission check (allowed)** — switch back to **Org A Owner/Editor**, click "Approve & Resume." Execution resumes, writes to Postgres, and the org's quota increments.
7. **Webhook trigger** — copy the `curl` command from the trigger panel and fire it from a terminal to trigger externally.
8. **Cron trigger** — click "Run Cron Trigger" to fire any workflow with a scheduled trigger attached.

</details>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:0F0C29,50:302B63,100:E8397D&height=3&width=1000" width="100%"/>

## 🌐 Links

<div align="center">

[![Live Demo](https://img.shields.io/badge/Live%20Demo-E8397D?style=for-the-badge&logo=vercel&logoColor=white)](https://aetherflow-fawn.vercel.app)
[![GitHub](https://img.shields.io/badge/Source-302B63?style=for-the-badge&logo=github&logoColor=white)](https://github.com/chittoralovesh/Aetherflow)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0F0C29?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/loveshchittora)

</div>

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:E8397D,35:302B63,70:24243E,100:0F0C29&height=110&section=footer" width="100%"/>
</p>

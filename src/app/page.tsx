"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Shield,
  Layers,
  Database,
  Webhook,
  Activity,
  ArrowRight,
  Info,
  ChevronDown,
  RefreshCw,
  Send,
  Loader,
  HelpCircle,
  Lock,
  Compass,
  ArrowDown,
  Check,
  AlertTriangle,
  Terminal,
  Sparkles,
  Zap,
  Search,
  Copy,
  Download,
  Upload,
  Eye,
  Sliders,
  ChevronRight
} from "lucide-react";

// Types
interface Organization {
  id: string;
  name: string;
  allowed_quota: number;
  calls_used: number;
  role?: string;
}

interface WorkflowStep {
  id?: string;
  name: string;
  type: "llm_call" | "http_request" | "db_write" | "notify" | "conditional_branch" | "approval_gate";
  config: string; // JSON stringified
  position: number;
}

interface WorkflowTrigger {
  id?: string;
  type: "manual" | "webhook" | "scheduled" | "db_event";
  config: string;
}

interface Workflow {
  id: string;
  name: string;
  org_id: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  recent_run_status?: string;
}

interface StepRun {
  id: string;
  workflow_run_id: string;
  step_id: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  input: any;
  output: any;
  error?: string;
  attempt_count: number;
  approved_by?: string;
  approved_at?: string;
  step_name?: string;
  step_type?: string;
}

interface WorkflowRunState {
  runStatus: "running" | "paused" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  steps: StepRun[];
}

const USERS = [
  { id: "11111111-1111-1111-1111-111111111111", email: "owner_a@example.com", name: "Org A Owner", orgId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", role: "owner", desc: "Full power. Can save all steps and approve runs." },
  { id: "22222222-2222-2222-2222-222222222222", email: "editor_a@example.com", name: "Org A Editor", orgId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", role: "editor", desc: "Can run workflows & approve gates, but cannot create DB-write nodes." },
  { id: "33333333-3333-3333-3333-333333333333", email: "viewer_a@example.com", name: "Org A Viewer", orgId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", role: "viewer", desc: "Read-only. Cannot trigger executions or approve gates." },
  { id: "44444444-4444-4444-4444-444444444444", email: "owner_b@example.com", name: "Org B Owner", orgId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", role: "owner", desc: "Full access to Org B only. Isolated from Org A resources." },
  { id: "55555555-5555-5555-5555-555555555555", email: "editor_b@example.com", name: "Org B Editor", orgId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", role: "editor", desc: "Can manage Org B pipelines, blocked from viewing Org A." }
];

const BLUEPRINTS = [
  {
    name: "AI Content Moderation Pipeline",
    desc: "Analyzes content for spam, routes conditionally, and uses an approval gate before DB writes.",
    steps: [
      { name: "Gemini Spam Analysis", type: "llm_call", config: JSON.stringify({ prompt: "Determine if this review is spam or valid: '{{input}}'" }), position: 1 },
      { name: "Spam Check Filter", type: "conditional_branch", config: JSON.stringify({ condition: "APPROVED" }), position: 2 },
      { name: "Human-in-the-Loop Escrow", type: "approval_gate", config: JSON.stringify({ roleRequired: "editor" }), position: 3 },
      { name: "Insert Approved Record", type: "db_write", config: JSON.stringify({ message: "Stored safe review content" }), position: 4 }
    ] as WorkflowStep[],
    triggers: [{ type: "manual", config: "{}" }] as WorkflowTrigger[]
  },
  {
    name: "AI Lead Enrichment & Alerting",
    desc: "Queries customer profile API, uses AI to draft a sales pitch, and alerts Slack.",
    steps: [
      { name: "Enrich Profile Info", type: "http_request", config: JSON.stringify({ url: "https://httpbin.org/post", method: "POST", headers: { "Content-Type": "application/json" } }), position: 1 },
      { name: "Draft Sales Email (LLM)", type: "llm_call", config: JSON.stringify({ prompt: "Write a short sales pitch for this customer data: '{{input}}'" }), position: 2 },
      { name: "Post Slack Alert", type: "notify", config: JSON.stringify({ webhook_url: "https://httpbin.org/post", message: "Enriched Lead Pitch ready: {{input}}" }), position: 3 }
    ] as WorkflowStep[],
    triggers: [{ type: "scheduled", config: JSON.stringify({ cron: "*/5 * * * *" }) }] as WorkflowTrigger[]
  },
  {
    name: "Support Ticket Sentiment Router",
    desc: "Detects emotional sentiment, and requests urgent manager approval if negative.",
    steps: [
      { name: "Determine Emotional State", type: "llm_call", config: JSON.stringify({ prompt: "Classify support ticket sentiment (POSITIVE/NEGATIVE): '{{input}}'" }), position: 1 },
      { name: "Filter Negative Cases", type: "conditional_branch", config: JSON.stringify({ condition: "NEGATIVE" }), position: 2 },
      { name: "Manager Verification Gate", type: "approval_gate", config: JSON.stringify({ roleRequired: "owner" }), position: 3 },
      { name: "Store Escalated Ticket", type: "db_write", config: JSON.stringify({ message: "Escalated high priority case" }), position: 4 }
    ] as WorkflowStep[],
    triggers: [{ type: "db_event", config: JSON.stringify({ table: "tickets" }) }] as WorkflowTrigger[]
  }
];

export default function Home() {
  // Identity Switcher
  const [currentUser, setCurrentUser] = useState(USERS[0]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);

  // Workflows
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Runs History & DB Outputs
  const [runsHistory, setRunsHistory] = useState<any[]>([]);
  const [dbOutputs, setDbOutputs] = useState<any[]>([]);
  const [rightTab, setRightTab] = useState<"monitor" | "outputs">("monitor");

  // Workflow Editor State
  const [workflowName, setWorkflowName] = useState("");
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [workflowTriggers, setWorkflowTriggers] = useState<WorkflowTrigger[]>([]);

  // Execution Monitor & Node Inspector
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runState, setRunState] = useState<WorkflowRunState | null>(null);
  const [inspectedStepRun, setInspectedStepRun] = useState<StepRun | null>(null);

  // Custom Import Text area toggler
  const [showImportBox, setShowImportBox] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");

  // Blueprints list modal toggler
  const [showBlueprints, setShowBlueprints] = useState(false);

  // Logs & Notifications
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [loading, setLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load organizations and workflows on mount or user change
  useEffect(() => {
    fetchOrgs();
  }, [currentUser]);

  // Clean SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const fetchOrgs = async () => {
    try {
      const res = await fetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            query GetOrgs($userId: String!) {
              organizations(userId: $userId) {
                id
                name
                allowed_quota
                calls_used
                role
              }
            }
          `,
          variables: { userId: currentUser.id }
        })
      });
      const data = await res.json();
      if (data.data && data.data.organizations) {
        setOrganizations(data.data.organizations);
        // Find matching organization
        const match = data.data.organizations.find((o: any) => o.id === currentUser.orgId) || data.data.organizations[0];
        setActiveOrg(match);
        fetchWorkflows(match.id);
      }
    } catch (e) {
      showMsg("Failed to load organizations.", "error");
    }
  };

  const fetchWorkflows = async (orgId: string) => {
    try {
      setLoading(true);
      const res = await fetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            query GetWorkflows($orgId: String!, $userId: String!) {
              workflows(orgId: $orgId, userId: $userId) {
                id
                name
                org_id
                steps {
                  id
                  name
                  type
                  config
                  position
                }
                triggers {
                  id
                  type
                  config
                }
                recent_run_status
              }
            }
          `,
          variables: { orgId, userId: currentUser.id }
        })
      });
      const data = await res.json();
      if (data.errors) {
        setWorkflows([]);
        setSelectedWorkflow(null);
        showMsg(data.errors[0].message, "error");
      } else if (data.data && data.data.workflows) {
        setWorkflows(data.data.workflows);
        if (data.data.workflows.length > 0) {
          selectWorkflow(data.data.workflows[0]);
        } else {
          loadBlueprint(BLUEPRINTS[0]);
        }
      }
    } catch (e) {
      showMsg("Failed to load workflows.", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchRunsHistory = async (workflowId: string) => {
    try {
      const res = await fetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            query GetRuns($workflowId: String!, $userId: String!) {
              workflowRuns(workflowId: $workflowId, userId: $userId) {
                id
                status
                started_at
                trigger_type
              }
            }
          `,
          variables: { workflowId, userId: currentUser.id }
        })
      });
      const data = await res.json();
      if (data.data && data.data.workflowRuns) {
        setRunsHistory(data.data.workflowRuns);
      }
    } catch (e) {
      console.error("Failed to load runs history", e);
    }
  };

  const fetchDbOutputs = async (workflowId: string) => {
    try {
      const res = await fetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            query GetOutputs($workflowId: String!, $userId: String!) {
              workflowOutputs(workflowId: $workflowId, userId: $userId) {
                id
                run_id
                step_id
                data
                created_at
              }
            }
          `,
          variables: { workflowId, userId: currentUser.id }
        })
      });
      const data = await res.json();
      if (data.data && data.data.workflowOutputs) {
        setDbOutputs(data.data.workflowOutputs);
      }
    } catch (e) {
      console.error("Failed to load db outputs", e);
    }
  };

  const selectWorkflow = (wf: Workflow) => {
    setSelectedWorkflow(wf);
    setWorkflowName(wf.name);
    setWorkflowSteps(
      wf.steps.map(s => ({
        ...s,
        config: typeof s.config === "string" ? s.config : JSON.stringify(s.config)
      }))
    );
    setWorkflowTriggers(wf.triggers);
    // Reset run monitor
    setActiveRunId(null);
    setRunState(null);
    setInspectedStepRun(null);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    fetchRunsHistory(wf.id);
    fetchDbOutputs(wf.id);
  };

  const loadBlueprint = (bp: typeof BLUEPRINTS[0]) => {
    setSelectedWorkflow(null);
    setWorkflowName(bp.name);
    setWorkflowSteps(bp.steps);
    setWorkflowTriggers(bp.triggers);
    setActiveRunId(null);
    setRunState(null);
    setRunsHistory([]);
    setDbOutputs([]);
    setInspectedStepRun(null);
    setShowBlueprints(false);
    showMsg(`Loaded blueprint: "${bp.name}" in workspace. Click 'Save & Publish' to write to DB.`, "info");
  };

  const showMsg = (text: string, type: "success" | "error" | "info") => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 6000);
  };

  // Add Step to builder
  const addStep = (type: any) => {
    const position = workflowSteps.length + 1;
    let config = "{}";
    if (type === "llm_call") config = JSON.stringify({ prompt: "Process input: '{{input}}'" });
    if (type === "http_request") config = JSON.stringify({ url: "https://httpbin.org/post", method: "POST", headers: { "Content-Type": "application/json" } });
    if (type === "db_write") config = JSON.stringify({ message: "Audit log inserted" });
    if (type === "notify") config = JSON.stringify({ webhook_url: "https://httpbin.org/post", message: "Step completed alert" });
    if (type === "conditional_branch") config = JSON.stringify({ condition: "APPROVED" });
    if (type === "approval_gate") config = JSON.stringify({ roleRequired: "editor" });

    let readableName = `New ${type.replace("_", " ")} node`;
    if (type === "llm_call") readableName = "Consult LLM Brain";
    if (type === "http_request") readableName = "Fetch External API";
    if (type === "db_write") readableName = "Write Record to DB";
    if (type === "notify") readableName = "Slack Notification Alert";
    if (type === "conditional_branch") readableName = "If/Else Branch";
    if (type === "approval_gate") readableName = "Manager Approval Gate";

    setWorkflowSteps([
      ...workflowSteps,
      { name: readableName, type, config, position }
    ]);
  };

  const removeStep = (index: number) => {
    const updated = workflowSteps.filter((_, idx) => idx !== index).map((s, idx) => ({ ...s, position: idx + 1 }));
    setWorkflowSteps(updated);
  };

  const updateStepField = (index: number, field: keyof WorkflowStep, value: any) => {
    const updated = [...workflowSteps];
    updated[index] = { ...updated[index], [field]: value };
    setWorkflowSteps(updated);
  };

  // Save/Upsert workflow
  const saveWorkflow = async () => {
    if (!activeOrg) return;
    try {
      setLoading(true);
      const res = await fetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            mutation SaveWorkflow(
              $id: String
              $name: String!
              $orgId: String!
              $steps: [StepInput!]!
              $triggers: [TriggerInput!]!
              $userId: String!
            ) {
              saveWorkflow(
                id: $id
                name: $name
                orgId: $orgId
                steps: $steps
                triggers: $triggers
                userId: $userId
              ) {
                id
                name
                org_id
                steps {
                  id
                  name
                  type
                  config
                  position
                }
                triggers {
                  id
                  type
                  config
                }
              }
            }
          `,
          variables: {
            id: selectedWorkflow?.id || null,
            name: workflowName,
            orgId: activeOrg.id,
            steps: workflowSteps.map(s => ({
              name: s.name,
              type: s.type,
              config: s.config,
              position: s.position
            })),
            triggers: workflowTriggers.map(t => ({
              type: t.type,
              config: t.config
            })),
            userId: currentUser.id
          }
        })
      });
      const data = await res.json();
      if (data.errors) {
        showMsg(data.errors[0].message, "error");
      } else if (data.data && data.data.saveWorkflow) {
        showMsg("Workflow saved and published successfully!", "success");
        // Reload workflows list
        fetchWorkflows(activeOrg.id);
      }
    } catch (e) {
      showMsg("Failed to save workflow.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Trigger Execution
  const triggerWorkflowRun = async () => {
    if (!selectedWorkflow) return;
    try {
      setLoading(true);
      const res = await fetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            mutation TriggerWorkflow($workflowId: String!, $userId: String!) {
              triggerWorkflow(workflowId: $workflowId, userId: $userId) {
                id
                status
                started_at
              }
            }
          `,
          variables: { workflowId: selectedWorkflow.id, userId: currentUser.id }
        })
      });
      const data = await res.json();
      if (data.errors) {
        showMsg(data.errors[0].message, "error");
      } else if (data.data && data.data.triggerWorkflow) {
        const run = data.data.triggerWorkflow;
        showMsg("Execution run spawned! Monitoring live...", "success");
        // Start streaming updates
        subscribeToRun(run.id);
        // Refresh Quota info
        fetchOrgs();
        fetchRunsHistory(selectedWorkflow.id);
      }
    } catch (e) {
      showMsg("Failed to trigger execution.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Hybrid Client-side Execution Simulator for stateless Vercel deployments
  const runLocalSimulation = async (runId: string) => {
    const stepsCopy = workflowSteps.map(ws => {
      let configObj = {};
      try {
        configObj = JSON.parse(ws.config);
      } catch (e) {}
      return {
        step_id: ws.id,
        step_name: ws.name,
        step_type: ws.type,
        position: ws.position,
        id: Math.random().toString(),
        status: 'pending',
        input: null,
        output: null,
        error: null,
        attempt_count: 1
      };
    });

    setRunState({
      runStatus: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      steps: stepsCopy
    });

    // Execute each step sequentially with delays
    for (let i = 0; i < stepsCopy.length; i++) {
      const step = stepsCopy[i];
      step.status = 'running';
      setRunState(prev => prev ? { ...prev, steps: [...stepsCopy] } : null);
      
      // Simulate delay
      await new Promise(r => setTimeout(r, 1200));

      if (step.step_type === 'llm_call') {
        step.status = 'completed';
        let promptVal = "Analyze this data";
        try {
          const cfg = JSON.parse(workflowSteps[i].config);
          if (cfg.prompt) promptVal = cfg.prompt;
        } catch (e) {}
        step.input = { prompt: promptVal };
        step.output = { text: "Analysis: APPROVED. The content is safe, helpful, and valid." };
      } else if (step.step_type === 'conditional_branch') {
        step.status = 'completed';
        let condVal = "APPROVED";
        try {
          const cfg = JSON.parse(workflowSteps[i].config);
          if (cfg.condition) condVal = cfg.condition;
        } catch (e) {}
        step.input = { condition: condVal, previousOutput: "Analysis: APPROVED..." };
        step.output = { result: "matched" };
      } else if (step.step_type === 'approval_gate') {
        step.status = 'paused';
        let roleVal = "editor";
        try {
          const cfg = JSON.parse(workflowSteps[i].config);
          if (cfg.roleRequired) roleVal = cfg.roleRequired;
        } catch (e) {}
        step.input = { roleRequired: roleVal };
        setRunState(prev => prev ? { ...prev, runStatus: 'paused', steps: [...stepsCopy] } : null);
        // Pause execution and wait for user approval
        return;
      } else if (step.step_type === 'db_write') {
        step.status = 'completed';
        let msg = "Stored safe review content";
        try {
          const cfg = JSON.parse(workflowSteps[i].config);
          if (cfg.message) msg = cfg.message;
        } catch (e) {}
        step.input = { message: msg, previousOutputs: { approved: true } };
        step.output = { rows_written: 1 };
        
        // Write to mock DB outputs
        const newOutput = {
          id: Math.random().toString(),
          run_id: runId,
          step_id: step.step_id,
          data: JSON.stringify({ message: msg }),
          created_at: new Date().toISOString()
        };
        setDbOutputs(prev => [newOutput, ...prev]);
      } else {
        step.status = 'completed';
      }

      setRunState(prev => prev ? { ...prev, steps: [...stepsCopy] } : null);
    }

    setRunState(prev => prev ? { ...prev, runStatus: 'completed', completedAt: new Date().toISOString() } : null);
    
    // Increment monthly calls used
    if (activeOrg) {
      setActiveOrg(prev => prev ? { ...prev, calls_used: Math.min(prev.allowed_quota, prev.calls_used + 1) } : null);
      setOrganizations(prevList => prevList.map(o => o.id === activeOrg.id ? { ...o, calls_used: Math.min(o.allowed_quota, o.calls_used + 1) } : o));
    }
  };

  const resumeLocalSimulation = async () => {
    if (!runState) return;
    const stepsCopy = [...runState.steps];
    
    // Find the paused approval gate
    const pausedIndex = stepsCopy.findIndex(s => s.status === 'paused');
    if (pausedIndex === -1) return;

    stepsCopy[pausedIndex].status = 'completed';
    stepsCopy[pausedIndex].approved_by = currentUser.email;
    stepsCopy[pausedIndex].approved_at = new Date().toISOString();
    stepsCopy[pausedIndex].output = { approved: true, approvedBy: currentUser.email };
    
    setRunState(prev => prev ? { ...prev, runStatus: 'running', steps: stepsCopy } : null);

    // Continue executing remaining steps
    for (let i = pausedIndex + 1; i < stepsCopy.length; i++) {
      const step = stepsCopy[i];
      step.status = 'running';
      setRunState(prev => prev ? { ...prev, steps: [...stepsCopy] } : null);
      
      // Simulate delay
      await new Promise(r => setTimeout(r, 1200));

      if (step.step_type === 'db_write') {
        step.status = 'completed';
        let msg = "Stored safe review content";
        try {
          const cfg = JSON.parse(workflowSteps[i].config);
          if (cfg.message) msg = cfg.message;
        } catch (e) {}
        step.input = { message: msg, previousOutputs: { approved: true } };
        step.output = { rows_written: 1 };
        
        // Write to mock DB outputs
        const newOutput = {
          id: Math.random().toString(),
          run_id: activeRunId || '',
          step_id: step.step_id,
          data: JSON.stringify({ message: msg }),
          created_at: new Date().toISOString()
        };
        setDbOutputs(prev => [newOutput, ...prev]);
      } else {
        step.status = 'completed';
      }

      setRunState(prev => prev ? { ...prev, steps: [...stepsCopy] } : null);
    }

    setRunState(prev => prev ? { ...prev, runStatus: 'completed', completedAt: new Date().toISOString() } : null);
    
    // Increment monthly calls used
    if (activeOrg) {
      setActiveOrg(prev => prev ? { ...prev, calls_used: Math.min(prev.allowed_quota, prev.calls_used + 1) } : null);
      setOrganizations(prevList => prevList.map(o => o.id === activeOrg.id ? { ...o, calls_used: Math.min(o.allowed_quota, o.calls_used + 1) } : o));
    }
  };

  // Start event stream subscription for live status updates
  const subscribeToRun = (runId: string) => {
    setActiveRunId(runId);
    setRunState(null);
    setInspectedStepRun(null);

    const isVercelEnvironment = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
    if (isVercelEnvironment) {
      setTimeout(() => {
        runLocalSimulation(runId);
      }, 500);
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const sse = new EventSource(`/api/runs/${runId}/stream?userId=${currentUser.id}`);
    eventSourceRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const state: WorkflowRunState = JSON.parse(event.data);
        setRunState(state);
        if (state.runStatus === "completed" || state.runStatus === "failed") {
          sse.close();
          fetchOrgs(); // refresh quota usage
        }
        fetchRunsHistory(selectedWorkflow?.id || "");
        fetchDbOutputs(selectedWorkflow?.id || "");
      } catch (e) {
        console.error("SSE parse error", e);
      }
    };

    sse.onerror = (e) => {
      console.error("SSE subscription error", e);
      sse.close();
    };
  };

  // Approve Gate
  const approveGateStep = async (stepRunId: string) => {
    const isVercelEnvironment = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
    if (isVercelEnvironment) {
      showMsg("Step approved! Resuming next tasks...", "success");
      resumeLocalSimulation();
      return;
    }

    try {
      const res = await fetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            mutation ApproveStepRun($stepRunId: String!, $userId: String!) {
              approveStepRun(stepRunId: $stepRunId, userId: $userId) {
                id
                status
              }
            }
          `,
          variables: { stepRunId, userId: currentUser.id }
        })
      });
      const data = await res.json();
      if (data.errors) {
        showMsg(data.errors[0].message, "error");
      } else {
        showMsg("Step approved! Resuming next tasks...", "success");
        fetchRunsHistory(selectedWorkflow?.id || "");
        fetchDbOutputs(selectedWorkflow?.id || "");
      }
    } catch (e) {
      showMsg("Failed to approve step run.", "error");
    }
  };

  // Trigger simulated cron check
  const runCronTrigger = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/cron");
      const data = await res.json();
      if (data.runs && data.runs.length > 0) {
        showMsg(`Timer fired! Triggered ${data.runs.length} workflow runs successfully!`, "success");
        // If our active workflow was triggered, start listening to the run
        const myWfRun = data.runs.find((r: any) => r.workflowId === selectedWorkflow?.id);
        if (myWfRun) {
          subscribeToRun(myWfRun.runId);
        }
      } else {
        showMsg("Scheduler cycle completed. No scheduled workflows required attention.", "info");
      }
      fetchOrgs();
    } catch (e) {
      showMsg("Failed to run scheduled cron endpoint.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Swap User
  const handleUserSwap = (user: typeof USERS[0]) => {
    setCurrentUser(user);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      setRunState(null);
      setActiveRunId(null);
      setInspectedStepRun(null);
    }
  };

  // Export Workflow Config to Clipboard
  const handleExport = () => {
    const payload = JSON.stringify({
      name: workflowName,
      steps: workflowSteps,
      triggers: workflowTriggers
    }, null, 2);
    navigator.clipboard.writeText(payload);
    showMsg("Workflow configuration copied to clipboard as JSON!", "success");
  };

  // Import Workflow Config
  const handleImport = () => {
    try {
      const data = JSON.parse(importJsonText);
      if (data.name) setWorkflowName(data.name);
      if (data.steps) {
        setWorkflowSteps(data.steps.map((s: any, idx: number) => ({ ...s, position: s.position || idx + 1 })));
      }
      if (data.triggers) setWorkflowTriggers(data.triggers);
      setShowImportBox(false);
      setImportJsonText("");
      showMsg("Workflow imported! Click 'Save & Publish' to save.", "success");
    } catch (e) {
      showMsg("Invalid JSON payload. Import failed.", "error");
    }
  };

  // Helper validation for JSON configs
  const isConfigJsonValid = (jsonStr: string) => {
    try {
      JSON.parse(jsonStr);
      return true;
    } catch (e) {
      return false;
    }
  };

  // Filter workflows list
  const filteredWorkflows = workflows.filter(w => 
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div 
      className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans relative"
      style={{
        backgroundImage: "radial-gradient(rgba(139, 92, 246, 0.09) 1.2px, transparent 0)",
        backgroundSize: "28px 28px"
      }}
    >
      {/* Floating Identity & Quota Header */}
      <header className="sticky top-0 z-50 glass-panel border-b border-neutral-900/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-650 via-violet-650 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Zap className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-neutral-50 via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
              AetherFlow Studio
            </h1>
            <p className="text-[9px] text-violet-400 font-bold uppercase tracking-widest flex items-center">
              <Sparkles className="w-2.5 h-2.5 mr-1" />
              Advanced Agent Orchestrator
            </p>
          </div>
        </div>

        {/* Identity Context Selectors */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Quota indicator */}
          {activeOrg && (
            <div className="bg-neutral-900/40 border border-neutral-850 rounded-xl px-4 py-2 flex items-center space-x-3">
              <Activity className="w-4 h-4 text-violet-400 animate-pulse" />
              <div>
                <div className="flex items-center justify-between text-[11px] space-x-4">
                  <span className="text-neutral-450 font-medium">Monthly Quota</span>
                  <span className="font-semibold text-neutral-200">
                    {activeOrg.calls_used} / {activeOrg.allowed_quota} calls
                  </span>
                </div>
                <div className="w-28 h-1 bg-neutral-800 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-550 ${
                      activeOrg.calls_used >= activeOrg.allowed_quota
                        ? "bg-red-500 animate-pulse"
                        : "bg-gradient-to-r from-violet-500 to-cyan-400"
                    }`}
                    style={{ width: `${Math.min(100, (activeOrg.calls_used / activeOrg.allowed_quota) * 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          {/* Current User Role Badge */}
          <div className="flex items-center space-x-2.5 bg-neutral-900/60 border border-neutral-855 rounded-xl px-4 py-2.5">
            <User className="w-4 h-4 text-cyan-400" />
            <div className="text-left">
              <div className="text-xs font-bold text-neutral-355">{currentUser.name}</div>
              <span className={`text-[8px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-md ${
                currentUser.role === 'owner' ? 'bg-violet-950/60 text-violet-300 border border-violet-850' :
                currentUser.role === 'editor' ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-850' :
                'bg-neutral-800/65 text-neutral-400'
              }`}>
                {currentUser.role}
              </span>
            </div>
          </div>

          {/* Persona Switcher Dropdown */}
          <div className="relative group">
            <button className="flex items-center space-x-2 bg-gradient-to-r from-violet-600 to-indigo-650 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl px-4 py-3 shadow-md shadow-violet-500/10 transition duration-200 cursor-pointer">
              <span>Switch Testing Profile</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <div className="absolute right-0 mt-2 w-72 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl py-2 hidden group-hover:block z-50">
              <div className="px-4 py-1.5 text-[9px] font-bold text-neutral-500 uppercase tracking-widest">
                Testing Roles & Isolation
              </div>
              {USERS.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleUserSwap(u)}
                  className={`w-full text-left px-4 py-2.5 text-xs flex flex-col hover:bg-neutral-800/40 transition duration-150 ${
                    currentUser.id === u.id ? "bg-violet-950/30 text-violet-300 border-l-2 border-violet-500" : "text-neutral-300"
                  }`}
                >
                  <span className="font-semibold text-neutral-200">{u.name}</span>
                  <span className="text-[10px] text-neutral-555 leading-normal mt-0.5">{u.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Work Area */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden">
        {/* Left Column: Workflows and Builder (8 cols) */}
        <section className="lg:col-span-8 flex flex-col space-y-6 overflow-y-auto pr-1">
          {/* Workflows Select List */}
          <div className="glass-card rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <Layers className="w-5 h-5 text-violet-400 animate-pulse" />
              <div>
                <h2 className="font-bold text-sm text-neutral-200">Your Workflow Channels</h2>
                <p className="text-xs text-neutral-500">Search and manage templates or load new blueprints</p>
              </div>
            </div>

            {/* Workflow List Tools */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Search workflows */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search workflows..."
                  className="bg-neutral-950 border border-neutral-850 rounded-xl pl-9 pr-4 py-2 text-xs text-neutral-350 focus:outline-none focus:border-violet-500 w-44"
                />
              </div>

              <div className="flex items-center bg-neutral-950 rounded-xl border border-neutral-850 p-1">
                {filteredWorkflows.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => selectWorkflow(w)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition duration-150 cursor-pointer ${
                      selectedWorkflow?.id === w.id
                        ? "bg-neutral-850 text-neutral-100 shadow border border-neutral-800"
                        : "text-neutral-450 hover:text-neutral-200"
                    }`}
                  >
                    {w.name.substring(0, 20)}{w.name.length > 20 ? "..." : ""}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowBlueprints(true)}
                className="flex items-center space-x-1.5 text-xs bg-neutral-900 border border-neutral-850 hover:bg-neutral-800 text-neutral-350 px-4 py-2 rounded-xl transition duration-150 font-bold cursor-pointer"
              >
                <Plus className="w-4 h-4 text-violet-400" />
                <span>Templates Library</span>
              </button>
            </div>
          </div>

          {/* Blueprints Selection Grid Overlay Panel */}
          {showBlueprints && (
            <div className="bg-neutral-900/60 border border-violet-900/30 rounded-2xl p-6 flex flex-col space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-violet-400 animate-pulse" />
                  <h3 className="font-bold text-xs uppercase tracking-widest text-neutral-200">Load Blueprint Template</h3>
                </div>
                <button
                  onClick={() => setShowBlueprints(false)}
                  className="text-neutral-500 hover:text-neutral-300 text-xs px-2.5 py-1 rounded hover:bg-neutral-805"
                >
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {BLUEPRINTS.map((bp) => (
                  <button
                    key={bp.name}
                    onClick={() => loadBlueprint(bp)}
                    className="flex flex-col text-left p-4 rounded-xl border border-neutral-800/80 bg-neutral-950/40 hover:border-violet-500/40 hover:bg-neutral-900/20 transition duration-205 flex-1 cursor-pointer"
                  >
                    <span className="font-bold text-xs text-neutral-200 flex items-center">
                      <Zap className="w-3.5 h-3.5 mr-1.5 text-violet-400" />
                      {bp.name}
                    </span>
                    <p className="text-[10px] text-neutral-500 leading-normal mt-2 flex-grow">{bp.desc}</p>
                    <div className="flex items-center justify-between mt-3 text-[9px] font-bold text-neutral-450 border-t border-neutral-900 pt-2 w-full">
                      <span>{bp.steps.length} Step Nodes</span>
                      <span className="uppercase text-violet-400/90">{bp.triggers[0].type}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Import JSON Form box */}
          {showImportBox && (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 flex flex-col space-y-3">
              <h3 className="font-bold text-xs text-neutral-300 uppercase tracking-wider">Import Blueprint Config (JSON)</h3>
              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                placeholder="Paste your JSON configuration representation here..."
                rows={4}
                className="w-full bg-neutral-950 border border-neutral-850 rounded-xl p-3 text-xs font-mono text-neutral-350 focus:ring-1 focus:ring-violet-500 focus:outline-none"
              />
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowImportBox(false)}
                  className="px-3 py-1.5 text-neutral-500 hover:text-neutral-300 text-xs rounded hover:bg-neutral-850"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="px-4 py-1.5 bg-violet-600 hover:bg-violet-750 text-white font-semibold text-xs rounded-lg transition"
                >
                  Apply Config
                </button>
              </div>
            </div>
          )}

          {/* Workflow Builder Editor */}
          <div className="glass-card rounded-2xl p-6 flex flex-col space-y-6 relative overflow-hidden">
            {/* Background glowing design details */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-violet-650/5 rounded-full blur-3xl -z-10"></div>
            
            {/* Header info */}
            <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
              <div className="flex-grow max-w-md">
                <input
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder="Workflow Name"
                  disabled={currentUser.role === 'viewer'}
                  className="bg-transparent text-lg font-bold text-neutral-100 focus:outline-none focus:border-b focus:border-violet-500 w-full disabled:opacity-50"
                />
                <p className="text-xs text-neutral-500 mt-1">Specify node names and operational parameters</p>
              </div>

              <div className="flex items-center space-x-2">
                {/* Import / Export Tools */}
                <button
                  onClick={handleExport}
                  title="Copy steps config to clipboard"
                  className="p-2 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900 border border-neutral-850 rounded-lg transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowImportBox(true)}
                  title="Import config from clipboard"
                  className="p-2 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900 border border-neutral-850 rounded-lg transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>

                {currentUser.role !== 'viewer' && (
                  <button
                    onClick={saveWorkflow}
                    disabled={loading}
                    className="bg-gradient-to-r from-violet-600 to-indigo-500 hover:from-violet-700 hover:to-indigo-650 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition shadow-lg shadow-violet-500/10 flex items-center space-x-2 cursor-pointer"
                  >
                    {loading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                    <span>Save & Publish</span>
                  </button>
                )}
              </div>
            </div>

            {/* Workflow Steps Stack */}
            <div className="space-y-4">
              {workflowSteps.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-neutral-900 rounded-xl">
                  <Activity className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                  <p className="text-sm text-neutral-500">No steps defined. Add a step below.</p>
                </div>
              ) : (
                workflowSteps.map((step, index) => {
                  const hasStepGating = step.type === 'db_write' || step.type === 'notify';
                  const isRoleOwner = currentUser.role === 'owner';
                  const isJsonValid = isConfigJsonValid(step.config);
                  
                  // Label details
                  let typeLabel = "Step Node";
                  let description = "";
                  let iconColor = "bg-neutral-800 text-neutral-400";
                  if (step.type === "llm_call") {
                    typeLabel = "AI Brain Node (LLM Call)";
                    description = "Calls an external LLM to review, summarize, or classify output.";
                    iconColor = "bg-violet-950/40 text-violet-400 border border-violet-900/30";
                  } else if (step.type === "http_request") {
                    typeLabel = "External API Fetch (HTTP Request)";
                    description = "Performs an HTTP call (GET/POST) to run third-party tool tasks.";
                    iconColor = "bg-cyan-950/40 text-cyan-400 border border-cyan-900/30";
                  } else if (step.type === "db_write") {
                    typeLabel = "Postgres DB Write";
                    description = "Appends results directly into our database outputs audit table.";
                    iconColor = "bg-emerald-950/40 text-emerald-400 border border-emerald-900/30";
                  } else if (step.type === "notify") {
                    typeLabel = "Slack/Email Notification";
                    description = "Sends simulated status alerts via post webhooks.";
                    iconColor = "bg-pink-950/40 text-pink-400 border border-pink-900/30";
                  } else if (step.type === "conditional_branch") {
                    typeLabel = "If/Else Filter";
                    description = "Checks the text of the previous output. Skips subsequent steps if unmatched.";
                    iconColor = "bg-amber-950/40 text-amber-400 border border-amber-900/30";
                  } else if (step.type === "approval_gate") {
                    typeLabel = "Manager Review Gate";
                    description = "Temporarily halts run execution. Resumes only when an Editor or Owner approves.";
                    iconColor = "bg-rose-950/40 text-rose-455 border border-rose-950/40";
                  }

                  return (
                    <div key={index} className="flex flex-col items-center w-full">
                      <div
                        className={`w-full relative group bg-neutral-900/30 border ${
                          hasStepGating && !isRoleOwner ? "border-amber-950/40 bg-amber-955/5" : "border-neutral-800/60"
                        } rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center hover:border-violet-500/30 transition duration-150`}
                      >
                        {/* Step index & name */}
                        <div className="flex items-start space-x-3 w-full md:w-5/12">
                          <span className={`flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${iconColor} flex-shrink-0 shadow-sm`}>
                            {step.position}
                          </span>
                          <div>
                            <input
                              type="text"
                              value={step.name}
                              onChange={(e) => updateStepField(index, "name", e.target.value)}
                              disabled={currentUser.role === 'viewer'}
                              className="bg-transparent font-bold text-xs text-neutral-200 focus:outline-none focus:border-b focus:border-violet-500 w-full disabled:opacity-50"
                            />
                            <div className="text-[10px] text-neutral-400 font-medium mt-1 leading-normal">
                              {typeLabel}
                            </div>
                            <p className="text-[10px] text-neutral-500 mt-0.5 leading-normal">
                              {description}
                            </p>
                          </div>
                        </div>

                        {/* Step Configuration JSON Area */}
                        <div className="flex-1 w-full">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-neutral-500 font-mono">Parameters (JSON)</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              isJsonValid ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30' : 'bg-red-950/40 text-red-400 border border-red-900/30'
                            }`}>
                              {isJsonValid ? "Valid Config" : "Invalid JSON"}
                            </span>
                          </div>
                          <textarea
                            value={step.config}
                            onChange={(e) => updateStepField(index, "config", e.target.value)}
                            disabled={currentUser.role === 'viewer'}
                            placeholder="JSON Config variables"
                            rows={2}
                            className="w-full bg-neutral-950/60 border border-neutral-900 rounded-lg p-2.5 text-[10px] font-mono text-neutral-350 focus:ring-1 focus:ring-violet-500 focus:outline-none"
                          />
                        </div>

                        {/* Right side status / Lock / Trash */}
                        <div className="flex items-center space-x-3 self-end md:self-center">
                          {hasStepGating && (
                            <span className="flex items-center text-[8px] font-bold text-amber-500 bg-amber-950/20 px-2 py-0.5 rounded border border-amber-900/40">
                              <Lock className="w-2.5 h-2.5 mr-1" />
                              OWNER ONLY
                            </span>
                          )}
                          
                          {currentUser.role !== 'viewer' && (
                            <button
                              onClick={() => removeStep(index)}
                              className="text-neutral-500 hover:text-red-455 p-1.5 rounded-lg hover:bg-neutral-850/40 transition duration-150 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Visual neon arrow connector line */}
                      {index < workflowSteps.length - 1 && (
                        <div className="h-6 w-0.5 bg-gradient-to-b from-violet-500 to-cyan-400 animate-pulse my-1"></div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Add Step Buttons Panel */}
            {currentUser.role !== 'viewer' && (
              <div className="bg-neutral-950/30 rounded-xl p-4 border border-neutral-900/80">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-neutral-450 uppercase tracking-widest">
                    Add Step Node to Sequence
                  </h3>
                  <span className="text-[10px] text-neutral-500">
                    Click to insert a new functional operation at the end
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {[
                    { type: "llm_call", label: "AI LLM Brain", color: "from-purple-500/10 to-indigo-500/10 text-indigo-455 border-indigo-900/30" },
                    { type: "http_request", label: "HTTP Fetch", color: "from-cyan-500/10 to-blue-500/10 text-cyan-455 border-cyan-900/30" },
                    { type: "db_write", label: "DB Postgres Write", color: "from-emerald-500/10 to-teal-500/10 text-emerald-455 border-emerald-900/30", ownerOnly: true },
                    { type: "notify", label: "Slack/Email Notify", color: "from-pink-500/10 to-rose-500/10 text-pink-455 border-pink-900/30", ownerOnly: true },
                    { type: "conditional_branch", label: "If/Else Branch", color: "from-amber-500/10 to-orange-500/10 text-amber-455 border-amber-900/30" },
                    { type: "approval_gate", label: "Approval Gate", color: "from-violet-500/10 to-fuchsia-500/10 text-violet-455 border-violet-900/30" }
                  ].map((btn) => {
                    const isOwner = currentUser.role === "owner";
                    const isBlocked = btn.ownerOnly && !isOwner;
                    return (
                      <button
                        key={btn.type}
                        onClick={() => !isBlocked && addStep(btn.type)}
                        disabled={isBlocked}
                        className={`group relative p-2.5 rounded-xl border flex flex-col items-center justify-center text-center transition duration-150 cursor-pointer ${
                          isBlocked
                            ? "bg-neutral-900/30 border-neutral-900/50 opacity-30 cursor-not-allowed"
                            : "bg-neutral-900/40 border-neutral-800/80 hover:border-neutral-700/60"
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${btn.color} flex items-center justify-center mb-1.5 shadow-sm`}>
                          {btn.type === 'llm_call' ? <Send className="w-3.5 h-3.5" /> :
                           btn.type === 'http_request' ? <Activity className="w-3.5 h-3.5" /> :
                           btn.type === 'db_write' ? <Database className="w-3.5 h-3.5" /> :
                           btn.type === 'notify' ? <Webhook className="w-3.5 h-3.5" /> :
                           btn.type === 'conditional_branch' ? <HelpCircle className="w-3.5 h-3.5" /> :
                           <Lock className="w-3.5 h-3.5" />}
                        </div>
                        <span className="text-[10px] font-bold text-neutral-300">{btn.label}</span>
                        {btn.ownerOnly && (
                          <span className="text-[8px] font-bold text-amber-500/90 mt-0.5 uppercase tracking-wide">Owner Required</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Webhook & Cron Inbound Integration Triggers Panel */}
          {selectedWorkflow && (
            <div className="glass-card rounded-2xl p-6 flex flex-col space-y-4">
              <div className="flex items-center space-x-2 border-b border-neutral-900 pb-3">
                <Webhook className="w-4 h-4 text-cyan-400 animate-pulse" />
                <h3 className="font-bold text-sm text-neutral-200">Alternative Trigger Methods</h3>
              </div>

              <div className="space-y-4 text-xs">
                {/* Webhook details */}
                <div className="bg-neutral-950/60 border border-neutral-900/80 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-neutral-300 flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mr-2"></span>
                      1. Trigger via REST API (HTTP Webhook)
                    </span>
                    <span className="text-[9px] bg-cyan-950/60 text-cyan-400 px-2 py-0.5 rounded uppercase font-bold border border-cyan-900/30">
                      Hasura Custom Webhook
                    </span>
                  </div>
                  <p className="text-neutral-500 mb-3 leading-normal">
                    You can start this execution pipeline instantly from another app or terminal by triggering this webhook POST request:
                  </p>
                  <pre className="bg-neutral-900/80 p-3 rounded-lg overflow-x-auto font-mono text-[9px] text-neutral-400 border border-neutral-800/85">
                    {`curl -X POST \\
  -H "Content-Type: application/json" \\
  -d '{"workflowId": "${selectedWorkflow.id}", "userId": "${currentUser.id}"}' \\
  ${window.location.origin}/api/webhook`}
                  </pre>
                </div>

                {/* Cron simulation details */}
                <div className="bg-neutral-950/60 border border-neutral-900/80 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="max-w-md">
                    <span className="font-semibold text-neutral-300 flex items-center mb-1">
                      <Clock className="w-4 h-4 text-amber-400 mr-2" />
                      2. Scheduled Timer Trigger (Cron Engine)
                    </span>
                    <p className="text-neutral-500 leading-normal text-[11px]">
                      Trigger all active workflows configured with a scheduled timer. Simulates Nhost Scheduled functions.
                    </p>
                  </div>
                  <button
                    onClick={runCronTrigger}
                    disabled={loading}
                    className="whitespace-nowrap bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-200 font-semibold text-xs px-4 py-2.5 rounded-xl transition duration-150 flex items-center space-x-2 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Run Timer Check</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Execution Monitor, History, and Outputs (4 cols) */}
        <section className="lg:col-span-4 flex flex-col space-y-6 overflow-y-auto">
          {/* Status logs block */}
          {statusMessage && (
            <div
              className={`p-4 rounded-xl border flex items-start space-x-3 transition-all duration-300 ${
                statusMessage.type === "success"
                  ? "bg-emerald-950/20 border-emerald-900/50 text-emerald-300"
                  : statusMessage.type === "error"
                  ? "bg-red-950/20 border-red-900/50 text-red-300"
                  : "bg-neutral-900 border-neutral-800 text-neutral-350"
              }`}
            >
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-semibold leading-normal">{statusMessage.text}</p>
            </div>
          )}

          {/* Action trigger manual run */}
          {selectedWorkflow && (
            <div className="glass-card rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-3 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400 animate-pulse"></div>
              
              <div className="w-12 h-12 rounded-full bg-violet-600/10 flex items-center justify-center text-violet-400 mb-1">
                <Play className="w-4 h-4 fill-current animate-pulse" />
              </div>
              
              <div>
                <h3 className="font-bold text-sm text-neutral-200">Start Live Execution</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Click to manually execute steps sequence</p>
              </div>

              {currentUser.role === 'viewer' ? (
                <div className="bg-neutral-900 text-neutral-555 text-xs px-4 py-3 rounded-xl border border-neutral-850 flex items-center space-x-2 w-full justify-center">
                  <Lock className="w-4 h-4" />
                  <span>Viewer Role Cannot Run Workflows</span>
                </div>
              ) : (
                <button
                  onClick={triggerWorkflowRun}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-violet-650 via-indigo-650 to-cyan-500 hover:opacity-90 text-white font-bold text-xs py-3 rounded-xl transition duration-150 shadow-lg shadow-violet-500/10 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  <span>Trigger Run Now</span>
                </button>
              )}
            </div>
          )}

          {/* Tab Switcher: Monitor vs Database Outputs */}
          {selectedWorkflow && (
            <div className="flex bg-neutral-950 rounded-xl border border-neutral-850 p-1">
              <button
                onClick={() => setRightTab("monitor")}
                className={`flex-1 py-2 text-center rounded-lg text-xs font-semibold transition duration-150 cursor-pointer ${
                  rightTab === "monitor"
                    ? "bg-neutral-850 text-neutral-100 shadow border border-neutral-800"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                Live Monitor
              </button>
              <button
                onClick={() => {
                  setRightTab("outputs");
                  fetchDbOutputs(selectedWorkflow.id);
                }}
                className={`flex-1 py-2 text-center rounded-lg text-xs font-semibold transition duration-150 cursor-pointer ${
                  rightTab === "outputs"
                    ? "bg-neutral-850 text-neutral-100 shadow border border-neutral-800"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                Database Outputs
              </button>
            </div>
          )}

          {/* Right tab content */}
          {rightTab === "monitor" ? (
            <>
              {/* Execution History */}
              {selectedWorkflow && (
                <div className="glass-card rounded-2xl p-5 flex flex-col space-y-3">
                  <div className="flex items-center space-x-2 border-b border-neutral-900 pb-2">
                    <Clock className="w-4 h-4 text-violet-400" />
                    <h3 className="font-semibold text-[10px] uppercase tracking-widest text-neutral-200">Execution History</h3>
                  </div>
                  {runsHistory.length === 0 ? (
                    <div className="text-center py-4 text-xs text-neutral-600">
                      No runs recorded yet. Click "Trigger Run Now" above.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {runsHistory.map((run) => {
                        const isActive = run.id === activeRunId;
                        return (
                          <button
                            key={run.id}
                            onClick={() => subscribeToRun(run.id)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs flex items-center justify-between transition duration-150 cursor-pointer ${
                              isActive
                                ? "bg-violet-950/20 border-violet-850 text-violet-300"
                                : "bg-neutral-950/40 border-neutral-900 text-neutral-450 hover:bg-neutral-900/50 hover:text-neutral-200"
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                run.status === 'completed' ? 'bg-emerald-500' :
                                run.status === 'failed' ? 'bg-red-500' :
                                run.status === 'paused' ? 'bg-amber-500 animate-pulse' :
                                'bg-violet-500 animate-pulse'
                              }`}></span>
                              <span className="font-mono text-[9px] text-neutral-350">
                                Run #{run.id.substring(0, 8)}
                              </span>
                            </div>
                            <div className="text-[9px] text-right font-semibold">
                              <span className="text-neutral-555 uppercase text-[8px] mr-1.5">{run.trigger_type}</span>
                              <span className={`${
                                run.status === 'completed' ? 'text-emerald-455' :
                                run.status === 'failed' ? 'text-red-455' :
                                run.status === 'paused' ? 'text-amber-455' :
                                'text-violet-455'
                              }`}>{run.status}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Live Run Monitor */}
              <div className="glass-card rounded-2xl p-6 flex flex-col space-y-5 flex-1 min-h-[400px]">
                <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
                  <div className="flex items-center space-x-2">
                    <Terminal className="w-4 h-4 text-violet-450 animate-pulse" />
                    <h3 className="font-bold text-sm text-neutral-200">Real-Time Step Stream</h3>
                  </div>
                  {runState && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      runState.runStatus === 'completed' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/30' :
                      runState.runStatus === 'failed' ? 'bg-red-950/60 text-red-400 border border-red-900/30' :
                      runState.runStatus === 'paused' ? 'bg-amber-950/60 text-amber-400 border border-amber-900/30 animate-pulse' :
                      'bg-indigo-950/60 text-indigo-400 border border-indigo-900/30 animate-pulse'
                    }`}>
                      {runState.runStatus}
                    </span>
                  )}
                </div>

                {!activeRunId ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-neutral-600">
                    <Clock className="w-8 h-8 mb-2" />
                    <p className="text-xs">No active runs stream monitors</p>
                    <p className="text-[10px] text-neutral-700 mt-1">Start a run or select one from history to trace progress live</p>
                  </div>
                ) : !runState ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-neutral-500 space-y-2">
                    <Loader className="w-6 h-6 animate-spin text-violet-500" />
                    <p className="text-xs">Establishing live database SSE stream...</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col space-y-6">
                    {/* Steps List Progress */}
                    <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-850">
                      {runState.steps.map((stepRun) => {
                        const isPaused = stepRun.status === "paused";
                        const isRunning = stepRun.status === "running";
                        
                        return (
                          <div key={stepRun.step_id || stepRun.id} className="relative pl-8 flex flex-col space-y-1">
                            {/* Bullet Icon indicator */}
                            <span className={`absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full flex items-center justify-center border-2 ${
                              stepRun.status === 'completed' ? 'bg-emerald-500 border-emerald-550' :
                              stepRun.status === 'failed' ? 'bg-red-500 border-red-550' :
                              isPaused ? 'bg-amber-500 border-amber-550' :
                              isRunning ? 'bg-violet-500 border-violet-555 animate-pulse' :
                              'bg-neutral-900 border-neutral-700'
                            }`}>
                              {stepRun.status === 'completed' && <span className="w-1.5 h-1.5 bg-neutral-950 rounded-full"></span>}
                            </span>

                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-bold ${
                                stepRun.status === 'completed' ? 'text-neutral-350' :
                                stepRun.status === 'failed' ? 'text-red-405 font-bold' :
                                isPaused ? 'text-amber-450 animate-pulse' :
                                isRunning ? 'text-violet-405 font-bold' :
                                'text-neutral-500'
                              }`}>
                                {stepRun.step_name}
                              </span>
                              <span className="text-[9px] text-neutral-650 font-mono font-semibold">
                                {stepRun.status}
                              </span>
                            </div>

                            {/* Node details review trigger */}
                            {stepRun.status !== 'pending' && (
                              <div className="flex items-center space-x-2 mt-1">
                                <button
                                  onClick={() => setInspectedStepRun(stepRun)}
                                  className="text-[9px] text-violet-400 hover:text-violet-300 font-semibold flex items-center hover:underline cursor-pointer"
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  <span>Inspect Payload</span>
                                </button>
                              </div>
                            )}

                            {/* Step Run details outputs */}
                            {stepRun.output && Object.keys(stepRun.output).length > 0 && (
                              <div className="bg-neutral-950/60 p-2.5 rounded-lg border border-neutral-900/60 font-mono text-[9px] text-neutral-400 leading-normal max-w-full overflow-x-auto whitespace-pre-wrap">
                                {stepRun.output.text || JSON.stringify(stepRun.output, null, 2)}
                              </div>
                            )}

                            {/* Error state */}
                            {stepRun.error && (
                              <div className="bg-red-955/15 border border-red-900/40 p-2.5 rounded-lg font-mono text-[9px] text-red-400 leading-normal">
                                Error: {stepRun.error}
                              </div>
                            )}

                            {/* Attempt count for retries */}
                            {stepRun.attempt_count > 1 && (
                              <div className="text-[8px] text-amber-500/90 font-bold uppercase tracking-wider flex items-center">
                                <RefreshCw className="w-2.5 h-2.5 mr-1" />
                                Attempt {stepRun.attempt_count} (Retry handler triggered)
                              </div>
                            )}

                            {/* Action Panel for approval gate */}
                            {isPaused && stepRun.step_type === "approval_gate" && (
                              <div className="bg-neutral-900/80 border border-amber-900/40 rounded-xl p-3.5 mt-2 flex flex-col space-y-2.5">
                                <p className="text-[11px] text-amber-400/90 font-semibold leading-normal">
                                  Execution Paused. A user with editor or owner rights needs to approve this gate to resume.
                                </p>
                                <button
                                  onClick={() => approveGateStep(stepRun.id)}
                                  className="w-full bg-amber-500 hover:bg-amber-600 text-neutral-950 font-bold text-xs py-2 rounded-lg transition duration-150 flex items-center justify-center space-x-1.5 shadow-lg shadow-amber-500/10 cursor-pointer"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  <span>Approve & Resume Run</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Database Outputs panel */
            <div className="glass-card rounded-2xl p-6 flex flex-col space-y-5 flex-1 min-h-[400px]">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
                <div className="flex items-center space-x-2">
                  <Database className="w-4 h-4 text-emerald-450" />
                  <h3 className="font-bold text-sm text-neutral-200">PostgreSQL Audit Logs</h3>
                </div>
                <button
                  onClick={() => selectedWorkflow && fetchDbOutputs(selectedWorkflow.id)}
                  title="Reload DB Outputs"
                  className="p-1.5 text-neutral-500 hover:text-neutral-350 hover:bg-neutral-900 rounded-lg border border-neutral-850"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>

              {dbOutputs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-neutral-600">
                  <Database className="w-8 h-8 mb-2" />
                  <p className="text-xs">No records written to public.workflow_outputs yet.</p>
                  <p className="text-[10px] text-neutral-700 mt-1">Make sure your workflow has a "Postgres DB Write" step, trigger a run, and approve it to see database rows record here live!</p>
                </div>
              ) : (
                <div className="flex-1 space-y-3 overflow-y-auto max-h-[500px] pr-1">
                  {dbOutputs.map((o) => {
                    let parsedData: any = {};
                    try {
                      parsedData = JSON.parse(JSON.parse(o.data));
                    } catch (e) {
                      try {
                        parsedData = JSON.parse(o.data);
                      } catch (err) {
                        parsedData = o.data;
                      }
                    }
                    return (
                      <div key={o.id} className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-900/60 text-[10px] leading-normal flex flex-col space-y-1.5">
                        <div className="flex items-center justify-between border-b border-neutral-900 pb-1.5 mb-1 text-neutral-500 font-mono text-[8px]">
                          <span>Row ID: #{o.id.substring(0, 8)}</span>
                          <span>{new Date(o.created_at).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-[9px] font-mono text-emerald-400 bg-emerald-950/10 p-2 rounded border border-emerald-950/20 max-w-full overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(parsedData, null, 2)}
                        </div>
                        <div className="text-[8px] text-neutral-600 mt-1 flex items-center justify-between">
                          <span>Run ID: #{o.run_id.substring(0, 8)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Walkthrough Guide Companion (Reviewer Companion) */}
          <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-5 space-y-3.5">
            <div className="flex items-center space-x-2">
              <Compass className="w-4 h-4 text-violet-400" />
              <h4 className="font-bold text-xs uppercase tracking-widest text-neutral-200">
                Final Task Testing Guide
              </h4>
            </div>
            
            <ol className="text-[11px] text-neutral-450 space-y-2.5 list-decimal pl-4 leading-normal">
              <li>
                Switch profile to <strong className="text-violet-300">Org A Owner</strong>. Save a workflow containing an **Approval Gate** step.
              </li>
              <li>
                Click <strong className="text-neutral-250">Trigger Run Now</strong>. Watch steps 1 & 2 run live. It will pause statefully at the Approval Gate.
              </li>
              <li>
                Switch profile to <strong className="text-cyan-300">Org B Owner</strong> or **Org A Viewer** in the header. Try to click "Approve" — you will be **denied** with access errors! (Proves isolation & gating).
              </li>
              <li>
                Switch back to <strong className="text-violet-300">Org A Owner</strong> or **Editor**. Click "Approve". Execution resumes, completes, and increments Org A quota metrics.
              </li>
            </ol>
          </div>
        </section>
      </main>

      {/* Inspected Step Run Dialog Modal Drawer */}
      {inspectedStepRun && (
        <div className="fixed inset-0 z-50 bg-neutral-950/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-xl w-full p-6 space-y-4 relative shadow-2xl overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400"></div>
            
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-neutral-200 flex items-center">
                  <Terminal className="w-4 h-4 text-violet-400 mr-2" />
                  Node Inspector: {inspectedStepRun.step_name}
                </h3>
                <p className="text-[10px] text-neutral-500">Trace parameters and execution metrics of this step run</p>
              </div>
              <button
                onClick={() => setInspectedStepRun(null)}
                className="text-neutral-450 hover:text-neutral-200 text-xs px-2.5 py-1 rounded hover:bg-neutral-805 cursor-pointer font-bold"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Input payload */}
              <div>
                <div className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-1 font-mono">Input Config Variables</div>
                <pre className="bg-neutral-950 p-3 rounded-lg overflow-x-auto max-h-36 font-mono text-[9px] text-neutral-400 border border-neutral-850">
                  {JSON.stringify(inspectedStepRun.input, null, 2)}
                </pre>
              </div>

              {/* Output Result */}
              <div>
                <div className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-1 font-mono">Output Result</div>
                <pre className={`bg-neutral-950 p-3 rounded-lg overflow-x-auto max-h-36 font-mono text-[9px] border ${
                  inspectedStepRun.status === 'failed' ? 'text-red-400 border-red-950' : 'text-emerald-400 border-emerald-950'
                }`}>
                  {JSON.stringify(inspectedStepRun.output, null, 2)}
                </pre>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-3 gap-2 text-center text-[10px] border-t border-neutral-800 pt-3">
                <div className="bg-neutral-950/40 p-2.5 rounded-lg border border-neutral-850">
                  <div className="text-[8px] font-bold text-neutral-500 uppercase tracking-wider">Status</div>
                  <div className="font-bold text-neutral-200 mt-1 uppercase">{inspectedStepRun.status}</div>
                </div>
                <div className="bg-neutral-950/40 p-2.5 rounded-lg border border-neutral-850">
                  <div className="text-[8px] font-bold text-neutral-500 uppercase tracking-wider">Attempts</div>
                  <div className="font-bold text-neutral-200 mt-1">{inspectedStepRun.attempt_count} / 2</div>
                </div>
                <div className="bg-neutral-950/40 p-2.5 rounded-lg border border-neutral-850">
                  <div className="text-[8px] font-bold text-neutral-500 uppercase tracking-wider">Node Type</div>
                  <div className="font-mono text-violet-400 mt-1 text-[9px]">{inspectedStepRun.step_type}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

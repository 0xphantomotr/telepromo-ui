import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import "./App.css";
import { api, API_BASE } from "./lib/api";

const POLL_INTERVAL_MS = 6000;

const WORKFLOW_NODE_WIDTH = 180;
const WORKFLOW_NODE_HEIGHT = 88;

type SessionItem = {
  name: string;
  proxy: boolean;
  username?: string;
  phone?: string;
  last_used?: string;
};

type JobItem = {
  id: string;
  type: string;
  status: string;
  sessions?: string[];
  created_at?: string;
  updated_at?: string;
  error?: string;
  meta?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

type CommonOptions = {
  use_spintax: boolean;
  media_path: string;
  preset_name: string;
  exclude_bots: boolean;
  exclude_deleted: boolean;
  last_seen_days: string;
  whitelist_path: string;
  blacklist_path: string;
  max_users: string;
};

type DmForm = CommonOptions & {
  session: string;
  input_file: string;
  message: string;
};

type InviteForm = CommonOptions & {
  session: string;
  input_file: string;
  invite_url: string;
  message: string;
};

type BulkAddForm = CommonOptions & {
  session: string;
  input_file: string;
  target_ref: string;
};

type ForwardForm = CommonOptions & {
  session: string;
  input_file: string;
  source_peer: string;
  message_id: string;
  message_link: string;
  drop_author: boolean;
  has_media: boolean;
};

type ProfileForm = {
  session: string;
  first_name: string;
  last_name: string;
  bio: string;
  photo: string;
};

type WarmupForm = {
  session: string;
  targets: string;
  preset_name: string;
};


type PresetItem = {
  name: string;
  kind?: string;
  interval_seconds: number;
  strict_timing: boolean;
  rate_mode: string;
  max_wait_seconds: number;
  max_flood_waits: number;
  max_consecutive_errors: number;
  min_delay?: number | null;
  max_delay?: number | null;
  total_messages?: number | null;
};

type PresetForm = {
  name: string;
  kind: string;
  interval_seconds: string;
  strict_timing: boolean;
  rate_mode: string;
  max_wait_seconds: string;
  max_flood_waits: string;
  max_consecutive_errors: string;
  min_delay: string;
  max_delay: string;
  total_messages: string;
};

type SessionProxyForm = {
  session: string;
  proxy_type: string;
  hostname: string;
  port: string;
  username: string;
  password: string;
  secret: string;
};


type WorkflowNode = {
  id: string;
  type: string;
  config: Record<string, unknown>;
  position?: { x: number; y: number } | null;
};

type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  condition?: string | null;
};

type WorkflowItem = {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  meta?: Record<string, unknown>;
  version?: number;
};

type WorkflowDraft = {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  meta: Record<string, unknown>;
};

type MultiForm = CommonOptions & {
  input_file: string;
  message: string;
};

type MultiInviteForm = CommonOptions & {
  input_file: string;
  invite_url: string;
  message: string;
};

type MultiBulkAddForm = CommonOptions & {
  input_file: string;
  target_ref: string;
};

type MultiForwardForm = CommonOptions & {
  input_file: string;
  source_peer: string;
  message_id: string;
  message_link: string;
  drop_author: boolean;
  has_media: boolean;
};

type MultiProfileForm = {
  delay_seconds: string;
  first_name: string;
  last_name: string;
  bio: string;
  photo: string;
};

type MultiWarmupForm = {
  targets: string;
  preset_name: string;
};


const baseOptions: CommonOptions = {
  use_spintax: false,
  media_path: "",
  preset_name: "",
  exclude_bots: true,
  exclude_deleted: true,
  last_seen_days: "",
  whitelist_path: "",
  blacklist_path: "",
  max_users: "",
};

const defaultPresetForm: PresetForm = {
  name: "",
  kind: "dm",
  interval_seconds: "600",
  strict_timing: true,
  rate_mode: "1",
  max_wait_seconds: "3600",
  max_flood_waits: "3",
  max_consecutive_errors: "5",
  min_delay: "600",
  max_delay: "1800",
  total_messages: "12",
};

const defaultProxyForm: SessionProxyForm = {
  session: "",
  proxy_type: "socks5",
  hostname: "",
  port: "",
  username: "",
  password: "",
  secret: "",
};


const defaultWorkflowDraft: WorkflowDraft = {
  id: "",
  name: "",
  nodes: [
    {
      id: "session1",
      type: "session",
      config: { mode: "single", sessions: [] },
      position: { x: 40, y: 40 },
    },
  ],
  edges: [],
  meta: {},
};

const toInt = (value: string, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toOptionalInt = (value: string) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const buildTargeting = (form: CommonOptions) => ({
  exclude_bots: form.exclude_bots,
  exclude_deleted: form.exclude_deleted,
  last_seen_days: form.last_seen_days ? toOptionalInt(form.last_seen_days) : null,
  whitelist_path: form.whitelist_path || undefined,
  blacklist_path: form.blacklist_path || undefined,
  max_users: form.max_users ? toInt(form.max_users, 0) : 0,
});

function App() {
  const [connected, setConnected] = useState(false);
  const [healthMessage, setHealthMessage] = useState("Checking backend...");
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [proxyForm, setProxyForm] = useState<SessionProxyForm>(defaultProxyForm);
  const [aiProvider, setAiProvider] = useState("openai");
  const [aiKey, setAiKey] = useState("");
  const [aiHasKey, setAiHasKey] = useState(false);
  const [aiModel, setAiModel] = useState("");
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const selectedJobRef = useRef<string>("");
  const [actionsLog, setActionsLog] = useState<string[]>([]);
  const [auditLog, setAuditLog] = useState<string[]>([]);
  const [lastLogPath, setLastLogPath] = useState<string | null>(null);
  const [lastAuditPath, setLastAuditPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [workflowDraft, setWorkflowDraft] = useState<WorkflowDraft>(defaultWorkflowDraft);
  const [presetForm, setPresetForm] = useState<PresetForm>(defaultPresetForm);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const canvasPanelRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorPos, setInspectorPos] = useState({ x: 0, y: 0 });

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "sessions", label: "Sessions" },
    { id: "presets", label: "Craft presets" },
    { id: "workflows", label: "Humanistic loops" },
    { id: "single", label: "Single" },
    { id: "multi", label: "Multi" },
    { id: "jobs", label: "Jobs" },
    { id: "logs", label: "Logs" },
  ];
  const [activeTab, setActiveTab] = useState("overview");

  const selectedNode = useMemo(
    () => workflowDraft.nodes.find((node) => node.id === selectedNodeId) || null,
    [workflowDraft.nodes, selectedNodeId]
  );
  const workflowHasSession = useMemo(
    () => workflowDraft.nodes.some((node) => node.type === "session"),
    [workflowDraft.nodes]
  );
  const dmPresets = useMemo(
    () => presets.filter((preset) => (preset.kind || "dm") === "dm"),
    [presets]
  );
  const warmupPresets = useMemo(
    () => presets.filter((preset) => (preset.kind || "dm") === "warmup"),
    [presets]
  );
  const presetNames = useMemo(() => dmPresets.map((preset) => preset.name), [dmPresets]);
  const warmupPresetNames = useMemo(
    () => warmupPresets.map((preset) => preset.name),
    [warmupPresets]
  );

  const presetOptions = useMemo(() => dmPresets, [dmPresets]);

  const nodeLookup = useMemo(
    () => new Map(workflowDraft.nodes.map((node) => [node.id, node])),
    [workflowDraft.nodes]
  );
  const workflowRunning = useMemo(
    () => Boolean(workflowDraft.meta?.running),
    [workflowDraft.meta]
  );

  const [dmForm, setDmForm] = useState<DmForm>({
    session: "",
    input_file: "data/shqipo.csv",
    message: "",
    ...baseOptions,
  });
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    session: "",
    input_file: "data/shqipo.csv",
    invite_url: "",
    message: "",
    ...baseOptions,
  });
  const [bulkAddForm, setBulkAddForm] = useState<BulkAddForm>({
    session: "",
    input_file: "data/shqipo.csv",
    target_ref: "",
    ...baseOptions,
  });
  const [forwardForm, setForwardForm] = useState<ForwardForm>({
    session: "",
    input_file: "data/shqipo.csv",
    source_peer: "",
    message_id: "",
    message_link: "",
    drop_author: false,
    has_media: false,
    ...baseOptions,
  });
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    session: "",
    first_name: "",
    last_name: "",
    bio: "",
    photo: "",
  });
  const [warmupForm, setWarmupForm] = useState<WarmupForm>({
    session: "",
    targets: "",
    preset_name: "",
  });


  const [multiForm, setMultiForm] = useState<MultiForm>({
    input_file: "data/shqipo.csv",
    message: "",
    ...baseOptions,
  });
  const [multiInviteForm, setMultiInviteForm] = useState<MultiInviteForm>({
    input_file: "data/shqipo.csv",
    invite_url: "",
    message: "",
    ...baseOptions,
  });
  const [multiBulkAddForm, setMultiBulkAddForm] = useState<MultiBulkAddForm>({
    input_file: "data/shqipo.csv",
    target_ref: "",
    ...baseOptions,
  });
  const [multiForwardForm, setMultiForwardForm] = useState<MultiForwardForm>({
    input_file: "data/shqipo.csv",
    source_peer: "",
    message_id: "",
    message_link: "",
    drop_author: false,
    has_media: false,
    ...baseOptions,
  });
  const [multiProfileForm, setMultiProfileForm] = useState<MultiProfileForm>({
    delay_seconds: "5",
    first_name: "",
    last_name: "",
    bio: "",
    photo: "",
  });
  const [multiWarmupForm, setMultiWarmupForm] = useState<MultiWarmupForm>({
    targets: "",
    preset_name: "",
  });

  const [multiSessions, setMultiSessions] = useState<string[]>([]);

  const [renameSession, setRenameSession] = useState({ old_name: "", new_name: "" });
  const [deleteSession, setDeleteSession] = useState("");
  const [importDir, setImportDir] = useState("");
  const [mergeFiles, setMergeFiles] = useState("");
  const [mergeOutput, setMergeOutput] = useState("merged.csv");

  const sessionOptions = useMemo(() => sessions, [sessions]);


  const refreshHealth = async () => {
    try {
      const res = await api.health();
      setConnected(Boolean(res.ok));
      setHealthMessage(res.ok ? "Backend online" : "Backend offline");
    } catch (err: any) {
      setConnected(false);
      setHealthMessage("Backend offline");
    }
  };

  const refreshSessions = async () => {
    try {
      const res = await api.sessions();
      setSessions(res.sessions || []);
    } catch (err: any) {
      setError(err.message || "Failed to load sessions");
    }
  };

  const loadSessionProxy = async (sessionName: string) => {
    if (!sessionName) {
      setProxyForm(defaultProxyForm);
      return;
    }
    try {
      const res = await api.sessionProxy(sessionName);
      if (res.proxy) {
        setProxyForm({
          session: sessionName,
          proxy_type: res.proxy.proxy_type || "socks5",
          hostname: res.proxy.hostname || "",
          port: res.proxy.port ? String(res.proxy.port) : "",
          username: res.proxy.username || "",
          password: res.proxy.password || "",
          secret: res.proxy.secret || "",
        });
      } else {
        setProxyForm({ ...defaultProxyForm, session: sessionName });
      }
    } catch (err: any) {
      setError(err.message || "Failed to load proxy config");
    }
  };

  const handleSaveProxy = async () => {
    if (!proxyForm.session) {
      setError("Select a session first");
      return;
    }
    const port = proxyForm.port ? Number(proxyForm.port) : 0;
    if (!proxyForm.hostname || !port) {
      setError("Proxy host and port are required");
      return;
    }
    if (proxyForm.proxy_type === "mtproxy" && !proxyForm.secret) {
      setError("MTProxy secret is required");
      return;
    }
    try {
      await api.saveSessionProxy(proxyForm.session, {
        proxy_type: proxyForm.proxy_type,
        hostname: proxyForm.hostname.trim(),
        port,
        username: proxyForm.username || undefined,
        password: proxyForm.password || undefined,
        secret: proxyForm.secret || undefined,
      });
      updateNotice("Proxy saved");
      refreshSessions();
    } catch (err: any) {
      setError(err.message || "Failed to save proxy");
    }
  };

  const handleClearProxy = async () => {
    if (!proxyForm.session) {
      setError("Select a session first");
      return;
    }
    try {
      await api.deleteSessionProxy(proxyForm.session);
      setProxyForm({ ...defaultProxyForm, session: proxyForm.session });
      updateNotice("Proxy removed");
      refreshSessions();
    } catch (err: any) {
      setError(err.message || "Failed to remove proxy");
    }
  };

  const loadAiSettings = async () => {
    try {
      const res = await api.aiSettings();
      const provider = res.provider || "openai";
      setAiProvider(provider);
      const fallbackModel = provider === "gemini" ? "gemini-2.5-flash" : "gpt-4o-mini";
      setAiModel(res.model || fallbackModel);
      setAiHasKey(Boolean(res.has_key));
    } catch (err: any) {
      setError(err.message || "Failed to load AI settings");
    }
  };

  const handleSaveAiSettings = async () => {
    if (!aiKey.trim()) {
      setError("Enter an API key to save");
      return;
    }
    try {
      const modelValue = aiModel.trim() || null;
      const res = await api.saveAiSettings({
        provider: aiProvider,
        api_key: aiKey.trim(),
        model: modelValue,
      });
      setAiHasKey(Boolean(res.has_key));
      setAiKey("");
      updateNotice("AI key saved");
    } catch (err: any) {
      setError(err.message || "Failed to save AI key");
    }
  };

  const handleClearAiSettings = async () => {
    try {
      const modelValue = aiModel.trim() || null;
      const res = await api.saveAiSettings({ provider: aiProvider, api_key: "", model: modelValue });
      setAiHasKey(Boolean(res.has_key));
      setAiKey("");
      updateNotice("AI key cleared");
    } catch (err: any) {
      setError(err.message || "Failed to clear AI key");
    }
  };

  const refreshWorkflows = async () => {
    try {
      const res = await api.workflows();
      const list = (res.workflows || []) as WorkflowItem[];
      setWorkflows(list);
    } catch (err) {
      console.warn("Failed to load workflows", err);
    }
  };

  const refreshPresets = async () => {
    try {
      const res = await api.presets();
      setPresets(res.presets || []);
    } catch (err: any) {
      setError(err.message || "Failed to load presets");
    }
  };

  const refreshLogs = async () => {
    try {
      const jobId = selectedJobRef.current || undefined;
      const actions = await api.actionsLog(120, jobId);
      setActionsLog(actions.lines || []);
      setLastLogPath(actions.path);
      const audit = await api.auditLog(120, jobId);
      setAuditLog(audit.lines || []);
      setLastAuditPath(audit.path);
    } catch (err: any) {
      setError(err.message || "Failed to load logs");
    }
  };

  const refreshJobs = async () => {
    try {
      const res = await api.jobs();
      const list = (res.jobs || []) as JobItem[];
      setJobs(list);
      if (!selectedJobRef.current && list.length) {
        const sorted = [...list].sort((a, b) => (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""));
        if (sorted[0]?.id) {
          setSelectedJobId(sorted[0].id);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to load jobs");
    }
  };

  useEffect(() => {
    refreshHealth();
    refreshSessions();
    loadAiSettings();
    refreshPresets();
    refreshWorkflows();
    refreshLogs();
    refreshJobs();
    const interval = setInterval(() => {
      refreshHealth();
      refreshLogs();
      refreshJobs();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    selectedJobRef.current = selectedJobId;
    refreshLogs();
  }, [selectedJobId]);

  useEffect(() => {
    const first = sessionOptions[0]?.name;
    if (!first) {
      return;
    }
    setDmForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setInviteForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setBulkAddForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setForwardForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setProfileForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setWarmupForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setProxyForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setDeleteSession((prev) => prev || first);
    setRenameSession((prev) => (prev.old_name ? prev : { ...prev, old_name: first }));
    if (multiSessions.length === 0) {
      setMultiSessions([first]);
    }
  }, [sessionOptions]);

  useEffect(() => {
    if (!proxyForm.session) {
      return;
    }
    loadSessionProxy(proxyForm.session);
  }, [proxyForm.session]);

  useEffect(() => {
    if (!workflowDraft.id.trim() && workflowDraft.nodes.some((node) => node.type === "session")) {
      setWorkflowDraft((draft) => ({
        ...draft,
        id: `wf_${Date.now().toString(36)}`,
      }));
    }
  }, [workflowDraft.id, workflowDraft.nodes]);

  useEffect(() => {
    const firstPreset = presets[0]?.name;
    if (!firstPreset) {
      return;
    }
    setDmForm((prev) => (prev.preset_name ? prev : { ...prev, preset_name: firstPreset }));
    setInviteForm((prev) => (prev.preset_name ? prev : { ...prev, preset_name: firstPreset }));
    setBulkAddForm((prev) => (prev.preset_name ? prev : { ...prev, preset_name: firstPreset }));
    setForwardForm((prev) => (prev.preset_name ? prev : { ...prev, preset_name: firstPreset }));
    setMultiForm((prev) => (prev.preset_name ? prev : { ...prev, preset_name: firstPreset }));
    setMultiInviteForm((prev) => (prev.preset_name ? prev : { ...prev, preset_name: firstPreset }));
    setMultiBulkAddForm((prev) => (prev.preset_name ? prev : { ...prev, preset_name: firstPreset }));
    setMultiForwardForm((prev) => (prev.preset_name ? prev : { ...prev, preset_name: firstPreset }));
  }, [presets]);

  useEffect(() => {
    if (warmupPresets.length === 0) {
      return;
    }
    const firstWarmup = warmupPresets[0]?.name;
    if (!firstWarmup) {
      return;
    }
    setWarmupForm((prev) => (prev.preset_name ? prev : { ...prev, preset_name: firstWarmup }));
    setMultiWarmupForm((prev) => (prev.preset_name ? prev : { ...prev, preset_name: firstWarmup }));
  }, [warmupPresets]);

  useEffect(() => {
    if (!draggingNode) return;

    const handleMove = (event: MouseEvent) => {
      const bounds = canvasRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const scaledX = x / zoom - draggingNode.offsetX;
      const scaledY = y / zoom - draggingNode.offsetY;
      const maxX = bounds.width / zoom - WORKFLOW_NODE_WIDTH;
      const maxY = bounds.height / zoom - WORKFLOW_NODE_HEIGHT;
      setWorkflowDraft((draft) => ({
        ...draft,
        nodes: draft.nodes.map((node) =>
          node.id === draggingNode.id
            ? {
                ...node,
                position: {
                  x: Math.max(0, Math.min(scaledX, maxX)),
                  y: Math.max(0, Math.min(scaledY, maxY)),
                },
              }
            : node
        ),
      }));
    };

    const handleUp = () => setDraggingNode(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingNode, zoom]);

  useEffect(() => {
    if (!panning) return;

    const handleMove = (event: MouseEvent) => {
      const dx = event.clientX - panning.startX;
      const dy = event.clientY - panning.startY;
      setCanvasOffset({
        x: panning.originX + dx,
        y: panning.originY + dy,
      });
    };

    const handleUp = () => setPanning(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [panning]);

  const updateNotice = (message: string) => {
    setNotice(message);
    setError(null);
  };

  const handleJobStart = async (label: string, jobPromise: Promise<{ job_id: string }>) => {
    setError(null);
    try {
      const res = await jobPromise;
      updateNotice(`${label} started: ${res.job_id}`);
      setSelectedJobId(res.job_id);
      refreshJobs();
    } catch (err: any) {
      setError(err.message || `Failed to start ${label}`);
    }
  };

  const addWorkflowNode = (type: string) => {
    if (type !== "session" && !workflowDraft.nodes.some((node) => node.type === "session")) {
      setError("Add a Session node before adding other blocks.");
      return;
    }
    const id = `node_${type}_${Date.now()}`;
    let config: Record<string, unknown> = {};
    if (type === "session") {
      config = { mode: "single", sessions: [] };
    } else if (type === "wait") {
      config = { min_seconds: 600, max_seconds: 900 };
    } else if (type === "dm") {
      config = { preset_name: presetNames[0] || "", message: "", input_file: "data/shqipo.csv", repeat_min: 1, repeat_max: 1 };
    } else if (type === "invite") {
      config = { preset_name: presetNames[0] || "", invite_url: "", message: "", input_file: "data/shqipo.csv", repeat_min: 1, repeat_max: 1 };
    } else if (type === "bulk_add") {
      config = { preset_name: presetNames[0] || "", target_ref: "", input_file: "data/shqipo.csv", repeat_min: 1, repeat_max: 1 };
    } else if (type === "forward") {
      config = { preset_name: presetNames[0] || "", message_link: "", drop_author: false, input_file: "data/shqipo.csv", repeat_min: 1, repeat_max: 1 };
    } else if (type === "warmup") {
      config = { preset_name: warmupPresetNames[0] || "", targets: "me", input_file: "data/shqipo.csv", repeat_min: 1, repeat_max: 1 };
    }

    setWorkflowDraft((draft) => {
      const nextId = !draft.id.trim() && type === "session" ? `wf_${Date.now().toString(36)}` : draft.id;
      return {
        ...draft,
        id: nextId,
        nodes: [
          ...draft.nodes,
          {
            id,
            type,
            config,
            position: {
              x: 40 + draft.nodes.length * 32,
              y: 40 + draft.nodes.length * 28,
            },
          },
        ],
      };
    });
    setSelectedNodeId(id);
  };

  const updateWorkflowNodeConfig = (nodeId: string, patch: Record<string, unknown>) => {
    setWorkflowDraft((draft) => ({
      ...draft,
      nodes: draft.nodes.map((node) =>
        node.id === nodeId ? { ...node, config: { ...node.config, ...patch } } : node
      ),
    }));
  };

  const removeWorkflowNode = (nodeId: string) => {
    setWorkflowDraft((draft) => ({
      ...draft,
      nodes: draft.nodes.filter((node) => node.id !== nodeId),
      edges: draft.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    }));
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
    if (linkFrom === nodeId) {
      setLinkFrom(null);
    }
  };


  const removeWorkflowLinks = (sourceId: string) => {
    setWorkflowDraft((draft) => ({
      ...draft,
      edges: draft.edges.filter((edge) => edge.source !== sourceId),
    }));
    if (linkFrom === sourceId) {
      setLinkFrom(null);
    }
  };

  const addWorkflowEdge = (source: string, target: string) => {
    if (source === target) return;
    setWorkflowDraft((draft) => {
      const filteredEdges = draft.edges.filter((edge) => edge.source !== source);
      if (filteredEdges.some((edge) => edge.source === source && edge.target === target)) {
        return { ...draft, edges: filteredEdges };
      }
      const edge: WorkflowEdge = {
        id: `edge_${source}_${target}_${Date.now()}`,
        source,
        target,
      };
      return { ...draft, edges: [...filteredEdges, edge] };
    });
  };

  const handleNodeMouseDown = (event: ReactMouseEvent<HTMLDivElement>, node: WorkflowNode) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setSelectedNodeId(node.id);
    setDraggingNode({
      id: node.id,
      offsetX: (event.clientX - bounds.left) / zoom - (node.position?.x ?? 0),
      offsetY: (event.clientY - bounds.top) / zoom - (node.position?.y ?? 0),
    });
  };

  const handleNodeClick = (event: ReactMouseEvent<HTMLDivElement>, node: WorkflowNode) => {
    if (linkFrom && linkFrom !== node.id) {
      addWorkflowEdge(linkFrom, node.id);
      setLinkFrom(null);
    }
    setSelectedNodeId(node.id);
    const bounds = canvasPanelRef.current?.getBoundingClientRect();
    if (bounds) {
      setInspectorPos({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    }
    setInspectorOpen(true);
  };

  const handleNodeContextMenu = (event: ReactMouseEvent<HTMLDivElement>, node: WorkflowNode) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedNodeId(node.id);
    const bounds = canvasPanelRef.current?.getBoundingClientRect();
    if (bounds) {
      setInspectorPos({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    }
    setInspectorOpen(true);
  };

  const validateWorkflow = () => {
    const errors: string[] = [];
    const sessionNodes = workflowDraft.nodes.filter((node) => node.type === "session");
    if (sessionNodes.length === 0) {
      errors.push("Add a Session node to start the workflow.");
    }
    sessionNodes.forEach((node) => {
      const config = node.config as Record<string, any>;
      const sessions = Array.isArray(config.sessions)
        ? config.sessions.filter((value: string) => value)
        : [];
      if (sessions.length === 0) {
        errors.push(`Session node ${node.id} needs at least one account selected.`);
      }
    });

    const actionTypes = new Set(["dm", "invite", "bulk_add", "forward", "warmup"]);
    const actionNodes = workflowDraft.nodes.filter((node) => actionTypes.has(node.type));
    if (actionNodes.length === 0) {
      errors.push("Add at least one action node (DM, Invite, Bulk Add, Forward, Warmup).");
    }
    actionNodes.forEach((node) => {
      const config = node.config as Record<string, any>;
      const presetName = typeof config.preset_name === "string" ? config.preset_name.trim() : "";
      if (!presetName) {
        errors.push(`Action node ${node.id} (${node.type}) needs a preset.`);
      }
      const inputFile = typeof config.input_file === "string" ? config.input_file.trim() : "";
      if (!inputFile) {
        errors.push(`Action node ${node.id} (${node.type}) needs a CSV file.`);
      }
      const repeatMin = Number(config.repeat_min ?? 1);
      const repeatMax = Number(config.repeat_max ?? 1);
      if (!Number.isFinite(repeatMin) || repeatMin < 1) {
        errors.push(`Action node ${node.id} (${node.type}) needs a valid repeat min.`);
      }
      if (!Number.isFinite(repeatMax) || repeatMax < repeatMin) {
        errors.push(`Action node ${node.id} (${node.type}) needs a repeat max >= min.`);
      }
      if (node.type === "dm") {
        const message = typeof config.message === "string" ? config.message.trim() : "";
        if (!message) {
          errors.push(`DM node ${node.id} needs a message.`);
        }
      }
      if (node.type === "invite") {
        const invite = typeof config.invite_url === "string" ? config.invite_url.trim() : "";
        if (!invite) {
          errors.push(`Invite node ${node.id} needs an invite link.`);
        }
      }
      if (node.type === "bulk_add") {
        const targetRef = typeof config.target_ref === "string" ? config.target_ref.trim() : "";
        if (!targetRef) {
          errors.push(`Bulk add node ${node.id} needs a target group/channel.`);
        }
      }
      if (node.type === "forward") {
        const messageLink = typeof config.message_link === "string" ? config.message_link.trim() : "";
        const sourcePeer = typeof config.source_peer === "string" ? config.source_peer.trim() : "";
        const messageId = config.message_id ? String(config.message_id).trim() : "";
        if (!messageLink && !(sourcePeer && messageId)) {
          errors.push(`Forward node ${node.id} needs a message link or source + message id.`);
        }
      }
      if (node.type === "warmup") {
        const targets = typeof config.targets === "string" ? config.targets.trim() : "";
        if (!targets) {
          errors.push(`Warmup node ${node.id} needs targets.`);
        }
      }
    });

    return errors;
  };

  const handleWorkflowStart = async () => {
    setError(null);
    const errors = validateWorkflow();
    if (errors.length) {
      setError(errors.join("\n"));
      return;
    }
    const id = workflowDraft.id.trim();
    if (!id) {
      setError("Save the workflow before starting.");
      return;
    }
    try {
      await api.startWorkflow(id);
      updateNotice(`Workflow started: ${workflowDraft.name || id}`);
      setWorkflowDraft((draft) => ({
        ...draft,
        meta: { ...draft.meta, running: true },
      }));
      refreshWorkflows();
    } catch (err: any) {
      setError(err.message || "Failed to start workflow");
    }
  };

  const handleWorkflowStop = async () => {
    setError(null);
    const id = workflowDraft.id.trim();
    if (!id) {
      setError("Select a workflow first.");
      return;
    }
    try {
      await api.stopWorkflow(id);
      updateNotice(`Workflow stopped: ${workflowDraft.name || id}`);
      setWorkflowDraft((draft) => ({
        ...draft,
        meta: { ...draft.meta, running: false },
      }));
      refreshWorkflows();
    } catch (err: any) {
      setError(err.message || "Failed to stop workflow");
    }
  };

  const handleWorkflowNew = () => {
    setWorkflowDraft(defaultWorkflowDraft);
    setSelectedNodeId(defaultWorkflowDraft.nodes[0]?.id ?? null);
    setLinkFrom(null);
  };

  const handleWorkflowLoad = (workflow: WorkflowItem) => {
    const nodes = (workflow.nodes || []).map((node, idx) => ({
      ...node,
      position: node.position ?? { x: 40 + idx * 32, y: 40 + idx * 28 },
    }));
    const edges = (workflow.edges || []).map((edge, idx) => ({
      id: edge.id || `edge_${idx}_${edge.source}_${edge.target}`,
      source: edge.source,
      target: edge.target,
      condition: edge.condition ?? null,
    }));
    setWorkflowDraft({
      id: workflow.id,
      name: workflow.name,
      nodes,
      edges,
      meta: workflow.meta || {},
    });
    setSelectedNodeId(nodes[0]?.id ?? null);
    setLinkFrom(null);
  };

  const handleWorkflowSave = async () => {
    setError(null);
    const id = workflowDraft.id.trim();
    const name = workflowDraft.name.trim();
    if (!id || !name) {
      setError("Workflow id and name are required");
      return;
    }
    const errors = validateWorkflow();
    if (errors.length) {
      setError(errors.join("\n"));
      return;
    }
    try {
      await api.saveWorkflow({
        id,
        name,
        nodes: workflowDraft.nodes,
        edges: workflowDraft.edges,
        meta: workflowDraft.meta,
      });
      updateNotice(`Workflow saved: ${name}`);
      refreshWorkflows();
    } catch (err: any) {
      setError(err.message || "Failed to save workflow");
    }
  };

  const handleWorkflowDelete = async (workflowId: string) => {
    setError(null);
    try {
      await api.deleteWorkflow(workflowId);
      updateNotice(`Workflow deleted: ${workflowId}`);
      refreshWorkflows();
      if (workflowDraft.id === workflowId) {
        handleWorkflowNew();
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete workflow");
    }
  };

  const handlePresetSave = async () => {
    setError(null);
    const name = presetForm.name.trim();
    if (!name) {
      setError("Preset name is required");
      return;
    }
    const kind = presetForm.kind || "dm";
    try {
      const payload: Record<string, unknown> = { name, kind };
      if (kind == "warmup") {
        payload.min_delay = toInt(presetForm.min_delay, 600);
        payload.max_delay = toInt(presetForm.max_delay, 1800);
        payload.total_messages = toInt(presetForm.total_messages, 12);
        payload.max_wait_seconds = toInt(presetForm.max_wait_seconds, 3600);
      } else {
        payload.interval_seconds = toInt(presetForm.interval_seconds, 600);
        payload.strict_timing = presetForm.strict_timing;
        payload.rate_mode = presetForm.rate_mode || "1";
        payload.max_wait_seconds = toInt(presetForm.max_wait_seconds, 3600);
        payload.max_flood_waits = toInt(presetForm.max_flood_waits, 3);
        payload.max_consecutive_errors = toInt(presetForm.max_consecutive_errors, 5);
      }
      await api.savePreset(payload as any);
      updateNotice(`Preset saved: ${name}`);
      setPresetForm(defaultPresetForm);
      refreshPresets();
    } catch (err: any) {
      setError(err.message || "Failed to save preset");
    }
  };

  const handlePresetEdit = (preset: PresetItem) => {
    const kind = preset.kind || "dm";
    setPresetForm({
      ...defaultPresetForm,
      name: preset.name,
      kind,
      interval_seconds: String(preset.interval_seconds ?? defaultPresetForm.interval_seconds),
      strict_timing: preset.strict_timing ?? defaultPresetForm.strict_timing,
      rate_mode: preset.rate_mode ?? defaultPresetForm.rate_mode,
      max_wait_seconds: String(preset.max_wait_seconds ?? defaultPresetForm.max_wait_seconds),
      max_flood_waits: String(preset.max_flood_waits ?? defaultPresetForm.max_flood_waits),
      max_consecutive_errors: String(
        preset.max_consecutive_errors ?? defaultPresetForm.max_consecutive_errors
      ),
      min_delay: String(preset.min_delay ?? defaultPresetForm.min_delay),
      max_delay: String(preset.max_delay ?? defaultPresetForm.max_delay),
      total_messages: String(preset.total_messages ?? defaultPresetForm.total_messages),
    });
  };

  const handlePresetDelete = async (name: string) => {
    setError(null);
    try {
      await api.deletePreset(name);
      updateNotice(`Preset deleted: ${name}`);
      refreshPresets();
    } catch (err: any) {
      setError(err.message || "Failed to delete preset");
    }
  };

  const handleRename = async () => {
    setError(null);
    if (!renameSession.old_name || !renameSession.new_name) {
      setError("Both old and new session names are required.");
      return;
    }
    try {
      await api.renameSession(renameSession);
      updateNotice(`Renamed ${renameSession.old_name} → ${renameSession.new_name}`);
      setRenameSession({ old_name: renameSession.new_name, new_name: "" });
      refreshSessions();
    } catch (err: any) {
      setError(err.message || "Failed to rename session");
    }
  };

  const handleDelete = async () => {
    setError(null);
    if (!deleteSession) {
      setError("Select a session to delete.");
      return;
    }
    try {
      await api.deleteSession(deleteSession);
      updateNotice(`Deleted session ${deleteSession}`);
      refreshSessions();
    } catch (err: any) {
      setError(err.message || "Failed to delete session");
    }
  };

  const handleImport = async () => {
    setError(null);
    if (!importDir) {
      setError("Enter a folder path containing .session files.");
      return;
    }
    try {
      const res = await api.importSessions({ source_dir: importDir });
      updateNotice(`Imported ${res.imported} session(s).`);
      setImportDir("");
      refreshSessions();
    } catch (err: any) {
      setError(err.message || "Failed to import sessions");
    }
  };

  const handleMergeCsv = async () => {
    setError(null);
    if (!mergeFiles || !mergeOutput) {
      setError("Provide input files and an output file.");
      return;
    }
    const files = mergeFiles
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
    if (files.length < 2) {
      setError("Enter at least two CSV files to merge.");
      return;
    }
    try {
      const res = await api.mergeCsv({ input_files: files, output_file: mergeOutput });
      updateNotice(`Merged ${res.total_rows} rows → ${res.unique_users} users: ${res.output_file}`);
    } catch (err: any) {
      setError(err.message || "Failed to merge CSVs");
    }
  };

  const parseMessageId = (value: string) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const parseTargets = (value: string) =>
    value
      .split(/[,\n;]/)
      .map((item) => item.trim())
      .filter(Boolean);


  const ensureMultiSessions = () => {
    if (selectedMultiSessions.length === 0) {
      setError("Select at least one session for multi-account runs.");
      return false;
    }
    return true;
  };

  const selectedMultiSessions = multiSessions.filter(Boolean);
  const showOverview = activeTab === "overview";
  const showSessions = showOverview || activeTab === "sessions";
  const showPresets = activeTab === "presets";
  const showWorkflows = activeTab === "workflows";
  const showSingle = activeTab === "single";
  const showMulti = activeTab === "multi";
  const showJobs = showOverview || activeTab === "jobs";
  const showLogs = showOverview || activeTab === "logs";

  const toggleMultiSession = (name: string) => {
    setMultiSessions((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const selectAllSessions = () => {
    setMultiSessions(sessionOptions.map((item) => item.name));
  };

  const clearSessions = () => {
    setMultiSessions([]);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Telepromo Control</p>
          <h1>Campaign Command Center</h1>
          <p className="subtle">
            API: <span>{API_BASE}</span>
          </p>
        </div>
        <div className={`status-pill ${connected ? "ok" : "bad"}`}>
          {connected ? "Connected" : "Offline"}
          <span className="status-note">{healthMessage}</span>
        </div>
      </header>

      {(notice || error) && (
        <div className="alerts">
          {notice && <p className="success">{notice}</p>}
          {error && <p className="error">{error}</p>}
        </div>
      )}

      <nav className="tabbar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {showSessions && (
      <section className="section">
        <div className="section-header">
          <h2>Sessions & Tools</h2>
          <button className="ghost" onClick={refreshSessions}>
            Refresh
          </button>
        </div>
        <div className="panel-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Sessions</h3>
              <span className="hint">{sessionOptions.length} total</span>
            </div>
            <div className="session-list">
              {sessionOptions.length === 0 && (
                <p className="muted">No sessions found. Add sessions in the backend.</p>
              )}
              {sessionOptions.map((session) => (
                <div key={session.name} className="session-card">
                  <div>
                    <h4>{session.name}</h4>
                    <p className="meta">
                      {session.username ? `@${session.username}` : "Unknown"} • {session.phone || "No phone"}
                    </p>
                  </div>
                  <div className={`badge ${session.proxy ? "on" : "off"}`}>
                    {session.proxy ? "Proxy" : "Direct"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Session Management</h3>
              <span className="hint">Rename, delete, import</span>
            </div>
            <div className="form-grid">
              <label>
                Rename session
                <div className="row">
                  <select
                    value={renameSession.old_name}
                    onChange={(e) => setRenameSession((prev) => ({ ...prev, old_name: e.target.value }))}
                  >
                    <option value="">Select session</option>
                    {sessionOptions.map((session) => (
                      <option key={session.name} value={session.name}>
                        {session.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={renameSession.new_name}
                    onChange={(e) => setRenameSession((prev) => ({ ...prev, new_name: e.target.value }))}
                    placeholder="new_session_name"
                  />
                </div>
              </label>
              <button className="primary" onClick={handleRename}>
                Rename
              </button>

              <label>
                Delete session
                <div className="row">
                  <select value={deleteSession} onChange={(e) => setDeleteSession(e.target.value)}>
                    <option value="">Select session</option>
                    {sessionOptions.map((session) => (
                      <option key={session.name} value={session.name}>
                        {session.name}
                      </option>
                    ))}
                  </select>
                  <button className="danger" onClick={handleDelete}>
                    Delete
                  </button>
                </div>
              </label>

              <label>
                Import sessions (folder path)
                <div className="row">
                  <input
                    type="text"
                    value={importDir}
                    onChange={(e) => setImportDir(e.target.value)}
                    placeholder="/path/to/sessions"
                  />
                  <button className="ghost" onClick={handleImport}>
                    Import
                  </button>
                </div>
              </label>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>CSV Merge (Dedupe)</h3>
              <span className="hint">Combine CSVs and remove duplicates</span>
            </div>
            <div className="form-grid">
              <label>
                Input CSVs (comma-separated)
                <input
                  type="text"
                  value={mergeFiles}
                  onChange={(e) => setMergeFiles(e.target.value)}
                  placeholder="data/a.csv, data/b.csv"
                />
              </label>
              <label>
                Output file
                <input
                  type="text"
                  value={mergeOutput}
                  onChange={(e) => setMergeOutput(e.target.value)}
                  placeholder="merged.csv"
                />
              </label>
              <button className="primary" onClick={handleMergeCsv}>
                Merge
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Session Proxy</h3>
              <span className="hint">One proxy per session</span>
            </div>
            <div className="form-grid">
              <label>
                Session
                <select
                  value={proxyForm.session}
                  onChange={(e) => setProxyForm((prev) => ({ ...prev, session: e.target.value }))}
                >
                  <option value="">Select session</option>
                  {sessionOptions.map((session) => (
                    <option key={session.name} value={session.name}>
                      {session.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Proxy type
                <select
                  value={proxyForm.proxy_type}
                  onChange={(e) => setProxyForm((prev) => ({ ...prev, proxy_type: e.target.value }))}
                >
                  <option value="socks5">SOCKS5</option>
                  <option value="http">HTTP/HTTPS</option>
                  <option value="mtproxy">MTProxy</option>
                  <option value="residential">Residential</option>
                </select>
              </label>
              <div className="row">
                <label>
                  Host
                  <input
                    type="text"
                    value={proxyForm.hostname}
                    onChange={(e) => setProxyForm((prev) => ({ ...prev, hostname: e.target.value }))}
                    placeholder="proxy.example.com"
                  />
                </label>
                <label>
                  Port
                  <input
                    type="number"
                    value={proxyForm.port}
                    onChange={(e) => setProxyForm((prev) => ({ ...prev, port: e.target.value }))}
                    placeholder="1080"
                  />
                </label>
              </div>
              <div className="row">
                <label>
                  Username (optional)
                  <input
                    type="text"
                    value={proxyForm.username}
                    onChange={(e) => setProxyForm((prev) => ({ ...prev, username: e.target.value }))}
                  />
                </label>
                <label>
                  Password (optional)
                  <input
                    type="password"
                    value={proxyForm.password}
                    onChange={(e) => setProxyForm((prev) => ({ ...prev, password: e.target.value }))}
                  />
                </label>
              </div>
              {proxyForm.proxy_type === "mtproxy" && (
                <label>
                  MTProxy secret
                  <input
                    type="text"
                    value={proxyForm.secret}
                    onChange={(e) => setProxyForm((prev) => ({ ...prev, secret: e.target.value }))}
                    placeholder="hex secret"
                  />
                </label>
              )}
              <div className="row">
                <button className="primary" onClick={handleSaveProxy}>
                  Save proxy
                </button>
                <button className="ghost" onClick={handleClearProxy}>
                  Remove proxy
                </button>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>AI API Keys</h3>
              <span className="hint">Global key for spintax / warmup</span>
            </div>
            <div className="form-grid">
              <label>
                Provider
                <select
                  value={aiProvider}
                  onChange={(e) => {
                    const next = e.target.value;
                    setAiProvider(next);
                    setAiModel(next === "gemini" ? "gemini-2.5-flash" : "gpt-4o-mini");
                  }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                </select>
              </label>
              {aiProvider === "gemini" && (
                <label>
                  Model
                  <input
                    type="text"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    placeholder="gemini-2.5-flash"
                  />
                  <span className="hint">Use a supported Gemini model, e.g. gemini-2.5-flash.</span>
                </label>
              )}
              <label>
                API key
                <input
                  type="password"
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  placeholder={aiHasKey ? "Saved (enter to replace)" : "Paste your API key"}
                />
              </label>
              <div className="row">
                <button className="primary" onClick={handleSaveAiSettings}>
                  Save key
                </button>
                <button className="ghost" onClick={handleClearAiSettings}>
                  Clear key
                </button>
              </div>
              {aiHasKey && <p className="hint">A key is stored for {aiProvider}.</p>}
            </div>
          </div>
        </div>
      </section>
      )}


      {showPresets && (
      <section className="section">
        <div className="section-header">
          <h2>Craft presets</h2>
          <button className="ghost" onClick={refreshPresets}>
            Refresh
          </button>
        </div>
        <div className="panel-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Create preset</h3>
              <span className="hint">Timing + safety bundle</span>
            </div>
            <div className="form-grid">
              <label>
                Preset name
                <input
                  type="text"
                  value={presetForm.name}
                  onChange={(e) => setPresetForm({ ...presetForm, name: e.target.value })}
                  placeholder="Balanced 10m"
                />
              </label>
              <label>
                Preset type
                <select
                  value={presetForm.kind}
                  onChange={(e) => setPresetForm({ ...presetForm, kind: e.target.value })}
                >
                  <option value="dm">DM / Invite / Bulk / Forward</option>
                  <option value="warmup">Warmup</option>
                </select>
              </label>
              {presetForm.kind === "dm" ? (
                <>
                  <div className="row">
                    <label>
                      Interval (seconds)
                      <input
                        type="number"
                        value={presetForm.interval_seconds}
                        onChange={(e) => setPresetForm({ ...presetForm, interval_seconds: e.target.value })}
                      />
                    </label>
                    <label>
                      Rate policy
                      <select
                        value={presetForm.rate_mode}
                        onChange={(e) => setPresetForm({ ...presetForm, rate_mode: e.target.value })}
                      >
                        <option value="1">Wait and continue</option>
                        <option value="2">Defer to retry file</option>
                        <option value="3">Stop on rate limit</option>
                      </select>
                    </label>
                    <label>
                      Max wait (sec)
                      <input
                        type="number"
                        value={presetForm.max_wait_seconds}
                        onChange={(e) => setPresetForm({ ...presetForm, max_wait_seconds: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Max flood waits
                      <input
                        type="number"
                        value={presetForm.max_flood_waits}
                        onChange={(e) => setPresetForm({ ...presetForm, max_flood_waits: e.target.value })}
                      />
                    </label>
                    <label>
                      Max consecutive errors
                      <input
                        type="number"
                        value={presetForm.max_consecutive_errors}
                        onChange={(e) => setPresetForm({ ...presetForm, max_consecutive_errors: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="toggles">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={presetForm.strict_timing}
                        onChange={(e) => setPresetForm({ ...presetForm, strict_timing: e.target.checked })}
                      />
                      Strict timing (no jitter)
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div className="row">
                    <label>
                      Total messages
                      <input
                        type="number"
                        value={presetForm.total_messages}
                        onChange={(e) => setPresetForm({ ...presetForm, total_messages: e.target.value })}
                      />
                    </label>
                    <label>
                      Min delay (sec)
                      <input
                        type="number"
                        value={presetForm.min_delay}
                        onChange={(e) => setPresetForm({ ...presetForm, min_delay: e.target.value })}
                      />
                    </label>
                    <label>
                      Max delay (sec)
                      <input
                        type="number"
                        value={presetForm.max_delay}
                        onChange={(e) => setPresetForm({ ...presetForm, max_delay: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Max wait (sec)
                      <input
                        type="number"
                        value={presetForm.max_wait_seconds}
                        onChange={(e) => setPresetForm({ ...presetForm, max_wait_seconds: e.target.value })}
                      />
                    </label>
                  </div>
                </>
              )}
              <button className="primary" onClick={handlePresetSave}>
                Save preset
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Saved DM presets</h3>
              <span className="hint">{dmPresets.length} total</span>
            </div>
            <div className="session-list">
              {dmPresets.length === 0 && <p className="muted">No DM presets yet.</p>}
              {dmPresets.map((preset) => (
                <div key={preset.name} className="session-card">
                  <div>
                    <h4>{preset.name}</h4>
                    <p className="meta">
                      Interval {preset.interval_seconds}s • Rate mode {preset.rate_mode}
                    </p>
                  </div>
                  <div className="row">
                    <button className="ghost" onClick={() => handlePresetEdit(preset)}>
                      Edit
                    </button>
                    <button className="danger" onClick={() => handlePresetDelete(preset.name)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="panel-header" style={{ marginTop: "16px" }}>
              <h3>Saved Warmup presets</h3>
              <span className="hint">{warmupPresets.length} total</span>
            </div>
            <div className="session-list">
              {warmupPresets.length === 0 && <p className="muted">No warmup presets yet.</p>}
              {warmupPresets.map((preset) => (
                <div key={preset.name} className="session-card">
                  <div>
                    <h4>{preset.name}</h4>
                    <p className="meta">
                      Total {preset.total_messages ?? 0} • {preset.min_delay ?? 0}-{preset.max_delay ?? 0}s
                    </p>
                  </div>
                  <div className="row">
                    <button className="ghost" onClick={() => handlePresetEdit(preset)}>
                      Edit
                    </button>
                    <button className="danger" onClick={() => handlePresetDelete(preset.name)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      )}

      {showWorkflows && (
        <section className="workflow-section">
          <div className="workflow-layout">
            <div className="panel workflow-palette">
              <div className="panel-header">
                <h3>Blocks</h3>
                <span className="hint">Build your loop</span>
              </div>
              <div className="workflow-buttons">
                <button className="ghost" onClick={() => addWorkflowNode("session")}>
                  Session
                </button>
                <button className="ghost" disabled={!workflowHasSession} onClick={() => addWorkflowNode("wait")}>
                  Wait
                </button>
                <button className="ghost" disabled={!workflowHasSession} onClick={() => addWorkflowNode("dm")}>
                  DM
                </button>
                <button className="ghost" disabled={!workflowHasSession} onClick={() => addWorkflowNode("invite")}>
                  Invite
                </button>
                <button className="ghost" disabled={!workflowHasSession} onClick={() => addWorkflowNode("bulk_add")}>
                  Bulk add
                </button>
                <button className="ghost" disabled={!workflowHasSession} onClick={() => addWorkflowNode("forward")}>
                  Forward
                </button>
                <button className="ghost" disabled={!workflowHasSession} onClick={() => addWorkflowNode("warmup")}>
                  Warmup
                </button>
              </div>

              <p className="workflow-help">
                {workflowHasSession ? "Session node ready." : "Add a Session node to start."} Use the link icon on a node, then click the target to connect.
              </p>

              <div className="panel-header">
                <h3>Saved loops</h3>
                <span className="hint">{workflows.length} total</span>
              </div>
              <div className="session-list">
                {workflows.length === 0 && <p className="muted">No loops saved yet.</p>}
                {workflows.map((workflow) => (
                  <div key={workflow.id} className="session-card">
                    <div>
                      <h4>{workflow.name}</h4>
                      <p className="meta">
                        {workflow.id} • {workflow.nodes?.length ?? 0} nodes
                      </p>
                    </div>
                    <div className="row">
                      <button className="ghost" onClick={() => handleWorkflowLoad(workflow)}>
                        Load
                      </button>
                      <button className="danger" onClick={() => handleWorkflowDelete(workflow.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel workflow-canvas-panel">
              <div className="panel-header workflow-header">
                <div>
                  <h3>Humanistic loop</h3>
                  <span className="hint">
                    {workflowDraft.nodes.length} nodes • {workflowDraft.edges.length} edges
                  </span>
                </div>
                <div className="workflow-toolbar">
                  <label>
                    Loop id
                    <input
                      type="text"
                      value={workflowDraft.id}
                      onChange={(e) => setWorkflowDraft({ ...workflowDraft, id: e.target.value })}
                      disabled={workflowHasSession}
                    />
                  </label>
                  <label>
                    Name
                    <input
                      type="text"
                      value={workflowDraft.name}
                      onChange={(e) => setWorkflowDraft({ ...workflowDraft, name: e.target.value })}
                    />
                  </label>
                  <div className="toolbar-actions">
                    <button className="ghost" onClick={handleWorkflowNew}>
                      New
                    </button>
                    <button className="primary" onClick={handleWorkflowSave}>
                      Save
                    </button>
                    <button className="primary" onClick={handleWorkflowStart} disabled={workflowRunning}>
                      Start
                    </button>
                    <button className="danger" onClick={handleWorkflowStop} disabled={!workflowRunning}>
                      Stop
                    </button>
                  </div>
                </div>
              </div>
              <div
                className="workflow-canvas"
                ref={canvasRef}
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    setSelectedNodeId(null);
                    setLinkFrom(null);
                    setPanning({
                      startX: event.clientX,
                      startY: event.clientY,
                      originX: canvasOffset.x,
                      originY: canvasOffset.y,
                    });
                  }
                }}
              >
                <div className="workflow-zoom">
                  <button className="ghost" onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.1).toFixed(2))))}>−</button>
                  <button className="ghost" onClick={() => setZoom(1)}>100%</button>
                  <button className="ghost" onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.1).toFixed(2))))}>+</button>
                </div>
                <div className="workflow-canvas-inner" style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})` }}>
                  <svg className="workflow-edges">
                    <defs>
                      <marker
                        id="arrow"
                        markerWidth="10"
                        markerHeight="10"
                        refX="8"
                        refY="3"
                        orient="auto"
                      >
                        <path d="M0,0 L0,6 L9,3 z" fill="rgba(242,183,96,0.9)" />
                      </marker>
                    </defs>
                    {workflowDraft.edges.map((edge) => {
                      const source = nodeLookup.get(edge.source);
                      const target = nodeLookup.get(edge.target);
                      if (!source?.position || !target?.position) return null;
                      const x1 = source.position.x + WORKFLOW_NODE_WIDTH;
                      const y1 = source.position.y + WORKFLOW_NODE_HEIGHT / 2;
                      const x2 = target.position.x;
                      const y2 = target.position.y + WORKFLOW_NODE_HEIGHT / 2;
                      const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
                      const c1x = x1 + dx;
                      const c2x = x2 - dx;
                      const d = `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
                      return (
                        <path
                          key={edge.id}
                          d={d}
                          fill="none"
                          stroke="rgba(242,183,96,0.8)"
                          strokeWidth="2"
                          markerEnd="url(#arrow)"
                        />
                      );
                    })}
                  </svg>

                  {workflowDraft.nodes.map((node) => {
                    const config = node.config as Record<string, any>;
                    const presetLabel = typeof config.preset_name === "string" ? config.preset_name : "";
                    const inputFile = typeof config.input_file === "string" ? config.input_file : "";
                    const sessionMode = config.mode === "multi" ? "Multi" : "Single";
                    const sessionList = Array.isArray(config.sessions) ? config.sessions : [];
                    const sessionLabel = sessionList.length
                      ? `${sessionMode}: ${sessionList.join(", ")}`
                      : "Select sessions";
                    const metaLines: string[] = [];
                    if (node.type === "session") {
                      metaLines.push(sessionLabel);
                    } else {
                      if (presetLabel) metaLines.push(`Preset: ${presetLabel}`);
                      if (inputFile) metaLines.push(`CSV: ${inputFile}`);
                    }
                    return (
                      <div
                        key={node.id}
                        className={`workflow-node${selectedNodeId === node.id ? " selected" : ""}${
                          linkFrom === node.id ? " linking" : ""
                        }`}
                        style={{
                          left: node.position?.x ?? 0,
                          top: node.position?.y ?? 0,
                        }}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          handleNodeMouseDown(event, node);
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleNodeClick(event, node);
                        }}
                      >
                        <div className="node-header">
                          <div className="node-title">{node.type.replace("_", " ")}</div>
                          <div className="node-actions">
                            <button
                              className="node-btn"
                              title="Link"
                              aria-label="Link"
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                setLinkFrom(node.id);
                              }}
                            >
                              🔗
                            </button>
                            <button
                              className="node-btn"
                              title="Unlink"
                              aria-label="Unlink"
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                removeWorkflowLinks(node.id);
                              }}
                            >
                              Unlink
                            </button>
                            <button
                              className="node-btn danger"
                              title="Delete"
                              aria-label="Delete"
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                removeWorkflowNode(node.id);
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        {metaLines.map((line) => (
                          <div key={line} className="node-meta">
                            {line}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="panel workflow-inspector">
              <div className="panel-header">
                <h3>Inspector</h3>
                <span className="hint">Configure selected node</span>
              </div>
              {selectedNode ? (
                <div className="form-grid">
                  <label>
                    Node id
                    <input type="text" value={selectedNode.id} disabled />
                  </label>
                  <label>
                    Type
                    <input type="text" value={selectedNode.type} disabled />
                  </label>
                  {(() => {
                    const config = selectedNode.config as Record<string, any>;
                    const presetValue = typeof config.preset_name === "string" ? config.preset_name : "";
                    const inputFileValue = typeof config.input_file === "string" ? config.input_file : "";
                    
                    const repeatMinRaw = config.repeat_min;
                    const repeatMaxRaw = config.repeat_max;
                    const repeatMinValue =
                      repeatMinRaw === undefined || repeatMinRaw === null || repeatMinRaw === ""
                        ? ""
                        : repeatMinRaw;
                    const repeatMaxValue =
                      repeatMaxRaw === undefined || repeatMaxRaw === null || repeatMaxRaw === ""
                        ? ""
                        : repeatMaxRaw;
                    const renderRepeat = () => (
                      <div className="row">
                        <label>
                          Repeat min
                          <input
                            type="number"
                            min={1}
                            value={repeatMinValue}
                            onChange={(e) => {
                              const raw = e.target.value;
                              updateWorkflowNodeConfig(selectedNode.id, {
                                repeat_min: raw === "" ? "" : Number(raw),
                              });
                            }}
                          />
                        </label>
                        <label>
                          Repeat max
                          <input
                            type="number"
                            min={1}
                            value={repeatMaxValue}
                            onChange={(e) => {
                              const raw = e.target.value;
                              updateWorkflowNodeConfig(selectedNode.id, {
                                repeat_max: raw === "" ? "" : Number(raw),
                              });
                            }}
                          />
                        </label>
                      </div>
                    );

                    const renderPresetSelect = (options: string[]) => (
                      <label>
                        Preset
                        <select
                          value={presetValue}
                          onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { preset_name: e.target.value })}
                        >
                          <option value="">Select preset</option>
                          {options.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                    const renderInputFile = () => (
                      <label>
                        CSV file
                        <input
                          type="text"
                          value={inputFileValue}
                          onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { input_file: e.target.value })}
                        />
                      </label>
                    );
                    if (selectedNode.type === "session") {
                      const mode = config.mode === "multi" ? "multi" : "single";
                      const sessionsValue = Array.isArray(config.sessions) ? config.sessions : [];
                      return (
                        <>
                          <label>
                            Mode
                            <select
                              value={mode}
                              onChange={(e) =>
                                updateWorkflowNodeConfig(selectedNode.id, {
                                  mode: e.target.value,
                                  sessions: e.target.value === "single" ? sessionsValue.slice(0, 1) : sessionsValue,
                                })
                              }
                            >
                              <option value="single">Single account</option>
                              <option value="multi">Multi account</option>
                            </select>
                          </label>
                          {mode === "single" ? (
                            <label>
                              Session
                              <select
                                value={sessionsValue[0] || ""}
                                onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { sessions: [e.target.value] })}
                              >
                                <option value="">Select session</option>
                                {sessionOptions.map((item) => (
                                  <option key={item.name} value={item.name}>
                                    {item.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <div className="checkbox-grid">
                              {sessionOptions.map((item) => (
                                <label key={item.name} className="checkbox">
                                  <input
                                    type="checkbox"
                                    checked={sessionsValue.includes(item.name)}
                                    onChange={() => {
                                      const next = sessionsValue.includes(item.name)
                                        ? sessionsValue.filter((value: string) => value !== item.name)
                                        : [...sessionsValue, item.name];
                                      updateWorkflowNodeConfig(selectedNode.id, { sessions: next });
                                    }}
                                  />
                                  {item.name}
                                </label>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    }
                    if (selectedNode.type === "wait") {
                      return (
                        <>
                          <label>
                            Min seconds
                            <input
                              type="number"
                              value={config.min_seconds ?? 0}
                              onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { min_seconds: Number(e.target.value) || 0 })}
                            />
                          </label>
                          <label>
                            Max seconds
                            <input
                              type="number"
                              value={config.max_seconds ?? 0}
                              onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { max_seconds: Number(e.target.value) || 0 })}
                            />
                          </label>
                        </>
                      );
                    }
                    if (selectedNode.type === "dm") {
                      return (
                        <>
                          {renderPresetSelect(presetNames)}
                          {renderInputFile()}
                          {renderRepeat()}
                          <label>
                            Message
                            <textarea
                              value={config.message ?? ""}
                              onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { message: e.target.value })}
                            />
                          </label>
                        </>
                      );
                    }
                    if (selectedNode.type === "invite") {
                      return (
                        <>
                          {renderPresetSelect(presetNames)}
                          {renderInputFile()}
                          {renderRepeat()}
                          <label>
                            Invite link
                            <input
                              type="text"
                              value={config.invite_url ?? ""}
                              onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { invite_url: e.target.value })}
                            />
                          </label>
                          <label>
                            Message
                            <textarea
                              value={config.message ?? ""}
                              onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { message: e.target.value })}
                            />
                          </label>
                        </>
                      );
                    }
                    if (selectedNode.type === "bulk_add") {
                      return (
                        <>
                          {renderPresetSelect(presetNames)}
                          {renderInputFile()}
                          {renderRepeat()}
                          <label>
                            Target group/channel
                            <input
                              type="text"
                              value={config.target_ref ?? ""}
                              onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { target_ref: e.target.value })}
                            />
                          </label>
                        </>
                      );
                    }
                    if (selectedNode.type === "forward") {
                      return (
                        <>
                          {renderPresetSelect(presetNames)}
                          {renderInputFile()}
                          {renderRepeat()}
                          <label>
                            Message link
                            <input
                              type="text"
                              value={config.message_link ?? ""}
                              onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { message_link: e.target.value })}
                            />
                          </label>
                          <label>
                            Source peer (optional)
                            <input
                              type="text"
                              value={config.source_peer ?? ""}
                              onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { source_peer: e.target.value })}
                            />
                          </label>
                          <label>
                            Message id (optional)
                            <input
                              type="text"
                              value={config.message_id ?? ""}
                              onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { message_id: e.target.value })}
                            />
                          </label>
                          <label className="toggle">
                            <input
                              type="checkbox"
                              checked={Boolean(config.drop_author)}
                              onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { drop_author: e.target.checked })}
                            />
                            Drop forward author
                          </label>
                        </>
                      );
                    }
                    if (selectedNode.type === "warmup") {
                      return (
                        <>
                          {renderPresetSelect(warmupPresetNames)}
                          {renderInputFile()}
                          {renderRepeat()}
                          <label>
                            Targets
                            <input
                              type="text"
                              value={config.targets ?? ""}
                              onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { targets: e.target.value })}
                            />
                          </label>
                        </>
                      );
                    }
                    return null;
                  })()}
                </div>
              ) : (
                <p className="muted">Select a node to edit its settings.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {showSingle && (
      <section className="section">
        <div className="section-header">
          <h2>Single-Account Campaigns</h2>
          <span className="hint">DM, invite, add, forward, profile</span>
        </div>
        <div className="panel-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Direct Message</h3>
              <span className="hint">CSV → DM</span>
            </div>
            <div className="form-grid">
              <label>
                Session
                <select value={dmForm.session} onChange={(e) => setDmForm({ ...dmForm, session: e.target.value })}>
                  <option value="">Select session</option>
                  {sessionOptions.map((session) => (
                    <option key={session.name} value={session.name}>
                      {session.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preset
                <select value={dmForm.preset_name} onChange={(e) => setDmForm({ ...dmForm, preset_name: e.target.value })}>
                  <option value="">Select preset</option>
                  {presetOptions.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                CSV file
                <input
                  type="text"
                  value={dmForm.input_file}
                  onChange={(e) => setDmForm({ ...dmForm, input_file: e.target.value })}
                />
              </label>
              <label>
                Message
                <textarea
                  value={dmForm.message}
                  onChange={(e) => setDmForm({ ...dmForm, message: e.target.value })}
                  rows={3}
                />
              </label>
              <label>
                Media path (optional)
                <input
                  type="text"
                  value={dmForm.media_path}
                  onChange={(e) => setDmForm({ ...dmForm, media_path: e.target.value })}
                  placeholder="data/test.jpg"
                />
              </label>
              <div className="toggles">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={dmForm.use_spintax}
                    onChange={(e) => setDmForm({ ...dmForm, use_spintax: e.target.checked })}
                  />
                  Spintax
                </label>
              </div>
              <button
                className="primary"
                onClick={() =>
                  handleJobStart(
                    "DM campaign",
                    api.startDm({
                      session: dmForm.session,
                      input_file: dmForm.input_file,
                      message: dmForm.message,
                      use_spintax: dmForm.use_spintax,
                      media_path: dmForm.media_path || undefined,
                      preset_name: dmForm.preset_name || undefined,
                      targeting: buildTargeting(dmForm),
                    })
                  )
                }
              >
                Start DM
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Invite Link DM</h3>
              <span className="hint">DM invite to group/channel</span>
            </div>
            <div className="form-grid">
              <label>
                Session
                <select value={inviteForm.session} onChange={(e) => setInviteForm({ ...inviteForm, session: e.target.value })}>
                  <option value="">Select session</option>
                  {sessionOptions.map((session) => (
                    <option key={session.name} value={session.name}>
                      {session.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preset
                <select value={inviteForm.preset_name} onChange={(e) => setInviteForm({ ...inviteForm, preset_name: e.target.value })}>
                  <option value="">Select preset</option>
                  {presetOptions.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                CSV file
                <input
                  type="text"
                  value={inviteForm.input_file}
                  onChange={(e) => setInviteForm({ ...inviteForm, input_file: e.target.value })}
                />
              </label>
              <label>
                Invite URL
                <input
                  type="text"
                  value={inviteForm.invite_url}
                  onChange={(e) => setInviteForm({ ...inviteForm, invite_url: e.target.value })}
                  placeholder="https://t.me/yourgroup"
                />
              </label>
              <label>
                Message (use [invite])
                <textarea
                  value={inviteForm.message}
                  onChange={(e) => setInviteForm({ ...inviteForm, message: e.target.value })}
                  rows={3}
                />
              </label>
              <label>
                Media path (optional)
                <input
                  type="text"
                  value={inviteForm.media_path}
                  onChange={(e) => setInviteForm({ ...inviteForm, media_path: e.target.value })}
                  placeholder="data/test.jpg"
                />
              </label>
              <div className="toggles">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={inviteForm.use_spintax}
                    onChange={(e) => setInviteForm({ ...inviteForm, use_spintax: e.target.checked })}
                  />
                  Spintax
                </label>
              </div>
              <button
                className="primary"
                onClick={() =>
                  handleJobStart(
                    "Invite DM",
                    api.startInviteDm({
                      session: inviteForm.session,
                      input_file: inviteForm.input_file,
                      invite_url: inviteForm.invite_url,
                      message: inviteForm.message || undefined,
                      use_spintax: inviteForm.use_spintax,
                      media_path: inviteForm.media_path || undefined,
                      preset_name: inviteForm.preset_name || undefined,
                      targeting: buildTargeting(inviteForm),
                    })
                  )
                }
              >
                Start Invite DM
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Bulk Add</h3>
              <span className="hint">Invite users to group</span>
            </div>
            <div className="form-grid">
              <label>
                Session
                <select value={bulkAddForm.session} onChange={(e) => setBulkAddForm({ ...bulkAddForm, session: e.target.value })}>
                  <option value="">Select session</option>
                  {sessionOptions.map((session) => (
                    <option key={session.name} value={session.name}>
                      {session.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preset
                <select value={bulkAddForm.preset_name} onChange={(e) => setBulkAddForm({ ...bulkAddForm, preset_name: e.target.value })}>
                  <option value="">Select preset</option>
                  {presetOptions.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                CSV file
                <input
                  type="text"
                  value={bulkAddForm.input_file}
                  onChange={(e) => setBulkAddForm({ ...bulkAddForm, input_file: e.target.value })}
                />
              </label>
              <label>
                Target group (@group or id)
                <input
                  type="text"
                  value={bulkAddForm.target_ref}
                  onChange={(e) => setBulkAddForm({ ...bulkAddForm, target_ref: e.target.value })}
                />
              </label>
              <button
                className="primary"
                onClick={() =>
                  handleJobStart(
                    "Bulk add",
                    api.startBulkAdd({
                      session: bulkAddForm.session,
                      input_file: bulkAddForm.input_file,
                      target_ref: bulkAddForm.target_ref,
                      preset_name: bulkAddForm.preset_name || undefined,
                      targeting: buildTargeting(bulkAddForm),
                    })
                  )
                }
              >
                Start Bulk Add
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Forward Message</h3>
              <span className="hint">Forward from source to users</span>
            </div>
            <div className="form-grid">
              <label>
                Session
                <select value={forwardForm.session} onChange={(e) => setForwardForm({ ...forwardForm, session: e.target.value })}>
                  <option value="">Select session</option>
                  {sessionOptions.map((session) => (
                    <option key={session.name} value={session.name}>
                      {session.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preset
                <select value={forwardForm.preset_name} onChange={(e) => setForwardForm({ ...forwardForm, preset_name: e.target.value })}>
                  <option value="">Select preset</option>
                  {presetOptions.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                CSV file
                <input
                  type="text"
                  value={forwardForm.input_file}
                  onChange={(e) => setForwardForm({ ...forwardForm, input_file: e.target.value })}
                />
              </label>
              <label>
                Source peer (@channel or id)
                <input
                  type="text"
                  value={forwardForm.source_peer}
                  onChange={(e) => setForwardForm({ ...forwardForm, source_peer: e.target.value })}
                />
              </label>
              <label>
                Message ID
                <input
                  type="number"
                  value={forwardForm.message_id}
                  onChange={(e) => setForwardForm({ ...forwardForm, message_id: e.target.value })}
                />
              </label>
              <label>
                Or message link
                <input
                  type="text"
                  value={forwardForm.message_link}
                  onChange={(e) => setForwardForm({ ...forwardForm, message_link: e.target.value })}
                  placeholder="https://t.me/..."
                />
              </label>
              <div className="toggles">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={forwardForm.drop_author}
                    onChange={(e) => setForwardForm({ ...forwardForm, drop_author: e.target.checked })}
                  />
                  Drop author
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={forwardForm.has_media}
                    onChange={(e) => setForwardForm({ ...forwardForm, has_media: e.target.checked })}
                  />
                  Contains media
                </label>
              </div>
              <button
                className="primary"
                onClick={() =>
                  handleJobStart(
                    "Forward",
                    api.startForward({
                      session: forwardForm.session,
                      input_file: forwardForm.input_file,
                      source_peer: forwardForm.source_peer || undefined,
                      message_id: forwardForm.message_id ? toInt(forwardForm.message_id, 0) : undefined,
                      message_link: forwardForm.message_link || undefined,
                      drop_author: forwardForm.drop_author,
                      has_media: forwardForm.has_media,
                      preset_name: forwardForm.preset_name || undefined,
                      targeting: buildTargeting(forwardForm),
                    })
                  )
                }
              >
                Start Forward
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Profile Rotation</h3>
              <span className="hint">Update name/bio/photo</span>
            </div>
            <div className="form-grid">
              <label>
                Session
                <select value={profileForm.session} onChange={(e) => setProfileForm({ ...profileForm, session: e.target.value })}>
                  <option value="">Select session</option>
                  {sessionOptions.map((session) => (
                    <option key={session.name} value={session.name}>
                      {session.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                First name
                <input
                  type="text"
                  value={profileForm.first_name}
                  onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                />
              </label>
              <label>
                Last name
                <input
                  type="text"
                  value={profileForm.last_name}
                  onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                />
              </label>
              <label>
                Bio
                <textarea
                  value={profileForm.bio}
                  onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                  rows={3}
                />
              </label>
              <label>
                Photo path
                <input
                  type="text"
                  value={profileForm.photo}
                  onChange={(e) => setProfileForm({ ...profileForm, photo: e.target.value })}
                  placeholder="data/avatar.jpg"
                />
              </label>
              <button
                className="primary"
                onClick={() =>
                  handleJobStart(
                    "Profile update",
                    api.startProfile({
                      session: profileForm.session,
                      profile: {
                        first_name: profileForm.first_name || null,
                        last_name: profileForm.last_name || null,
                        bio: profileForm.bio || null,
                        photo: profileForm.photo || null,
                      },
                    })
                  )
                }
              >
                Update Profile
              </button>
            </div>
          </div>


          <div className="panel">
            <div className="panel-header">
              <h3>Warmup</h3>
              <span className="hint">Group-only warmup with AI context</span>
            </div>
            <div className="form-grid">
              <p className="hint">
                Uses last 20 messages and replies only if the latest non‑self message is within 24h.
              </p>
              <label>
                Session
                <select value={warmupForm.session} onChange={(e) => setWarmupForm({ ...warmupForm, session: e.target.value })}>
                  <option value="">Select session</option>
                  {sessionOptions.map((session) => (
                    <option key={session.name} value={session.name}>
                      {session.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Targets (group @usernames)
                <input
                  type="text"
                  value={warmupForm.targets}
                  onChange={(e) => setWarmupForm({ ...warmupForm, targets: e.target.value })}
                  placeholder="@group1, @group2"
                />
              </label>
              <label>
                Warmup preset
                <select
                  value={warmupForm.preset_name}
                  onChange={(e) => setWarmupForm({ ...warmupForm, preset_name: e.target.value })}
                >
                  <option value="">Select warmup preset</option>
                  {warmupPresets.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary"
                onClick={() => {
                  if (!warmupForm.session) {
                    setError("Select a session for warmup");
                    return;
                  }
                  const targets = parseTargets(warmupForm.targets).filter((t) => t !== "me");
                  if (targets.length === 0) {
                    setError("Warmup targets must be group usernames");
                    return;
                  }
                  if (!warmupForm.preset_name) {
                    setError("Select a warmup preset");
                    return;
                  }
                  handleJobStart(
                    "Warmup",
                    api.startWarmup({
                      session: warmupForm.session,
                      targets,
                      preset_name: warmupForm.preset_name,
                    })
                  );
                }}
              >
                Start Warmup
              </button>
            </div>
          </div>
        </div>
      </section>
      )}

      {showMulti && (
      <section className="section">
        <div className="section-header">
          <h2>Multi-Account Campaigns</h2>
          <span className="hint">Run across multiple sessions</span>
        </div>
        <div className="panel-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Session Selector</h3>
              <span className="hint">Pick accounts for multi-run</span>
            </div>
            <div className="session-picker">
              <div className="picker-actions">
                <button className="ghost" onClick={selectAllSessions}>
                  Select all
                </button>
                <button className="ghost" onClick={clearSessions}>
                  Clear
                </button>
              </div>
              <div className="picker-grid">
                {sessionOptions.map((session) => (
                  <label key={session.name} className="check">
                    <input
                      type="checkbox"
                      checked={multiSessions.includes(session.name)}
                      onChange={() => toggleMultiSession(session.name)}
                    />
                    {session.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Multi DM</h3>
              <span className="hint">All sessions DM CSV</span>
            </div>
            <div className="form-grid">
              <label>
                CSV file
                <input
                  type="text"
                  value={multiForm.input_file}
                  onChange={(e) => setMultiForm({ ...multiForm, input_file: e.target.value })}
                />
              </label>
              <label>
                Preset
                <select value={multiForm.preset_name} onChange={(e) => setMultiForm({ ...multiForm, preset_name: e.target.value })}>
                  <option value="">Select preset</option>
                  {presetOptions.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Message
                <textarea
                  value={multiForm.message}
                  onChange={(e) => setMultiForm({ ...multiForm, message: e.target.value })}
                  rows={3}
                />
              </label>
              <label>
                Media path (optional)
                <input
                  type="text"
                  value={multiForm.media_path}
                  onChange={(e) => setMultiForm({ ...multiForm, media_path: e.target.value })}
                />
              </label>
              <div className="toggles">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={multiForm.use_spintax}
                    onChange={(e) => setMultiForm({ ...multiForm, use_spintax: e.target.checked })}
                  />
                  Spintax
                </label>
              </div>
              <button
                className="primary"
                onClick={() => {
                  if (!ensureMultiSessions()) return;
                  handleJobStart(
                    "Multi DM",
                    api.startMultiDm({
                      sessions: selectedMultiSessions,
                      input_file: multiForm.input_file,
                      message: multiForm.message,
                      use_spintax: multiForm.use_spintax,
                      media_path: multiForm.media_path || undefined,
                      preset_name: multiForm.preset_name || undefined,
                      targeting: buildTargeting(multiForm),
                    })
                  )
              }}
              >
                Start Multi DM
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Multi Invite DM</h3>
              <span className="hint">Invite link + message</span>
            </div>
            <div className="form-grid">
              <label>
                CSV file
                <input
                  type="text"
                  value={multiInviteForm.input_file}
                  onChange={(e) => setMultiInviteForm({ ...multiInviteForm, input_file: e.target.value })}
                />
              </label>
              <label>
                Preset
                <select value={multiInviteForm.preset_name} onChange={(e) => setMultiInviteForm({ ...multiInviteForm, preset_name: e.target.value })}>
                  <option value="">Select preset</option>
                  {presetOptions.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Invite URL
                <input
                  type="text"
                  value={multiInviteForm.invite_url}
                  onChange={(e) => setMultiInviteForm({ ...multiInviteForm, invite_url: e.target.value })}
                />
              </label>
              <label>
                Message (use [invite])
                <textarea
                  value={multiInviteForm.message}
                  onChange={(e) => setMultiInviteForm({ ...multiInviteForm, message: e.target.value })}
                  rows={3}
                />
              </label>
              <label>
                Media path (optional)
                <input
                  type="text"
                  value={multiInviteForm.media_path}
                  onChange={(e) => setMultiInviteForm({ ...multiInviteForm, media_path: e.target.value })}
                />
              </label>
              <div className="toggles">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={multiInviteForm.use_spintax}
                    onChange={(e) => setMultiInviteForm({ ...multiInviteForm, use_spintax: e.target.checked })}
                  />
                  Spintax
                </label>
              </div>
              <button
                className="primary"
                onClick={() => {
                  if (!ensureMultiSessions()) return;
                  handleJobStart(
                    "Multi invite DM",
                    api.startMultiInviteDm({
                      sessions: selectedMultiSessions,
                      input_file: multiInviteForm.input_file,
                      invite_url: multiInviteForm.invite_url,
                      message: multiInviteForm.message || undefined,
                      use_spintax: multiInviteForm.use_spintax,
                      media_path: multiInviteForm.media_path || undefined,
                      preset_name: multiInviteForm.preset_name || undefined,
                      targeting: buildTargeting(multiInviteForm),
                    })
                  )
              }}
              >
                Start Multi Invite DM
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Multi Bulk Add</h3>
              <span className="hint">Add users with multiple accounts</span>
            </div>
            <div className="form-grid">
              <label>
                CSV file
                <input
                  type="text"
                  value={multiBulkAddForm.input_file}
                  onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, input_file: e.target.value })}
                />
              </label>
              <label>
                Preset
                <select value={multiBulkAddForm.preset_name} onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, preset_name: e.target.value })}>
                  <option value="">Select preset</option>
                  {presetOptions.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Target group (@group or id)
                <input
                  type="text"
                  value={multiBulkAddForm.target_ref}
                  onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, target_ref: e.target.value })}
                />
              </label>
              <button
                className="primary"
                onClick={() => {
                  if (!ensureMultiSessions()) return;
                  handleJobStart(
                    "Multi bulk add",
                    api.startMultiBulkAdd({
                      sessions: selectedMultiSessions,
                      input_file: multiBulkAddForm.input_file,
                      target_ref: multiBulkAddForm.target_ref,
                      preset_name: multiBulkAddForm.preset_name || undefined,
                      targeting: buildTargeting(multiBulkAddForm),
                    })
                  )
              }}
              >
                Start Multi Bulk Add
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Multi Forward</h3>
              <span className="hint">Forward from source with many accounts</span>
            </div>
            <div className="form-grid">
              <label>
                CSV file
                <input
                  type="text"
                  value={multiForwardForm.input_file}
                  onChange={(e) => setMultiForwardForm({ ...multiForwardForm, input_file: e.target.value })}
                />
              </label>
              <label>
                Preset
                <select value={multiForwardForm.preset_name} onChange={(e) => setMultiForwardForm({ ...multiForwardForm, preset_name: e.target.value })}>
                  <option value="">Select preset</option>
                  {presetOptions.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Source peer (@channel or id)
                <input
                  type="text"
                  value={multiForwardForm.source_peer}
                  onChange={(e) => setMultiForwardForm({ ...multiForwardForm, source_peer: e.target.value })}
                />
              </label>
              <label>
                Message ID
                <input
                  type="number"
                  value={multiForwardForm.message_id}
                  onChange={(e) => setMultiForwardForm({ ...multiForwardForm, message_id: e.target.value })}
                />
              </label>
              <label>
                Or message link
                <input
                  type="text"
                  value={multiForwardForm.message_link}
                  onChange={(e) => setMultiForwardForm({ ...multiForwardForm, message_link: e.target.value })}
                />
              </label>
              <div className="toggles">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={multiForwardForm.drop_author}
                    onChange={(e) => setMultiForwardForm({ ...multiForwardForm, drop_author: e.target.checked })}
                  />
                  Drop author
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={multiForwardForm.has_media}
                    onChange={(e) => setMultiForwardForm({ ...multiForwardForm, has_media: e.target.checked })}
                  />
                  Contains media
                </label>
              </div>
              <button
                className="primary"
                onClick={() => {
                  if (!ensureMultiSessions()) return;
                  handleJobStart(
                    "Multi forward",
                    api.startMultiForward({
                      sessions: selectedMultiSessions,
                      input_file: multiForwardForm.input_file,
                      source_peer: multiForwardForm.source_peer || undefined,
                      message_id: multiForwardForm.message_id ? toInt(multiForwardForm.message_id, 0) : undefined,
                      message_link: multiForwardForm.message_link || undefined,
                      drop_author: multiForwardForm.drop_author,
                      has_media: multiForwardForm.has_media,
                      preset_name: multiForwardForm.preset_name || undefined,
                      targeting: buildTargeting(multiForwardForm),
                    })
                  )
              }}
              >
                Start Multi Forward
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Multi Profile Rotation</h3>
              <span className="hint">Apply profile changes to each session</span>
            </div>
            <div className="form-grid">
              <label>
                Delay between sessions (sec)
                <input
                  type="number"
                  value={multiProfileForm.delay_seconds}
                  onChange={(e) => setMultiProfileForm({ ...multiProfileForm, delay_seconds: e.target.value })}
                />
              </label>
              <label>
                First name
                <input
                  type="text"
                  value={multiProfileForm.first_name}
                  onChange={(e) => setMultiProfileForm({ ...multiProfileForm, first_name: e.target.value })}
                />
              </label>
              <label>
                Last name
                <input
                  type="text"
                  value={multiProfileForm.last_name}
                  onChange={(e) => setMultiProfileForm({ ...multiProfileForm, last_name: e.target.value })}
                />
              </label>
              <label>
                Bio
                <textarea
                  value={multiProfileForm.bio}
                  onChange={(e) => setMultiProfileForm({ ...multiProfileForm, bio: e.target.value })}
                  rows={3}
                />
              </label>
              <label>
                Photo path
                <input
                  type="text"
                  value={multiProfileForm.photo}
                  onChange={(e) => setMultiProfileForm({ ...multiProfileForm, photo: e.target.value })}
                />
              </label>
              <button
                className="primary"
                onClick={() => {
                  if (!ensureMultiSessions()) return;
                  const profile_map: Record<string, Record<string, string | null>> = {};
                  selectedMultiSessions.forEach((session) => {
                    profile_map[session] = {
                      first_name: multiProfileForm.first_name || null,
                      last_name: multiProfileForm.last_name || null,
                      bio: multiProfileForm.bio || null,
                      photo: multiProfileForm.photo || null,
                    };
                  });
                  handleJobStart(
                    "Multi profile",
                    api.startMultiProfile({
                      sessions: selectedMultiSessions,
                      profile_map,
                      delay_seconds: toInt(multiProfileForm.delay_seconds, 5),
                    })
                  );
                }}
              >
                Start Multi Profile
              </button>
            </div>
          </div>


          <div className="panel">
            <div className="panel-header">
              <h3>Multi Warmup</h3>
              <span className="hint">Group-only warmup across selected sessions</span>
            </div>
            <div className="form-grid">
              <p className="hint">
                Uses last 20 messages and replies only if the latest non‑self message is within 24h.
              </p>
              <label>
                Targets (group @usernames)
                <input
                  type="text"
                  value={multiWarmupForm.targets}
                  onChange={(e) => setMultiWarmupForm({ ...multiWarmupForm, targets: e.target.value })}
                  placeholder="@group1, @group2"
                />
              </label>
              <label>
                Warmup preset
                <select
                  value={multiWarmupForm.preset_name}
                  onChange={(e) => setMultiWarmupForm({ ...multiWarmupForm, preset_name: e.target.value })}
                >
                  <option value="">Select warmup preset</option>
                  {warmupPresets.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary"
                onClick={() => {
                  if (!ensureMultiSessions()) return;
                  const targets = parseTargets(multiWarmupForm.targets).filter((t) => t !== "me");
                  if (targets.length === 0) {
                    setError("Warmup targets must be group usernames");
                    return;
                  }
                  if (!multiWarmupForm.preset_name) {
                    setError("Select a warmup preset");
                    return;
                  }
                  handleJobStart(
                    "Multi warmup",
                    api.startMultiWarmup({
                      sessions: selectedMultiSessions,
                      targets,
                      preset_name: multiWarmupForm.preset_name,
                    })
                  );
                }}
              >
                Start Multi Warmup
              </button>
            </div>
          </div>
        </div>
      </section>
      )}

      {showJobs && (
      <section className="section">
        <div className="section-header">
          <h2>Jobs</h2>
          <button className="ghost" onClick={refreshJobs}>
            Refresh
          </button>
        </div>
        <div className="panel">
          {jobs.length === 0 ? (
            <p className="muted">No running jobs.</p>
          ) : (
            <div className="job-list">
              {jobs.map((job) => (
                <div key={job.id} className="job-card" onClick={() => setSelectedJobId(job.id)}>
                  <div>
                    <h4>{job.type}</h4>
                    <p className="meta">{job.id}</p>
                    <p className="meta">Status: {job.status}</p>
                    {job.error && <p className="meta error">Error: {job.error}</p>}
                  </div>
                  <div className="job-actions">
                    <button
                      className="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedJobId(job.id);
                        setActiveTab("logs");
                      }}
                    >
                      View logs
                    </button>
                    {job.status === "running" && (
                      <button
                        className="danger"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await api.stopJob(job.id);
                            updateNotice(`Stopped ${job.id}`);
                            refreshJobs();
                          } catch (err: any) {
                            setError(err.message || "Failed to stop job");
                          }
                        }}
                      >
                        Stop
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      )}

      {showLogs && (
      <section className="section logs">
        <div className="panel">
          <div className="panel-header">
            <h3>Log Source</h3>
            <button className="ghost" onClick={refreshLogs}>Refresh</button>
          </div>
          <div className="form-grid">
            <label>
              Job
              <select value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)}>
                <option value="">Latest</option>
                {jobs
                  .slice()
                  .sort((a, b) => (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""))
                  .map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.id} ({job.type})
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h3>Actions Log</h3>
            <span className="hint">{lastLogPath || "No log yet"}</span>
          </div>
          <pre>{actionsLog.join("\n") || "No entries yet."}</pre>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h3>Audit Log</h3>
            <span className="hint">{lastAuditPath || "No log yet"}</span>
          </div>
          <pre>{auditLog.join("\n") || "No entries yet."}</pre>
        </div>
      </section>
      )}
    </div>
  );
}

export default App;

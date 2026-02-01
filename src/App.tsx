import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { api, API_BASE } from "./lib/api";

const POLL_INTERVAL_MS = 6000;

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
  safe_mode: boolean;
  batch_size: string;
  batch_delay: string;
  message_delay: string;
  rate_mode: string;
  max_wait_seconds: string;
  retry_file: string;
  max_flood_waits: string;
  max_consecutive_errors: string;
  max_total_errors: string;
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

const baseOptions: CommonOptions = {
  use_spintax: false,
  media_path: "",
  safe_mode: true,
  batch_size: "5",
  batch_delay: "60",
  message_delay: "5",
  rate_mode: "1",
  max_wait_seconds: "3600",
  retry_file: "",
  max_flood_waits: "3",
  max_consecutive_errors: "5",
  max_total_errors: "20",
  exclude_bots: true,
  exclude_deleted: true,
  last_seen_days: "",
  whitelist_path: "",
  blacklist_path: "",
  max_users: "",
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

const buildRatePolicy = (form: CommonOptions) => {
  if (!form.rate_mode && !form.max_wait_seconds && !form.retry_file) {
    return undefined;
  }
  return {
    mode: form.rate_mode || "1",
    max_wait_seconds: toInt(form.max_wait_seconds, 3600),
    retry_file: form.retry_file || undefined,
  };
};

const buildSafety = (form: CommonOptions) => ({
  max_flood_waits: toInt(form.max_flood_waits, 3),
  max_consecutive_errors: toInt(form.max_consecutive_errors, 5),
  max_total_errors: toInt(form.max_total_errors, 20),
});

function App() {
  const [connected, setConnected] = useState(false);
  const [healthMessage, setHealthMessage] = useState("Checking backend...");
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [actionsLog, setActionsLog] = useState<string[]>([]);
  const [auditLog, setAuditLog] = useState<string[]>([]);
  const [lastLogPath, setLastLogPath] = useState<string | null>(null);
  const [lastAuditPath, setLastAuditPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "sessions", label: "Sessions" },
    { id: "single", label: "Single" },
    { id: "multi", label: "Multi" },
    { id: "jobs", label: "Jobs" },
    { id: "logs", label: "Logs" },
  ];
  const [activeTab, setActiveTab] = useState("overview");

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
    safe_mode: true,
    batch_size: "3",
    batch_delay: "120",
    message_delay: "15",
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
    safe_mode: true,
    batch_size: "3",
    batch_delay: "120",
    message_delay: "15",
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

  const refreshLogs = async () => {
    try {
      const actions = await api.actionsLog();
      setActionsLog(actions.lines || []);
      setLastLogPath(actions.path);
      const audit = await api.auditLog();
      setAuditLog(audit.lines || []);
      setLastAuditPath(audit.path);
    } catch (err: any) {
      setError(err.message || "Failed to load logs");
    }
  };

  const refreshJobs = async () => {
    try {
      const res = await api.jobs();
      setJobs((res.jobs || []) as JobItem[]);
    } catch (err: any) {
      setError(err.message || "Failed to load jobs");
    }
  };

  useEffect(() => {
    refreshHealth();
    refreshSessions();
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
    const first = sessionOptions[0]?.name;
    if (!first) {
      return;
    }
    setDmForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setInviteForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setBulkAddForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setForwardForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setProfileForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setDeleteSession((prev) => prev || first);
    setRenameSession((prev) => (prev.old_name ? prev : { ...prev, old_name: first }));
    if (multiSessions.length === 0) {
      setMultiSessions([first]);
    }
  }, [sessionOptions]);

  const updateNotice = (message: string) => {
    setNotice(message);
    setError(null);
  };

  const handleJobStart = async (label: string, jobPromise: Promise<{ job_id: string }>) => {
    setError(null);
    try {
      const res = await jobPromise;
      updateNotice(`${label} started: ${res.job_id}`);
      refreshJobs();
    } catch (err: any) {
      setError(err.message || `Failed to start ${label}`);
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
                    checked={dmForm.safe_mode}
                    onChange={(e) => setDmForm({ ...dmForm, safe_mode: e.target.checked })}
                  />
                  Safe mode
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={dmForm.use_spintax}
                    onChange={(e) => setDmForm({ ...dmForm, use_spintax: e.target.checked })}
                  />
                  Spintax
                </label>
              </div>
              <details>
                <summary>Advanced options</summary>
                <div className="advanced">
                  <div className="row">
                    <label>
                      Batch size
                      <input
                        type="number"
                        value={dmForm.batch_size}
                        onChange={(e) => setDmForm({ ...dmForm, batch_size: e.target.value })}
                      />
                    </label>
                    <label>
                      Batch delay (sec)
                      <input
                        type="number"
                        value={dmForm.batch_delay}
                        onChange={(e) => setDmForm({ ...dmForm, batch_delay: e.target.value })}
                      />
                    </label>
                    <label>
                      Message delay (sec)
                      <input
                        type="number"
                        value={dmForm.message_delay}
                        onChange={(e) => setDmForm({ ...dmForm, message_delay: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Rate policy
                      <select
                        value={dmForm.rate_mode}
                        onChange={(e) => setDmForm({ ...dmForm, rate_mode: e.target.value })}
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
                        value={dmForm.max_wait_seconds}
                        onChange={(e) => setDmForm({ ...dmForm, max_wait_seconds: e.target.value })}
                      />
                    </label>
                    <label>
                      Retry file
                      <input
                        type="text"
                        value={dmForm.retry_file}
                        onChange={(e) => setDmForm({ ...dmForm, retry_file: e.target.value })}
                        placeholder="data/file_retry.csv"
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Max flood waits
                      <input
                        type="number"
                        value={dmForm.max_flood_waits}
                        onChange={(e) => setDmForm({ ...dmForm, max_flood_waits: e.target.value })}
                      />
                    </label>
                    <label>
                      Max consecutive errors
                      <input
                        type="number"
                        value={dmForm.max_consecutive_errors}
                        onChange={(e) => setDmForm({ ...dmForm, max_consecutive_errors: e.target.value })}
                      />
                    </label>
                    <label>
                      Max total errors
                      <input
                        type="number"
                        value={dmForm.max_total_errors}
                        onChange={(e) => setDmForm({ ...dmForm, max_total_errors: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={dmForm.exclude_bots}
                        onChange={(e) => setDmForm({ ...dmForm, exclude_bots: e.target.checked })}
                      />
                      Exclude bots
                    </label>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={dmForm.exclude_deleted}
                        onChange={(e) => setDmForm({ ...dmForm, exclude_deleted: e.target.checked })}
                      />
                      Exclude deleted
                    </label>
                    <label>
                      Last seen days
                      <input
                        type="number"
                        value={dmForm.last_seen_days}
                        onChange={(e) => setDmForm({ ...dmForm, last_seen_days: e.target.value })}
                        placeholder="30"
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Whitelist path
                      <input
                        type="text"
                        value={dmForm.whitelist_path}
                        onChange={(e) => setDmForm({ ...dmForm, whitelist_path: e.target.value })}
                        placeholder="data/whitelist.txt"
                      />
                    </label>
                    <label>
                      Blacklist path
                      <input
                        type="text"
                        value={dmForm.blacklist_path}
                        onChange={(e) => setDmForm({ ...dmForm, blacklist_path: e.target.value })}
                        placeholder="data/blacklist.txt"
                      />
                    </label>
                    <label>
                      Max users
                      <input
                        type="number"
                        value={dmForm.max_users}
                        onChange={(e) => setDmForm({ ...dmForm, max_users: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </details>
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
                      safe_mode: dmForm.safe_mode,
                      batch_size: toInt(dmForm.batch_size, 5),
                      batch_delay: toInt(dmForm.batch_delay, 60),
                      message_delay: toInt(dmForm.message_delay, 5),
                      rate_policy: buildRatePolicy(dmForm),
                      safety_limits: buildSafety(dmForm),
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
                    checked={inviteForm.safe_mode}
                    onChange={(e) => setInviteForm({ ...inviteForm, safe_mode: e.target.checked })}
                  />
                  Safe mode
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={inviteForm.use_spintax}
                    onChange={(e) => setInviteForm({ ...inviteForm, use_spintax: e.target.checked })}
                  />
                  Spintax
                </label>
              </div>
              <details>
                <summary>Advanced options</summary>
                <div className="advanced">
                  <div className="row">
                    <label>
                      Batch size
                      <input
                        type="number"
                        value={inviteForm.batch_size}
                        onChange={(e) => setInviteForm({ ...inviteForm, batch_size: e.target.value })}
                      />
                    </label>
                    <label>
                      Batch delay (sec)
                      <input
                        type="number"
                        value={inviteForm.batch_delay}
                        onChange={(e) => setInviteForm({ ...inviteForm, batch_delay: e.target.value })}
                      />
                    </label>
                    <label>
                      Message delay (sec)
                      <input
                        type="number"
                        value={inviteForm.message_delay}
                        onChange={(e) => setInviteForm({ ...inviteForm, message_delay: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Rate policy
                      <select
                        value={inviteForm.rate_mode}
                        onChange={(e) => setInviteForm({ ...inviteForm, rate_mode: e.target.value })}
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
                        value={inviteForm.max_wait_seconds}
                        onChange={(e) => setInviteForm({ ...inviteForm, max_wait_seconds: e.target.value })}
                      />
                    </label>
                    <label>
                      Retry file
                      <input
                        type="text"
                        value={inviteForm.retry_file}
                        onChange={(e) => setInviteForm({ ...inviteForm, retry_file: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Max flood waits
                      <input
                        type="number"
                        value={inviteForm.max_flood_waits}
                        onChange={(e) => setInviteForm({ ...inviteForm, max_flood_waits: e.target.value })}
                      />
                    </label>
                    <label>
                      Max consecutive errors
                      <input
                        type="number"
                        value={inviteForm.max_consecutive_errors}
                        onChange={(e) => setInviteForm({ ...inviteForm, max_consecutive_errors: e.target.value })}
                      />
                    </label>
                    <label>
                      Max total errors
                      <input
                        type="number"
                        value={inviteForm.max_total_errors}
                        onChange={(e) => setInviteForm({ ...inviteForm, max_total_errors: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={inviteForm.exclude_bots}
                        onChange={(e) => setInviteForm({ ...inviteForm, exclude_bots: e.target.checked })}
                      />
                      Exclude bots
                    </label>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={inviteForm.exclude_deleted}
                        onChange={(e) => setInviteForm({ ...inviteForm, exclude_deleted: e.target.checked })}
                      />
                      Exclude deleted
                    </label>
                    <label>
                      Last seen days
                      <input
                        type="number"
                        value={inviteForm.last_seen_days}
                        onChange={(e) => setInviteForm({ ...inviteForm, last_seen_days: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Whitelist path
                      <input
                        type="text"
                        value={inviteForm.whitelist_path}
                        onChange={(e) => setInviteForm({ ...inviteForm, whitelist_path: e.target.value })}
                      />
                    </label>
                    <label>
                      Blacklist path
                      <input
                        type="text"
                        value={inviteForm.blacklist_path}
                        onChange={(e) => setInviteForm({ ...inviteForm, blacklist_path: e.target.value })}
                      />
                    </label>
                    <label>
                      Max users
                      <input
                        type="number"
                        value={inviteForm.max_users}
                        onChange={(e) => setInviteForm({ ...inviteForm, max_users: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </details>
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
                      safe_mode: inviteForm.safe_mode,
                      batch_size: toInt(inviteForm.batch_size, 5),
                      batch_delay: toInt(inviteForm.batch_delay, 60),
                      message_delay: toInt(inviteForm.message_delay, 5),
                      rate_policy: buildRatePolicy(inviteForm),
                      safety_limits: buildSafety(inviteForm),
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
              <div className="toggles">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={bulkAddForm.safe_mode}
                    onChange={(e) => setBulkAddForm({ ...bulkAddForm, safe_mode: e.target.checked })}
                  />
                  Safe mode
                </label>
              </div>
              <details>
                <summary>Advanced options</summary>
                <div className="advanced">
                  <div className="row">
                    <label>
                      Batch size
                      <input
                        type="number"
                        value={bulkAddForm.batch_size}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, batch_size: e.target.value })}
                      />
                    </label>
                    <label>
                      Batch delay (sec)
                      <input
                        type="number"
                        value={bulkAddForm.batch_delay}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, batch_delay: e.target.value })}
                      />
                    </label>
                    <label>
                      Message delay (sec)
                      <input
                        type="number"
                        value={bulkAddForm.message_delay}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, message_delay: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Rate policy
                      <select
                        value={bulkAddForm.rate_mode}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, rate_mode: e.target.value })}
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
                        value={bulkAddForm.max_wait_seconds}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, max_wait_seconds: e.target.value })}
                      />
                    </label>
                    <label>
                      Retry file
                      <input
                        type="text"
                        value={bulkAddForm.retry_file}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, retry_file: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Max flood waits
                      <input
                        type="number"
                        value={bulkAddForm.max_flood_waits}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, max_flood_waits: e.target.value })}
                      />
                    </label>
                    <label>
                      Max consecutive errors
                      <input
                        type="number"
                        value={bulkAddForm.max_consecutive_errors}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, max_consecutive_errors: e.target.value })}
                      />
                    </label>
                    <label>
                      Max total errors
                      <input
                        type="number"
                        value={bulkAddForm.max_total_errors}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, max_total_errors: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={bulkAddForm.exclude_bots}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, exclude_bots: e.target.checked })}
                      />
                      Exclude bots
                    </label>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={bulkAddForm.exclude_deleted}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, exclude_deleted: e.target.checked })}
                      />
                      Exclude deleted
                    </label>
                    <label>
                      Last seen days
                      <input
                        type="number"
                        value={bulkAddForm.last_seen_days}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, last_seen_days: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Whitelist path
                      <input
                        type="text"
                        value={bulkAddForm.whitelist_path}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, whitelist_path: e.target.value })}
                      />
                    </label>
                    <label>
                      Blacklist path
                      <input
                        type="text"
                        value={bulkAddForm.blacklist_path}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, blacklist_path: e.target.value })}
                      />
                    </label>
                    <label>
                      Max users
                      <input
                        type="number"
                        value={bulkAddForm.max_users}
                        onChange={(e) => setBulkAddForm({ ...bulkAddForm, max_users: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </details>
              <button
                className="primary"
                onClick={() =>
                  handleJobStart(
                    "Bulk add",
                    api.startBulkAdd({
                      session: bulkAddForm.session,
                      input_file: bulkAddForm.input_file,
                      target_ref: bulkAddForm.target_ref,
                      safe_mode: bulkAddForm.safe_mode,
                      batch_size: toInt(bulkAddForm.batch_size, 3),
                      batch_delay: toInt(bulkAddForm.batch_delay, 120),
                      message_delay: toInt(bulkAddForm.message_delay, 15),
                      rate_policy: buildRatePolicy(bulkAddForm),
                      safety_limits: buildSafety(bulkAddForm),
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
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={forwardForm.safe_mode}
                    onChange={(e) => setForwardForm({ ...forwardForm, safe_mode: e.target.checked })}
                  />
                  Safe mode
                </label>
              </div>
              <details>
                <summary>Advanced options</summary>
                <div className="advanced">
                  <div className="row">
                    <label>
                      Batch size
                      <input
                        type="number"
                        value={forwardForm.batch_size}
                        onChange={(e) => setForwardForm({ ...forwardForm, batch_size: e.target.value })}
                      />
                    </label>
                    <label>
                      Batch delay (sec)
                      <input
                        type="number"
                        value={forwardForm.batch_delay}
                        onChange={(e) => setForwardForm({ ...forwardForm, batch_delay: e.target.value })}
                      />
                    </label>
                    <label>
                      Message delay (sec)
                      <input
                        type="number"
                        value={forwardForm.message_delay}
                        onChange={(e) => setForwardForm({ ...forwardForm, message_delay: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Rate policy
                      <select
                        value={forwardForm.rate_mode}
                        onChange={(e) => setForwardForm({ ...forwardForm, rate_mode: e.target.value })}
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
                        value={forwardForm.max_wait_seconds}
                        onChange={(e) => setForwardForm({ ...forwardForm, max_wait_seconds: e.target.value })}
                      />
                    </label>
                    <label>
                      Retry file
                      <input
                        type="text"
                        value={forwardForm.retry_file}
                        onChange={(e) => setForwardForm({ ...forwardForm, retry_file: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Max flood waits
                      <input
                        type="number"
                        value={forwardForm.max_flood_waits}
                        onChange={(e) => setForwardForm({ ...forwardForm, max_flood_waits: e.target.value })}
                      />
                    </label>
                    <label>
                      Max consecutive errors
                      <input
                        type="number"
                        value={forwardForm.max_consecutive_errors}
                        onChange={(e) => setForwardForm({ ...forwardForm, max_consecutive_errors: e.target.value })}
                      />
                    </label>
                    <label>
                      Max total errors
                      <input
                        type="number"
                        value={forwardForm.max_total_errors}
                        onChange={(e) => setForwardForm({ ...forwardForm, max_total_errors: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={forwardForm.exclude_bots}
                        onChange={(e) => setForwardForm({ ...forwardForm, exclude_bots: e.target.checked })}
                      />
                      Exclude bots
                    </label>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={forwardForm.exclude_deleted}
                        onChange={(e) => setForwardForm({ ...forwardForm, exclude_deleted: e.target.checked })}
                      />
                      Exclude deleted
                    </label>
                    <label>
                      Last seen days
                      <input
                        type="number"
                        value={forwardForm.last_seen_days}
                        onChange={(e) => setForwardForm({ ...forwardForm, last_seen_days: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Whitelist path
                      <input
                        type="text"
                        value={forwardForm.whitelist_path}
                        onChange={(e) => setForwardForm({ ...forwardForm, whitelist_path: e.target.value })}
                      />
                    </label>
                    <label>
                      Blacklist path
                      <input
                        type="text"
                        value={forwardForm.blacklist_path}
                        onChange={(e) => setForwardForm({ ...forwardForm, blacklist_path: e.target.value })}
                      />
                    </label>
                    <label>
                      Max users
                      <input
                        type="number"
                        value={forwardForm.max_users}
                        onChange={(e) => setForwardForm({ ...forwardForm, max_users: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </details>
              <button
                className="primary"
                onClick={() =>
                  handleJobStart(
                    "Forward",
                    api.startForward({
                      session: forwardForm.session,
                      input_file: forwardForm.input_file,
                      source_peer: forwardForm.source_peer || undefined,
                      message_id: parseMessageId(forwardForm.message_id) || undefined,
                      message_link: forwardForm.message_link || undefined,
                      drop_author: forwardForm.drop_author,
                      has_media: forwardForm.has_media,
                      safe_mode: forwardForm.safe_mode,
                      batch_size: toInt(forwardForm.batch_size, 5),
                      batch_delay: toInt(forwardForm.batch_delay, 60),
                      message_delay: toInt(forwardForm.message_delay, 5),
                      rate_policy: buildRatePolicy(forwardForm),
                      safety_limits: buildSafety(forwardForm),
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
                    checked={multiForm.safe_mode}
                    onChange={(e) => setMultiForm({ ...multiForm, safe_mode: e.target.checked })}
                  />
                  Safe mode
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={multiForm.use_spintax}
                    onChange={(e) => setMultiForm({ ...multiForm, use_spintax: e.target.checked })}
                  />
                  Spintax
                </label>
              </div>
              <details>
                <summary>Advanced options</summary>
                <div className="advanced">
                  <div className="row">
                    <label>
                      Batch size
                      <input
                        type="number"
                        value={multiForm.batch_size}
                        onChange={(e) => setMultiForm({ ...multiForm, batch_size: e.target.value })}
                      />
                    </label>
                    <label>
                      Batch delay (sec)
                      <input
                        type="number"
                        value={multiForm.batch_delay}
                        onChange={(e) => setMultiForm({ ...multiForm, batch_delay: e.target.value })}
                      />
                    </label>
                    <label>
                      Message delay (sec)
                      <input
                        type="number"
                        value={multiForm.message_delay}
                        onChange={(e) => setMultiForm({ ...multiForm, message_delay: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Rate policy
                      <select
                        value={multiForm.rate_mode}
                        onChange={(e) => setMultiForm({ ...multiForm, rate_mode: e.target.value })}
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
                        value={multiForm.max_wait_seconds}
                        onChange={(e) => setMultiForm({ ...multiForm, max_wait_seconds: e.target.value })}
                      />
                    </label>
                    <label>
                      Retry file
                      <input
                        type="text"
                        value={multiForm.retry_file}
                        onChange={(e) => setMultiForm({ ...multiForm, retry_file: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Max flood waits
                      <input
                        type="number"
                        value={multiForm.max_flood_waits}
                        onChange={(e) => setMultiForm({ ...multiForm, max_flood_waits: e.target.value })}
                      />
                    </label>
                    <label>
                      Max consecutive errors
                      <input
                        type="number"
                        value={multiForm.max_consecutive_errors}
                        onChange={(e) => setMultiForm({ ...multiForm, max_consecutive_errors: e.target.value })}
                      />
                    </label>
                    <label>
                      Max total errors
                      <input
                        type="number"
                        value={multiForm.max_total_errors}
                        onChange={(e) => setMultiForm({ ...multiForm, max_total_errors: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={multiForm.exclude_bots}
                        onChange={(e) => setMultiForm({ ...multiForm, exclude_bots: e.target.checked })}
                      />
                      Exclude bots
                    </label>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={multiForm.exclude_deleted}
                        onChange={(e) => setMultiForm({ ...multiForm, exclude_deleted: e.target.checked })}
                      />
                      Exclude deleted
                    </label>
                    <label>
                      Last seen days
                      <input
                        type="number"
                        value={multiForm.last_seen_days}
                        onChange={(e) => setMultiForm({ ...multiForm, last_seen_days: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Whitelist path
                      <input
                        type="text"
                        value={multiForm.whitelist_path}
                        onChange={(e) => setMultiForm({ ...multiForm, whitelist_path: e.target.value })}
                      />
                    </label>
                    <label>
                      Blacklist path
                      <input
                        type="text"
                        value={multiForm.blacklist_path}
                        onChange={(e) => setMultiForm({ ...multiForm, blacklist_path: e.target.value })}
                      />
                    </label>
                    <label>
                      Max users
                      <input
                        type="number"
                        value={multiForm.max_users}
                        onChange={(e) => setMultiForm({ ...multiForm, max_users: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </details>
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
                      safe_mode: multiForm.safe_mode,
                      batch_size: toInt(multiForm.batch_size, 5),
                      batch_delay: toInt(multiForm.batch_delay, 60),
                      message_delay: toInt(multiForm.message_delay, 5),
                      rate_policy: buildRatePolicy(multiForm),
                      safety_limits: buildSafety(multiForm),
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
                    checked={multiInviteForm.safe_mode}
                    onChange={(e) => setMultiInviteForm({ ...multiInviteForm, safe_mode: e.target.checked })}
                  />
                  Safe mode
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={multiInviteForm.use_spintax}
                    onChange={(e) => setMultiInviteForm({ ...multiInviteForm, use_spintax: e.target.checked })}
                  />
                  Spintax
                </label>
              </div>
              <details>
                <summary>Advanced options</summary>
                <div className="advanced">
                  <div className="row">
                    <label>
                      Batch size
                      <input
                        type="number"
                        value={multiInviteForm.batch_size}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, batch_size: e.target.value })}
                      />
                    </label>
                    <label>
                      Batch delay (sec)
                      <input
                        type="number"
                        value={multiInviteForm.batch_delay}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, batch_delay: e.target.value })}
                      />
                    </label>
                    <label>
                      Message delay (sec)
                      <input
                        type="number"
                        value={multiInviteForm.message_delay}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, message_delay: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Rate policy
                      <select
                        value={multiInviteForm.rate_mode}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, rate_mode: e.target.value })}
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
                        value={multiInviteForm.max_wait_seconds}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, max_wait_seconds: e.target.value })}
                      />
                    </label>
                    <label>
                      Retry file
                      <input
                        type="text"
                        value={multiInviteForm.retry_file}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, retry_file: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Max flood waits
                      <input
                        type="number"
                        value={multiInviteForm.max_flood_waits}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, max_flood_waits: e.target.value })}
                      />
                    </label>
                    <label>
                      Max consecutive errors
                      <input
                        type="number"
                        value={multiInviteForm.max_consecutive_errors}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, max_consecutive_errors: e.target.value })}
                      />
                    </label>
                    <label>
                      Max total errors
                      <input
                        type="number"
                        value={multiInviteForm.max_total_errors}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, max_total_errors: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={multiInviteForm.exclude_bots}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, exclude_bots: e.target.checked })}
                      />
                      Exclude bots
                    </label>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={multiInviteForm.exclude_deleted}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, exclude_deleted: e.target.checked })}
                      />
                      Exclude deleted
                    </label>
                    <label>
                      Last seen days
                      <input
                        type="number"
                        value={multiInviteForm.last_seen_days}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, last_seen_days: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Whitelist path
                      <input
                        type="text"
                        value={multiInviteForm.whitelist_path}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, whitelist_path: e.target.value })}
                      />
                    </label>
                    <label>
                      Blacklist path
                      <input
                        type="text"
                        value={multiInviteForm.blacklist_path}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, blacklist_path: e.target.value })}
                      />
                    </label>
                    <label>
                      Max users
                      <input
                        type="number"
                        value={multiInviteForm.max_users}
                        onChange={(e) => setMultiInviteForm({ ...multiInviteForm, max_users: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </details>
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
                      safe_mode: multiInviteForm.safe_mode,
                      batch_size: toInt(multiInviteForm.batch_size, 5),
                      batch_delay: toInt(multiInviteForm.batch_delay, 60),
                      message_delay: toInt(multiInviteForm.message_delay, 5),
                      rate_policy: buildRatePolicy(multiInviteForm),
                      safety_limits: buildSafety(multiInviteForm),
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
                Target group (@group or id)
                <input
                  type="text"
                  value={multiBulkAddForm.target_ref}
                  onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, target_ref: e.target.value })}
                />
              </label>
              <div className="toggles">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={multiBulkAddForm.safe_mode}
                    onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, safe_mode: e.target.checked })}
                  />
                  Safe mode
                </label>
              </div>
              <details>
                <summary>Advanced options</summary>
                <div className="advanced">
                  <div className="row">
                    <label>
                      Batch size
                      <input
                        type="number"
                        value={multiBulkAddForm.batch_size}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, batch_size: e.target.value })}
                      />
                    </label>
                    <label>
                      Batch delay (sec)
                      <input
                        type="number"
                        value={multiBulkAddForm.batch_delay}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, batch_delay: e.target.value })}
                      />
                    </label>
                    <label>
                      Message delay (sec)
                      <input
                        type="number"
                        value={multiBulkAddForm.message_delay}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, message_delay: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Rate policy
                      <select
                        value={multiBulkAddForm.rate_mode}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, rate_mode: e.target.value })}
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
                        value={multiBulkAddForm.max_wait_seconds}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, max_wait_seconds: e.target.value })}
                      />
                    </label>
                    <label>
                      Retry file
                      <input
                        type="text"
                        value={multiBulkAddForm.retry_file}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, retry_file: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Max flood waits
                      <input
                        type="number"
                        value={multiBulkAddForm.max_flood_waits}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, max_flood_waits: e.target.value })}
                      />
                    </label>
                    <label>
                      Max consecutive errors
                      <input
                        type="number"
                        value={multiBulkAddForm.max_consecutive_errors}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, max_consecutive_errors: e.target.value })}
                      />
                    </label>
                    <label>
                      Max total errors
                      <input
                        type="number"
                        value={multiBulkAddForm.max_total_errors}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, max_total_errors: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={multiBulkAddForm.exclude_bots}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, exclude_bots: e.target.checked })}
                      />
                      Exclude bots
                    </label>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={multiBulkAddForm.exclude_deleted}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, exclude_deleted: e.target.checked })}
                      />
                      Exclude deleted
                    </label>
                    <label>
                      Last seen days
                      <input
                        type="number"
                        value={multiBulkAddForm.last_seen_days}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, last_seen_days: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Whitelist path
                      <input
                        type="text"
                        value={multiBulkAddForm.whitelist_path}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, whitelist_path: e.target.value })}
                      />
                    </label>
                    <label>
                      Blacklist path
                      <input
                        type="text"
                        value={multiBulkAddForm.blacklist_path}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, blacklist_path: e.target.value })}
                      />
                    </label>
                    <label>
                      Max users
                      <input
                        type="number"
                        value={multiBulkAddForm.max_users}
                        onChange={(e) => setMultiBulkAddForm({ ...multiBulkAddForm, max_users: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </details>
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
                      safe_mode: multiBulkAddForm.safe_mode,
                      batch_size: toInt(multiBulkAddForm.batch_size, 3),
                      batch_delay: toInt(multiBulkAddForm.batch_delay, 120),
                      message_delay: toInt(multiBulkAddForm.message_delay, 15),
                      rate_policy: buildRatePolicy(multiBulkAddForm),
                      safety_limits: buildSafety(multiBulkAddForm),
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
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={multiForwardForm.safe_mode}
                    onChange={(e) => setMultiForwardForm({ ...multiForwardForm, safe_mode: e.target.checked })}
                  />
                  Safe mode
                </label>
              </div>
              <details>
                <summary>Advanced options</summary>
                <div className="advanced">
                  <div className="row">
                    <label>
                      Batch size
                      <input
                        type="number"
                        value={multiForwardForm.batch_size}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, batch_size: e.target.value })}
                      />
                    </label>
                    <label>
                      Batch delay (sec)
                      <input
                        type="number"
                        value={multiForwardForm.batch_delay}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, batch_delay: e.target.value })}
                      />
                    </label>
                    <label>
                      Message delay (sec)
                      <input
                        type="number"
                        value={multiForwardForm.message_delay}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, message_delay: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Rate policy
                      <select
                        value={multiForwardForm.rate_mode}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, rate_mode: e.target.value })}
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
                        value={multiForwardForm.max_wait_seconds}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, max_wait_seconds: e.target.value })}
                      />
                    </label>
                    <label>
                      Retry file
                      <input
                        type="text"
                        value={multiForwardForm.retry_file}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, retry_file: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Max flood waits
                      <input
                        type="number"
                        value={multiForwardForm.max_flood_waits}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, max_flood_waits: e.target.value })}
                      />
                    </label>
                    <label>
                      Max consecutive errors
                      <input
                        type="number"
                        value={multiForwardForm.max_consecutive_errors}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, max_consecutive_errors: e.target.value })}
                      />
                    </label>
                    <label>
                      Max total errors
                      <input
                        type="number"
                        value={multiForwardForm.max_total_errors}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, max_total_errors: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={multiForwardForm.exclude_bots}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, exclude_bots: e.target.checked })}
                      />
                      Exclude bots
                    </label>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={multiForwardForm.exclude_deleted}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, exclude_deleted: e.target.checked })}
                      />
                      Exclude deleted
                    </label>
                    <label>
                      Last seen days
                      <input
                        type="number"
                        value={multiForwardForm.last_seen_days}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, last_seen_days: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <label>
                      Whitelist path
                      <input
                        type="text"
                        value={multiForwardForm.whitelist_path}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, whitelist_path: e.target.value })}
                      />
                    </label>
                    <label>
                      Blacklist path
                      <input
                        type="text"
                        value={multiForwardForm.blacklist_path}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, blacklist_path: e.target.value })}
                      />
                    </label>
                    <label>
                      Max users
                      <input
                        type="number"
                        value={multiForwardForm.max_users}
                        onChange={(e) => setMultiForwardForm({ ...multiForwardForm, max_users: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </details>
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
                      message_id: parseMessageId(multiForwardForm.message_id) || undefined,
                      message_link: multiForwardForm.message_link || undefined,
                      drop_author: multiForwardForm.drop_author,
                      has_media: multiForwardForm.has_media,
                      safe_mode: multiForwardForm.safe_mode,
                      batch_size: toInt(multiForwardForm.batch_size, 5),
                      batch_delay: toInt(multiForwardForm.batch_delay, 60),
                      message_delay: toInt(multiForwardForm.message_delay, 5),
                      rate_policy: buildRatePolicy(multiForwardForm),
                      safety_limits: buildSafety(multiForwardForm),
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
                <div key={job.id} className="job-card">
                  <div>
                    <h4>{job.type}</h4>
                    <p className="meta">{job.id}</p>
                    <p className="meta">Status: {job.status}</p>
                  </div>
                  <div className="job-actions">
                    {job.status === "running" && (
                      <button
                        className="danger"
                        onClick={async () => {
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

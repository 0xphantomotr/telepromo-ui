import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import "./App.css";
import { api } from "./lib/api";
import { LICENSE_API_BASE, decodeTokenPayload, isTauri, licensing } from "./lib/license";

const POLL_INTERVAL_MS = 6000;

const WORKFLOW_NODE_WIDTH = 96;
const WORKFLOW_NODE_HEIGHT = 96;
const WORKFLOW_PADDING = 220;
const WORKFLOW_MIN_SIZE = 1200;
// Keep new nodes clear of the blocks palette overlay (top-left of the canvas).
const WORKFLOW_NODE_START_X = 40;
const WORKFLOW_NODE_START_Y = 160;
const WORKFLOW_NODE_GAP = 24;
const WORKFLOW_NODE_STEP_X = WORKFLOW_NODE_WIDTH + WORKFLOW_NODE_GAP;
const WORKFLOW_NODE_STEP_Y = WORKFLOW_NODE_HEIGHT + WORKFLOW_NODE_GAP;
const NAV_ICONS: Record<string, string> = {
  overview: "/grid.svg",
  sessions: "/id.svg",
  presets: "/craft.svg",
  workflows: "/loop.svg",
  single: "/single.svg",
  multi: "/group.svg",
  metrics: "/metrics.svg",
  license: "/license.svg",
};
const WORKFLOW_NODE_ICONS: Record<string, string> = {
  session: "/session.svg",
  dm: "/dm.svg",
  invite: "/invite.svg",
  bulk_add: "/bulkAdd.svg",
  forward: "/forward.svg",
  wait: "/wait.svg",
  warmup: "/warmup.svg",
};
const SPINTAX_HELP =
  "Spintax picks a random option inside {a|b}. Example: Hey {friend|there}! AI Spintax auto-generates variations using your default AI profile.";

const navIconStyle = (src: string): CSSProperties => ({ "--icon": `url(${src})` } as CSSProperties);

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

type AiProfile = {
  id: string;
  label?: string | null;
  provider: string;
  has_key: boolean;
  model?: string | null;
};

type AiProfileForm = {
  id?: string;
  label: string;
  provider: string;
  api_key: string;
  model: string;
};

type CommonOptions = {
  use_spintax: boolean;
  spintax_ai: boolean;
  spintax_variations: string;
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

type SessionFilter = "all" | "proxy" | "direct" | "running";

type SessionView = SessionItem & {
  running: number;
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
  all_csv_users?: boolean | null;
  max_users?: number | null;
  min_delay?: number | null;
  max_delay?: number | null;
  total_messages?: number | null;
  warmup_mode?: string | null;
  warmup_modes?: string[] | null;
  context_messages?: number | null;
  ai_profile_id?: string | null;
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
  all_csv_users: boolean;
  max_users: string;
  min_delay: string;
  max_delay: string;
  total_messages: string;
  warmup_modes: string[];
  context_messages: string;
  ai_profile_id: string;
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

type TelegramApiSetupForm = {
  api_id: string;
  api_hash: string;
};

type TelegramApiSetupStatus = {
  configured: boolean;
  api_id?: string | null;
  api_hash_set: boolean;
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
  spintax_ai: false,
  spintax_variations: "5",
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
  all_csv_users: true,
  max_users: "",
  min_delay: "600",
  max_delay: "1800",
  total_messages: "12",
  warmup_modes: ["reply"],
  context_messages: "50",
  ai_profile_id: "",
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

const defaultTelegramApiSetupForm: TelegramApiSetupForm = {
  api_id: "",
  api_hash: "",
};

const TELEGRAM_API_MISSING_MESSAGE =
  "Telegram API credentials are missing. Open Sessions -> API Setup and save API_ID + API_HASH.";

const isMissingTelegramApiError = (message: string) => {
  const normalized = (message || "").toLowerCase();
  return (
    normalized.includes("missing api_id/api_hash") ||
    normalized.includes("telegram api credentials are not configured")
  );
};


const defaultWorkflowDraft: WorkflowDraft = {
  id: "",
  name: "",
  nodes: [
    {
      id: "session1",
      type: "session",
      config: { session: "", loop_count: 1 },
      position: { x: WORKFLOW_NODE_START_X, y: WORKFLOW_NODE_START_Y },
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

const normalizeText = (value: string) => value.trim().toLowerCase();

const sessionMatchesQuery = (session: SessionItem, query: string) => {
  const q = normalizeText(query);
  if (!q) return true;
  const name = normalizeText(session.name);
  const username = normalizeText(session.username || "");
  const phone = (session.phone || "").replace(/\s+/g, "");
  return name.includes(q) || username.includes(q) || phone.includes(q.replace(/\s+/g, ""));
};

const filterSessions = (sessions: SessionView[], query: string, filter: SessionFilter) =>
  sessions.filter((session) => {
    if (!sessionMatchesQuery(session, query)) return false;
    if (filter === "proxy") return Boolean(session.proxy);
    if (filter === "direct") return !session.proxy;
    if (filter === "running") return session.running > 0;
    return true;
  });

type PresetKind = "dm" | "warmup";

const normalizePresetKind = (kind?: string) => (normalizeText(kind || "") === "warmup" ? "warmup" : "dm");

const warmupModesLabel = (preset: PresetItem) => {
  const modes = preset.warmup_modes?.length
    ? preset.warmup_modes
    : preset.warmup_mode
    ? [preset.warmup_mode]
    : [];
  const cleaned = (modes || [])
    .map((mode) => String(mode || "").trim())
    .filter(Boolean);
  return cleaned.length ? cleaned.join(", ") : "react";
};

const presetMatchesQuery = (preset: PresetItem, query: string) => {
  const q = normalizeText(query);
  if (!q) return true;
  const name = normalizeText(preset.name);
  const kind = normalizeText(preset.kind || "dm");
  const rateMode = normalizeText(preset.rate_mode || "");
  const kindNorm = normalizePresetKind(preset.kind);
  const modes = kindNorm === "warmup" ? normalizeText(warmupModesLabel(preset)) : "";
  return name.includes(q) || kind.includes(q) || rateMode.includes(q) || (modes ? modes.includes(q) : false);
};

const presetPrimaryMeta = (preset: PresetItem, kind: PresetKind) => {
  if (kind === "warmup") {
    const total = preset.total_messages ?? 0;
    const min = preset.min_delay ?? 0;
    const max = preset.max_delay ?? 0;
    return `Total ${total} • ${min}-${max}s • Modes ${warmupModesLabel(preset)}`;
  }
  const users = preset.all_csv_users || !preset.max_users ? "all" : String(preset.max_users);
  return `Interval ${preset.interval_seconds}s • Rate ${preset.rate_mode} • Users ${users}`;
};

type SessionSelectProps = {
  value: string;
  options: SessionView[];
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

function SessionSelect({ value, options, onChange, placeholder = "Select session", disabled }: SessionSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => options.find((opt) => opt.name === value) || null, [options, value]);
  const filtered = useMemo(() => filterSessions(options, query, "all"), [options, query]);
  const sorted = useMemo(() => {
    const next = filtered.slice();
    next.sort((a, b) => {
      if (b.running !== a.running) return b.running - a.running;
      const aLast = a.last_used || "";
      const bLast = b.last_used || "";
      if (bLast !== aLast) return bLast.localeCompare(aLast);
      return a.name.localeCompare(b.name);
    });
    return next;
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="session-combo" ref={rootRef}>
      <button
        type="button"
        className="session-combo-trigger"
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          setQuery("");
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="session-combo-trigger-text">
          {selected ? selected.name : placeholder}
        </span>
      </button>
      {open && !disabled && (
        <div className="session-combo-menu" role="listbox">
          <div className="session-combo-search">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions..."
              autoFocus
            />
          </div>
          <div className="session-combo-options">
            {sorted.length === 0 ? (
              <div className="session-combo-empty">No matching sessions</div>
            ) : (
              sorted.map((opt) => {
                const isSelected = opt.name === value;
                return (
                  <button
                    key={opt.name}
                    type="button"
                    className={`session-combo-option${isSelected ? " selected" : ""}`}
                    onClick={() => {
                      onChange(opt.name);
                      setOpen(false);
                    }}
                  >
                    <div>
                      <div className="session-combo-option-title">{opt.name}</div>
                      <div className="session-combo-option-meta">
                        {opt.username ? `@${opt.username}` : "Unknown"} • {opt.phone || "No phone"}
                      </div>
                    </div>
                    <div className="session-combo-option-badges">
                      <span className={`badge ${opt.proxy ? "on" : "off"}`}>{opt.proxy ? "Proxy" : "Direct"}</span>
                      {opt.running > 0 ? <span className="badge running">Running {opt.running}</span> : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type PresetSelectProps = {
  value: string;
  options: PresetItem[];
  onChange: (next: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
};

function PresetSelect({
  value,
  options,
  onChange,
  placeholder = "Select preset",
  searchPlaceholder = "Search presets...",
  allowEmpty = true,
  emptyLabel = "No preset (use defaults)",
  disabled,
}: PresetSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => options.find((opt) => opt.name === value) || null, [options, value]);
  const filtered = useMemo(() => options.filter((preset) => presetMatchesQuery(preset, query)), [options, query]);
  const sorted = useMemo(() => {
    const next = filtered.slice();
    next.sort((a, b) => a.name.localeCompare(b.name));
    return next;
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerText = selected ? selected.name : value ? value : placeholder;

  return (
    <div className="session-combo" ref={rootRef}>
      <button
        type="button"
        className="session-combo-trigger"
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          setQuery("");
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="session-combo-trigger-text">{triggerText}</span>
      </button>
      {open && !disabled && (
        <div className="session-combo-menu" role="listbox">
          <div className="session-combo-search">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              autoFocus
            />
          </div>
          <div className="session-combo-options">
            {allowEmpty ? (
              <button
                type="button"
                className={`session-combo-option${value === "" ? " selected" : ""}`}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <div>
                  <div className="session-combo-option-title">{emptyLabel}</div>
                  <div className="session-combo-option-meta">Clears the preset selection</div>
                </div>
              </button>
            ) : null}
            {sorted.length === 0 ? (
              <div className="session-combo-empty">No matching presets</div>
            ) : (
              sorted.map((opt) => {
                const kind = normalizePresetKind(opt.kind);
                const isSelected = opt.name === value;
                return (
                  <button
                    key={`${kind}:${opt.name}`}
                    type="button"
                    className={`session-combo-option${isSelected ? " selected" : ""}`}
                    onClick={() => {
                      onChange(opt.name);
                      setOpen(false);
                    }}
                  >
                    <div>
                      <div className="session-combo-option-title">{opt.name}</div>
                      <div className="session-combo-option-meta">{presetPrimaryMeta(opt, kind)}</div>
                    </div>
                    <div className="session-combo-option-badges">
                      {kind === "warmup" ? (
                        <span className="badge on">Warmup</span>
                      ) : (
                        <span className="badge off">{opt.rate_mode}</span>
                      )}
                      {kind === "warmup" && opt.ai_profile_id ? <span className="badge running">AI</span> : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type SessionBrowserProps = {
  sessions: SessionView[];
  selected?: string | null;
  onSelect?: (name: string) => void;
  maxHeight?: number;
  emptyText?: string;
};

function SessionBrowser({ sessions, selected, onSelect, maxHeight, emptyText }: SessionBrowserProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SessionFilter>("all");

  const filtered = useMemo(() => {
    const next = filterSessions(sessions, query, filter);
    next.sort((a, b) => {
      if (b.running !== a.running) return b.running - a.running;
      const aLast = a.last_used || "";
      const bLast = b.last_used || "";
      if (bLast !== aLast) return bLast.localeCompare(aLast);
      return a.name.localeCompare(b.name);
    });
    return next;
  }, [sessions, query, filter]);

  const counts = useMemo(() => {
    const proxy = sessions.filter((s) => s.proxy).length;
    const direct = sessions.length - proxy;
    const running = sessions.filter((s) => s.running > 0).length;
    return { proxy, direct, running };
  }, [sessions]);

  return (
    <div className="session-browser">
      <div className="session-browser-controls">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions..."
        />
        <div className="chip-row" role="tablist" aria-label="Session filters">
          <button type="button" className={`chip${filter === "all" ? " active" : ""}`} onClick={() => setFilter("all")}>
            All
          </button>
          <button
            type="button"
            className={`chip${filter === "running" ? " active" : ""}`}
            onClick={() => setFilter("running")}
          >
            Running ({counts.running})
          </button>
          <button
            type="button"
            className={`chip${filter === "proxy" ? " active" : ""}`}
            onClick={() => setFilter("proxy")}
          >
            Proxy ({counts.proxy})
          </button>
          <button
            type="button"
            className={`chip${filter === "direct" ? " active" : ""}`}
            onClick={() => setFilter("direct")}
          >
            Direct ({counts.direct})
          </button>
          <span className="chip-hint">
            {filtered.length}/{sessions.length}
          </span>
        </div>
      </div>
      <div className="session-list session-list-scroll" style={maxHeight ? { maxHeight } : undefined}>
        {filtered.length === 0 ? (
          <p className="muted">{emptyText || "No sessions found."}</p>
        ) : (
          filtered.map((session) => (
            <div
              key={session.name}
              className={`session-card interactive${selected === session.name ? " selected" : ""}`}
              onClick={() => onSelect?.(session.name)}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onKeyDown={(e) => {
                if (!onSelect) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(session.name);
                }
              }}
            >
              <div>
                <h4>{session.name}</h4>
                <p className="meta">
                  {session.username ? `@${session.username}` : "Unknown"} • {session.phone || "No phone"}
                </p>
              </div>
              <div className="badge-stack">
                <div className={`badge ${session.proxy ? "on" : "off"}`}>{session.proxy ? "Proxy" : "Direct"}</div>
                {session.running > 0 ? <div className="badge running">Running {session.running}</div> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type MultiSessionPickerProps = {
  sessions: SessionView[];
  selected: string[];
  onToggle: (name: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
};

function MultiSessionPicker({ sessions, selected, onToggle, onSelectAll, onClear }: MultiSessionPickerProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SessionFilter>("all");

  const filtered = useMemo(() => filterSessions(sessions, query, filter), [sessions, query, filter]);
  const counts = useMemo(() => {
    const proxy = sessions.filter((s) => s.proxy).length;
    const direct = sessions.length - proxy;
    const running = sessions.filter((s) => s.running > 0).length;
    return { proxy, direct, running };
  }, [sessions]);

  return (
    <div className="session-picker">
      <div className="picker-actions">
        <button className="ghost" onClick={onSelectAll}>
          Select all
        </button>
        <button className="ghost" onClick={onClear}>
          Clear
        </button>
        <span className="hint">{selected.length} selected</span>
      </div>
      <div className="session-browser-controls">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions..."
        />
        <div className="chip-row" role="tablist" aria-label="Session filters">
          <button type="button" className={`chip${filter === "all" ? " active" : ""}`} onClick={() => setFilter("all")}>
            All
          </button>
          <button
            type="button"
            className={`chip${filter === "running" ? " active" : ""}`}
            onClick={() => setFilter("running")}
          >
            Running ({counts.running})
          </button>
          <button
            type="button"
            className={`chip${filter === "proxy" ? " active" : ""}`}
            onClick={() => setFilter("proxy")}
          >
            Proxy ({counts.proxy})
          </button>
          <button
            type="button"
            className={`chip${filter === "direct" ? " active" : ""}`}
            onClick={() => setFilter("direct")}
          >
            Direct ({counts.direct})
          </button>
          <span className="chip-hint">
            {filtered.length}/{sessions.length}
          </span>
        </div>
      </div>
      <div className="picker-grid picker-grid-scroll">
        {filtered.map((session) => (
          <label key={session.name} className="check">
            <input
              type="checkbox"
              checked={selected.includes(session.name)}
              onChange={() => onToggle(session.name)}
            />
            <span className="check-label">
              <span className="check-title">{session.name}</span>
              <span className="check-meta">{session.proxy ? "Proxy" : "Direct"}{session.running > 0 ? ` • Running ${session.running}` : ""}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [licenseReady, setLicenseReady] = useState(false);
  const [licenseActive, setLicenseActive] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [licenseExp, setLicenseExp] = useState<number | null>(null);
  const [licenseKeyValue, setLicenseKeyValue] = useState<string | null>(null);
  const [licenseEmail, setLicenseEmail] = useState<string | null>(null);
  const [resettingData, setResettingData] = useState(false);
  const [resettingFactory, setResettingFactory] = useState(false);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [proxyForm, setProxyForm] = useState<SessionProxyForm>(defaultProxyForm);
  const [savingProxy, setSavingProxy] = useState(false);
  const [aiProfiles, setAiProfiles] = useState<AiProfile[]>([]);
  const [aiDefaultId, setAiDefaultId] = useState("");
  const [aiProfileForm, setAiProfileForm] = useState<AiProfileForm>({
    label: "",
    provider: "openai",
    api_key: "",
    model: "",
  });
  const [aiEditingId, setAiEditingId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const selectedJobRef = useRef<string>("");
  const [actionsLog, setActionsLog] = useState<string[]>([]);
  const [auditLog, setAuditLog] = useState<string[]>([]);
  const [lastLogPath, setLastLogPath] = useState<string | null>(null);
  const [lastAuditPath, setLastAuditPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [dmPresetQuery, setDmPresetQuery] = useState("");
  const [warmupPresetQuery, setWarmupPresetQuery] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [workflowQuery, setWorkflowQuery] = useState("");
  const [workflowDraft, setWorkflowDraft] = useState<WorkflowDraft>(defaultWorkflowDraft);
  const [presetForm, setPresetForm] = useState<PresetForm>(defaultPresetForm);
  const [presetEditing, setPresetEditing] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "sessions", label: "Sessions" },
    { id: "presets", label: "Craft presets" },
    { id: "workflows", label: "Humanistic loops" },
    { id: "single", label: "Single" },
    { id: "multi", label: "Multi" },
    { id: "metrics", label: "Metrics" },
    { id: "license", label: "License" },
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
  const filteredDmPresets = useMemo(() => {
    const next = dmPresets.filter((preset) => presetMatchesQuery(preset, dmPresetQuery));
    next.sort((a, b) => a.name.localeCompare(b.name));
    return next;
  }, [dmPresets, dmPresetQuery]);
  const filteredWarmupPresets = useMemo(() => {
    const next = warmupPresets.filter((preset) => presetMatchesQuery(preset, warmupPresetQuery));
    next.sort((a, b) => a.name.localeCompare(b.name));
    return next;
  }, [warmupPresets, warmupPresetQuery]);
  const presetNames = useMemo(() => dmPresets.map((preset) => preset.name), [dmPresets]);
  const warmupPresetNames = useMemo(
    () => warmupPresets.map((preset) => preset.name),
    [warmupPresets]
  );

  const presetOptions = useMemo(() => dmPresets, [dmPresets]);
  const aiReadyProfiles = useMemo(() => aiProfiles.filter((profile) => profile.has_key), [aiProfiles]);

  const filteredWorkflows = useMemo(() => {
    const q = normalizeText(workflowQuery);
    const next = workflows.filter((workflow) => {
      if (!q) return true;
      const name = normalizeText(workflow.name || "");
      const id = normalizeText(workflow.id || "");
      return name.includes(q) || id.includes(q);
    });
    next.sort((a, b) => {
      const aName = a.name || "";
      const bName = b.name || "";
      if (aName !== bName) return aName.localeCompare(bName);
      return (a.id || "").localeCompare(b.id || "");
    });
    return next;
  }, [workflows, workflowQuery]);

  const nodeLookup = useMemo(
    () => new Map(workflowDraft.nodes.map((node) => [node.id, node])),
    [workflowDraft.nodes]
  );
  const workflowWorldLock = useRef<{ originX: number; originY: number } | null>(null);
  const baseWorkflowWorld = useMemo(() => {
    if (workflowDraft.nodes.length === 0) {
      return {
        width: WORKFLOW_MIN_SIZE,
        height: WORKFLOW_MIN_SIZE,
        originX: WORKFLOW_PADDING,
        originY: WORKFLOW_PADDING,
      };
    }
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    workflowDraft.nodes.forEach((node) => {
      const pos = node.position ?? { x: 0, y: 0 };
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + WORKFLOW_NODE_WIDTH);
      maxY = Math.max(maxY, pos.y + WORKFLOW_NODE_HEIGHT);
    });
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = WORKFLOW_MIN_SIZE;
      maxY = WORKFLOW_MIN_SIZE;
    }
    const width = Math.max(maxX - minX + WORKFLOW_PADDING * 2, WORKFLOW_MIN_SIZE);
    const height = Math.max(maxY - minY + WORKFLOW_PADDING * 2, WORKFLOW_MIN_SIZE);
    return {
      width,
      height,
      originX: WORKFLOW_PADDING - minX,
      originY: WORKFLOW_PADDING - minY,
    };
  }, [workflowDraft.nodes]);
  const workflowWorld = useMemo(() => {
    const lock = workflowWorldLock.current;
    if (!lock) {
      return baseWorkflowWorld;
    }
    return {
      ...baseWorkflowWorld,
      originX: lock.originX,
      originY: lock.originY,
    };
  }, [baseWorkflowWorld]);
  const workflowOriginRef = useRef({ x: 0, y: 0 });
  const workflowRunning = useMemo(
    () => Boolean(workflowDraft.meta?.running),
    [workflowDraft.meta]
  );

  const getEdgePoints = (
    sourcePos: { x: number; y: number },
    targetPos: { x: number; y: number },
    origin: { x: number; y: number }
  ) => {
    const sx = sourcePos.x + origin.x;
    const sy = sourcePos.y + origin.y;
    const tx = targetPos.x + origin.x;
    const ty = targetPos.y + origin.y;
    const sCenterX = sx + WORKFLOW_NODE_WIDTH / 2;
    const sCenterY = sy + WORKFLOW_NODE_HEIGHT / 2;
    const tCenterX = tx + WORKFLOW_NODE_WIDTH / 2;
    const tCenterY = ty + WORKFLOW_NODE_HEIGHT / 2;
    const dx = tCenterX - sCenterX;
    const dy = tCenterY - sCenterY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const horizontal = absDx >= absDy;
    let x1 = sCenterX;
    let y1 = sCenterY;
    let x2 = tCenterX;
    let y2 = tCenterY;
    if (horizontal) {
      const dir = dx >= 0 ? 1 : -1;
      x1 = sCenterX + dir * (WORKFLOW_NODE_WIDTH / 2);
      y1 = sCenterY;
      x2 = tCenterX - dir * (WORKFLOW_NODE_WIDTH / 2);
      y2 = tCenterY;
      const curve = Math.max(40, absDx * 0.5);
      const c1x = x1 + dir * curve;
      const c2x = x2 - dir * curve;
      return { x1, y1, x2, y2, c1x, c1y: y1, c2x, c2y: y2 };
    }
    const dir = dy >= 0 ? 1 : -1;
    x1 = sCenterX;
    y1 = sCenterY + dir * (WORKFLOW_NODE_HEIGHT / 2);
    x2 = tCenterX;
    y2 = tCenterY - dir * (WORKFLOW_NODE_HEIGHT / 2);
    const curve = Math.max(40, absDy * 0.5);
    const c1y = y1 + dir * curve;
    const c2y = y2 - dir * curve;
    return { x1, y1, x2, y2, c1x: x1, c1y, c2x: x2, c2y };
  };
  const clampZoom = (value: number) => Math.max(0.6, Math.min(1.6, Number(value.toFixed(2))));

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

  const [singleSession, setSingleSession] = useState("");
  const [singlePanel, setSinglePanel] = useState<"dm" | "invite" | "bulk_add" | "forward" | "profile" | "warmup">("dm");
  const [multiPanel, setMultiPanel] = useState<string | null>(null);
  const [presetPanel, setPresetPanel] = useState<string | null>("preset-dm");
  const [sessionsPanel, setSessionsPanel] = useState<string | null>("sessions-main");
  const [sideNavOpen, setSideNavOpen] = useState<{ [key: string]: boolean }>({
    single: false,
    multi: false,
    presets: false,
    sessions: false,
  });

  const [multiSessions, setMultiSessions] = useState<string[]>([]);

  const [renameSession, setRenameSession] = useState({ old_name: "", new_name: "" });
  const [deleteSession, setDeleteSession] = useState("");
  const [managedSession, setManagedSession] = useState("");
  const [importDir, setImportDir] = useState("");
  const [mergeFiles, setMergeFiles] = useState("");
  const [mergeOutput, setMergeOutput] = useState("merged.csv");
  const [createSessionForm, setCreateSessionForm] = useState({
    name: "",
    phone: "",
    login_id: "",
    code: "",
    password: "",
    need_password: false,
  });
  const [telegramApiSetupForm, setTelegramApiSetupForm] = useState<TelegramApiSetupForm>(
    defaultTelegramApiSetupForm
  );
  const [telegramApiSetup, setTelegramApiSetup] = useState<TelegramApiSetupStatus>({
    configured: false,
    api_id: null,
    api_hash_set: false,
  });
  const [savingTelegramApiSetup, setSavingTelegramApiSetup] = useState(false);

  const sessionOptions = useMemo(() => sessions, [sessions]);
  const sessionViews = useMemo<SessionView[]>(() => {
    const runningCounts: Record<string, number> = {};
    for (const job of jobs) {
      if (job.status !== "running") continue;
      const list: string[] = Array.isArray(job.sessions) ? job.sessions.filter(Boolean) : [];
      const metaSession = typeof job.meta?.session === "string" ? (job.meta.session as string) : "";
      if (list.length === 0 && metaSession) {
        list.push(metaSession);
      }
      for (const sessionName of list) {
        runningCounts[sessionName] = (runningCounts[sessionName] || 0) + 1;
      }
    }
    return sessionOptions.map((session) => ({
      ...session,
      running: runningCounts[session.name] || 0,
    }));
  }, [sessionOptions, jobs]);

  const loadLicense = async () => {
    if (!isTauri()) {
      setLicenseActive(true);
      setLicenseReady(true);
      return;
    }
    try {
      const token = await licensing.getToken();
      if (!token) {
        setLicenseKeyValue(null);
        setLicenseEmail(null);
        setLicenseActive(false);
        setLicenseReady(true);
        return;
      }
      const payload = decodeTokenPayload(token);
      const exp = payload?.exp;
      const tokenLicense = typeof payload?.sub === "string" ? payload.sub : null;
      const tokenEmail = typeof payload?.email === "string" ? payload.email : null;
      if (typeof exp !== "number") {
        setLicenseKeyValue(null);
        setLicenseEmail(null);
        setLicenseActive(false);
        setLicenseReady(true);
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      if (exp <= now) {
        setLicenseKeyValue(null);
        setLicenseEmail(null);
        setLicenseActive(false);
        setLicenseReady(true);
        return;
      }
      setLicenseExp(exp);
      setLicenseKeyValue(tokenLicense);
      setLicenseEmail(tokenEmail);
      setLicenseActive(true);
      setLicenseReady(true);
    } catch {
      setLicenseKeyValue(null);
      setLicenseEmail(null);
      setLicenseActive(false);
      setLicenseReady(true);
    }
  };

  const activateLicense = async () => {
    setError(null);
    if (!isTauri()) {
      setError("Licensing is only supported in the desktop app.");
      return;
    }
    const licenseKey = licenseKeyInput.trim();
    if (!licenseKey) {
      setError("Enter your license key");
      return;
    }
    try {
      const devicePub = await licensing.devicePublicKey();
      if (!devicePub) {
        setError("Failed to load device identity");
        return;
      }
      const res = await fetch(`${LICENSE_API_BASE}/v1/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: licenseKey, device_pubkey: devicePub }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Activation failed (${res.status})`);
      }
      const data = (await res.json()) as { token?: string; exp?: number };
      if (!data.token || typeof data.exp !== "number") {
        throw new Error("Invalid activation response");
      }
      const payload = decodeTokenPayload(data.token);
      const saved = await licensing.setToken(data.token);
      if (!saved) {
        throw new Error("Failed to store license token");
      }
      setLicenseKeyInput("");
      setLicenseExp(data.exp);
      setLicenseKeyValue(typeof payload?.sub === "string" ? payload.sub : null);
      setLicenseEmail(typeof payload?.email === "string" ? payload.email : null);
      setLicenseActive(true);
      setLicenseReady(true);
      setNotice("License activated");
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to activate license");
    }
  };

  const refreshLicenseIfNeeded = async () => {
    if (!isTauri()) {
      return;
    }
    try {
      const token = await licensing.getToken();
      if (!token) {
        return;
      }
      const payload = decodeTokenPayload(token);
      const exp = payload?.exp;
      const licenseKey = payload?.sub;
      const tokenEmail = typeof payload?.email === "string" ? payload.email : null;
      if (typeof exp !== "number" || typeof licenseKey !== "string" || !licenseKey.trim()) {
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      setLicenseExp(exp);
      setLicenseKeyValue(licenseKey);
      setLicenseEmail(tokenEmail);
      const secondsLeft = exp - now;
      const needsEmailBackfill = !tokenEmail;
      if (secondsLeft > 6 * 3600 && !needsEmailBackfill) {
        return;
      }
      const ts = Math.floor(Date.now() / 1000);
      const canonical = `${ts}\nREFRESH\n${licenseKey}`;
      const sig = await licensing.sign(canonical);
      if (!sig) {
        return;
      }
      const res = await fetch(`${LICENSE_API_BASE}/v1/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ts, sig }),
      });
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as { token?: string; exp?: number };
      if (!data.token || typeof data.exp !== "number") {
        return;
      }
      const refreshedPayload = decodeTokenPayload(data.token);
      await licensing.setToken(data.token);
      setLicenseExp(data.exp);
      setLicenseKeyValue(typeof refreshedPayload?.sub === "string" ? refreshedPayload.sub : null);
      setLicenseEmail(typeof refreshedPayload?.email === "string" ? refreshedPayload.email : null);
    } catch {
      // Silent: offline is allowed until the current token expires.
    }
  };

  const handleClearLocalData = async () => {
    const proceed = window.confirm(
      "Clear local sessions, local logs, and app runtime data on this machine?\n\nLicense remains active."
    );
    if (!proceed) return;
    setError(null);
    setResettingData(true);
    try {
      const res = await api.resetLocalData({ include_api_setup: false });
      await Promise.all([refreshSessions(), refreshJobs(), refreshLogs(), loadTelegramApiSetup()]);
      updateNotice(
        `Local data cleared (sessions: ${res.removed_sessions}, logs: ${res.removed_logs}, jobs stopped: ${res.stopped_jobs}).`
      );
    } catch (err: any) {
      setError(err.message || "Failed to clear local data");
    } finally {
      setResettingData(false);
    }
  };

  const handleFactoryReset = async () => {
    const proceed = window.confirm(
      "Factory reset this machine?\n\nThis clears local sessions, logs, API setup, and the local license token. You will need to activate again."
    );
    if (!proceed) return;
    setError(null);
    setResettingFactory(true);
    try {
      await api.resetLocalData({ include_api_setup: true });
      if (isTauri()) {
        await licensing.clearToken();
      }
      setLicenseKeyInput("");
      setLicenseExp(null);
      setLicenseKeyValue(null);
      setLicenseEmail(null);
      setLicenseActive(false);
      setLicenseReady(true);
      setWarning(null);
      setNotice(null);
    } catch (err: any) {
      setError(err.message || "Failed to run factory reset");
    } finally {
      setResettingFactory(false);
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
    setSavingProxy(true);
    try {
      const res = await api.saveSessionProxy(proxyForm.session, {
        proxy_type: proxyForm.proxy_type,
        hostname: proxyForm.hostname.trim(),
        port,
        username: proxyForm.username || undefined,
        password: proxyForm.password || undefined,
        secret: proxyForm.secret || undefined,
      });
      updateNotice(res.check?.message || "Proxy saved and validated");
      refreshSessions();
    } catch (err: any) {
      setError(err.message || "Failed to save proxy");
    } finally {
      setSavingProxy(false);
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
      setAiProfiles(res.profiles || []);
      setAiDefaultId(res.default_id || "");
    } catch (err: any) {
      setError(err.message || "Failed to load AI settings");
    }
  };

  const loadTelegramApiSetup = async () => {
    try {
      const res = await api.telegramApiSetup();
      setTelegramApiSetup(res);
      setTelegramApiSetupForm((prev) => ({
        ...prev,
        api_id: res.api_id || prev.api_id || "",
      }));
      if (!res.configured) {
        setWarning(TELEGRAM_API_MISSING_MESSAGE);
      } else {
        setWarning((prev) => (prev === TELEGRAM_API_MISSING_MESSAGE ? null : prev));
      }
    } catch (err: any) {
      setError(err.message || "Failed to load Telegram API setup");
    }
  };

  const ensureBackendReady = async () => {
    if (!isTauri()) {
      return true;
    }
    try {
      const status = await licensing.backendStatus();
      if (!status.healthy) {
        setError(
          status.startup_error ||
            "Local backend is not healthy. Stop old tgcampaigner-backend services and relaunch the app."
        );
        return false;
      }
      return true;
    } catch {
      return true;
    }
  };

  const resetAiProfileForm = () => {
    setAiProfileForm({
      label: "",
      provider: "openai",
      api_key: "",
      model: "",
    });
    setAiEditingId(null);
  };

  const handleEditAiProfile = (profile: AiProfile) => {
    setAiEditingId(profile.id);
    setAiProfileForm({
      id: profile.id,
      label: profile.label || "",
      provider: profile.provider,
      api_key: "",
      model: profile.model || "",
    });
  };

  const handleSaveAiProfile = async () => {
    setError(null);
    const provider = aiProfileForm.provider.trim();
    if (!provider) {
      setError("Select a provider");
      return;
    }
    const label = aiProfileForm.label.trim();
    const model = aiProfileForm.model.trim();
    const apiKey = aiProfileForm.api_key.trim();

    type AiProfilePayload = {
      id?: string;
      label: string;
      provider: string;
      model: string | null;
      api_key: string | null;
    };

    const payloadProfiles: AiProfilePayload[] = aiProfiles.map((profile) => ({
      id: profile.id,
      label: profile.label || "",
      provider: profile.provider,
      model: profile.model || null,
      api_key: null,
    }));

    if (aiEditingId) {
      const idx = payloadProfiles.findIndex((item) => item.id === aiEditingId);
      const nextProfile: AiProfilePayload = {
        id: aiEditingId,
        label: label || payloadProfiles[idx]?.label || provider.toUpperCase(),
        provider,
        model: model || null,
        api_key: apiKey || null,
      };
      if (idx >= 0) {
        payloadProfiles[idx] = nextProfile;
      } else {
        payloadProfiles.push(nextProfile);
      }
    } else {
      payloadProfiles.push({
        label: label || provider.toUpperCase(),
        provider,
        model: model || null,
        api_key: apiKey || null,
      });
    }

    try {
      await api.saveAiSettings({
        profiles: payloadProfiles,
        default_id: aiDefaultId || undefined,
      });
      updateNotice(aiEditingId ? "AI profile updated" : "AI profile added");
      resetAiProfileForm();
      loadAiSettings();
    } catch (err: any) {
      setError(err.message || "Failed to save AI profile");
    }
  };

  const handleDeleteAiProfile = async (profileId: string) => {
    const payloadProfiles = aiProfiles
      .filter((profile) => profile.id !== profileId)
      .map((profile) => ({
        id: profile.id,
        label: profile.label || "",
        provider: profile.provider,
        api_key: null,
        model: profile.model || null,
      }));
    const nextDefault = aiDefaultId === profileId ? "" : aiDefaultId;
    try {
      await api.saveAiSettings({
        profiles: payloadProfiles,
        default_id: nextDefault || undefined,
      });
      updateNotice("AI profile deleted");
      if (aiEditingId === profileId) {
        resetAiProfileForm();
      }
      loadAiSettings();
    } catch (err: any) {
      setError(err.message || "Failed to delete AI profile");
    }
  };

  const handleSetDefaultAiProfile = async (profileId: string) => {
    const payloadProfiles = aiProfiles.map((profile) => ({
      id: profile.id,
      label: profile.label || "",
      provider: profile.provider,
      api_key: null,
      model: profile.model || null,
    }));
    try {
      await api.saveAiSettings({
        profiles: payloadProfiles,
        default_id: profileId,
      });
      setAiDefaultId(profileId);
      updateNotice("Default AI profile updated");
    } catch (err: any) {
      setError(err.message || "Failed to set default AI profile");
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
    loadLicense();
  }, []);

  useEffect(() => {
    if (!licenseActive) {
      return;
    }

    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    (async () => {
      const ready = await ensureBackendReady();
      if (!ready || cancelled) {
        return;
      }
      loadTelegramApiSetup();
      refreshSessions();
      loadAiSettings();
      refreshPresets();
      refreshWorkflows();
      refreshLogs();
      refreshJobs();
      interval = setInterval(() => {
        refreshLogs();
        refreshJobs();
      }, POLL_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [licenseActive]);

  useEffect(() => {
    if (!licenseActive) {
      return;
    }
    refreshLicenseIfNeeded();
    const interval = setInterval(() => {
      refreshLicenseIfNeeded();
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [licenseActive]);

  useEffect(() => {
    if (!licenseActive) {
      return;
    }
    selectedJobRef.current = selectedJobId;
    refreshLogs();
  }, [selectedJobId, licenseActive]);

  useEffect(() => {
    const first = sessionOptions[0]?.name;
    if (!first) {
      return;
    }
    setSingleSession((prev) => prev || first);
    setDmForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setInviteForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setBulkAddForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setForwardForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setProfileForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setWarmupForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setProxyForm((prev) => (prev.session ? prev : { ...prev, session: first }));
    setDeleteSession((prev) => prev || first);
    setRenameSession((prev) => (prev.old_name ? prev : { ...prev, old_name: first }));
    setManagedSession((prev) => prev || first);
    if (multiSessions.length === 0) {
      setMultiSessions([first]);
    }
  }, [sessionOptions]);

  useEffect(() => {
    if (!singleSession) {
      return;
    }
    setDmForm((prev) => ({ ...prev, session: singleSession }));
    setInviteForm((prev) => ({ ...prev, session: singleSession }));
    setBulkAddForm((prev) => ({ ...prev, session: singleSession }));
    setForwardForm((prev) => ({ ...prev, session: singleSession }));
    setProfileForm((prev) => ({ ...prev, session: singleSession }));
    setWarmupForm((prev) => ({ ...prev, session: singleSession }));
  }, [singleSession]);

  useEffect(() => {
    if (!proxyForm.session) {
      return;
    }
    loadSessionProxy(proxyForm.session);
  }, [proxyForm.session]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(() => {
      setNotice(null);
    }, 20000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!error) {
      return;
    }
    const timer = setTimeout(() => {
      setError(null);
    }, 20000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!workflowDraft.id.trim() && workflowDraft.nodes.some((node) => node.type === "session")) {
      setWorkflowDraft((draft) => ({
        ...draft,
        id: `wf_${Date.now().toString(36)}`,
      }));
    }
  }, [workflowDraft.id, workflowDraft.nodes]);

  useEffect(() => {
    const firstPreset = dmPresets[0]?.name;
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
  }, [dmPresets]);

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
    if (presetForm.kind !== "warmup") {
      return;
    }
    const hasAiProfiles = aiReadyProfiles.length > 0;
    const currentModes = presetForm.warmup_modes || [];
    if (!hasAiProfiles) {
      if (currentModes.length !== 1 || currentModes[0] !== "react") {
        setPresetForm((prev) => ({ ...prev, warmup_modes: ["react"], ai_profile_id: "" }));
      }
      return;
    }
    if (currentModes.length === 0) {
      setPresetForm((prev) => ({ ...prev, warmup_modes: ["reply"] }));
      return;
    }
    const needsAiProfile = currentModes.some((mode) => mode === "reply" || mode === "message");
    if (needsAiProfile && !presetForm.ai_profile_id) {
      const fallback = aiDefaultId || aiReadyProfiles[0]?.id;
      if (fallback) {
        setPresetForm((prev) => ({ ...prev, ai_profile_id: fallback }));
      }
    }
    if (!needsAiProfile && presetForm.ai_profile_id) {
      setPresetForm((prev) => ({ ...prev, ai_profile_id: "" }));
    }
  }, [aiReadyProfiles, aiDefaultId, presetForm.kind, presetForm.warmup_modes, presetForm.ai_profile_id]);

  useEffect(() => {
    if (!draggingNode) return;

    const handleMove = (event: MouseEvent) => {
      const bounds = canvasRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const worldX = (x - canvasOffset.x) / zoom;
      const worldY = (y - canvasOffset.y) / zoom;
      const scaledX = worldX - draggingNode.offsetX;
      const scaledY = worldY - draggingNode.offsetY;
      const nextX = scaledX - workflowWorld.originX;
      const nextY = scaledY - workflowWorld.originY;
      setWorkflowDraft((draft) => ({
        ...draft,
        nodes: draft.nodes.map((node) =>
          node.id === draggingNode.id
            ? {
                ...node,
                position: {
                  x: nextX,
                  y: nextY,
                },
              }
            : node
        ),
      }));
    };

    const handleUp = () => {
      workflowWorldLock.current = null;
      setDraggingNode(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingNode, canvasOffset.x, canvasOffset.y, workflowWorld.originX, workflowWorld.originY, zoom]);

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

  const isWorkflowPositionFree = (nodes: WorkflowNode[], candidate: { x: number; y: number }) => {
    const candRect = {
      x: candidate.x - WORKFLOW_NODE_GAP / 2,
      y: candidate.y - WORKFLOW_NODE_GAP / 2,
      w: WORKFLOW_NODE_WIDTH + WORKFLOW_NODE_GAP,
      h: WORKFLOW_NODE_HEIGHT + WORKFLOW_NODE_GAP,
    };
    const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

    return !nodes.some((node) => {
      const pos = node.position ?? { x: 0, y: 0 };
      const rect = { x: pos.x, y: pos.y, w: WORKFLOW_NODE_WIDTH, h: WORKFLOW_NODE_HEIGHT };
      return overlaps(candRect, rect);
    });
  };

  const findWorkflowPlacement = (nodes: WorkflowNode[], anchor: { x: number; y: number }) => {
    if (isWorkflowPositionFree(nodes, anchor)) {
      return anchor;
    }

    const maxCandidates = 200;
    const offsets: Array<{ x: number; y: number }> = [];
    let gx = 0;
    let gy = 0;
    let step = 1;
    let dirIndex = 0;
    const dirs = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
    ];

    offsets.push({ x: 0, y: 0 });
    while (offsets.length < maxCandidates) {
      for (let repeat = 0; repeat < 2; repeat += 1) {
        const dir = dirs[dirIndex % dirs.length];
        for (let i = 0; i < step; i += 1) {
          gx += dir.x;
          gy += dir.y;
          offsets.push({ x: gx, y: gy });
          if (offsets.length >= maxCandidates) {
            break;
          }
        }
        dirIndex += 1;
        if (offsets.length >= maxCandidates) {
          break;
        }
      }
      step += 1;
    }

    for (const offset of offsets) {
      const candidate = {
        x: anchor.x + offset.x * WORKFLOW_NODE_STEP_X,
        y: anchor.y + offset.y * WORKFLOW_NODE_STEP_Y,
      };
      if (isWorkflowPositionFree(nodes, candidate)) {
        return candidate;
      }
    }

    return anchor;
  };

  const addWorkflowNode = (type: string) => {
    if (type === "session" && workflowDraft.nodes.some((node) => node.type === "session")) {
      setError("Only one Session node is allowed in a humanistic loop.");
      return;
    }
    if (type !== "session" && !workflowDraft.nodes.some((node) => node.type === "session")) {
      setError("Add a Session node before adding other blocks.");
      return;
    }
    const id = `node_${type}_${Date.now()}`;
    let config: Record<string, unknown> = {};
    if (type === "session") {
      config = { session: "", loop_count: 1 };
    } else if (type === "wait") {
      config = { min_seconds: 600, max_seconds: 900 };
    } else if (type === "dm") {
      config = {
        preset_name: presetNames[0] || "",
        message: "",
        input_file: "data/shqipo.csv",
        media_path: "",
        use_spintax: false,
        spintax_ai: false,
        spintax_variations: 5,
      };
    } else if (type === "invite") {
      config = {
        preset_name: presetNames[0] || "",
        invite_url: "",
        message: "",
        input_file: "data/shqipo.csv",
        media_path: "",
        use_spintax: false,
        spintax_ai: false,
        spintax_variations: 5,
      };
    } else if (type === "bulk_add") {
      config = { preset_name: presetNames[0] || "", target_ref: "", input_file: "data/shqipo.csv" };
    } else if (type === "forward") {
      config = {
        preset_name: presetNames[0] || "",
        message_link: "",
        drop_author: false,
        has_media: false,
        input_file: "data/shqipo.csv",
      };
    } else if (type === "warmup") {
      config = { preset_name: warmupPresetNames[0] || "", targets: "me" };
    }

    setWorkflowDraft((draft) => {
      const nextId = !draft.id.trim() && type === "session" ? `wf_${Date.now().toString(36)}` : draft.id;
      const sessionNode = draft.nodes.find((node) => node.type === "session") || null;
      const selectedNode = selectedNodeId ? draft.nodes.find((node) => node.id === selectedNodeId) || null : null;
      const basePos =
        selectedNode?.position ??
        sessionNode?.position ??
        { x: WORKFLOW_NODE_START_X, y: WORKFLOW_NODE_START_Y };
      const anchor =
        type === "session"
          ? { x: WORKFLOW_NODE_START_X, y: WORKFLOW_NODE_START_Y }
          : { x: basePos.x + WORKFLOW_NODE_STEP_X, y: basePos.y };
      const position = findWorkflowPlacement(draft.nodes, anchor);
      return {
        ...draft,
        id: nextId,
        nodes: [
          ...draft.nodes,
          {
            id,
            type,
            config,
            position,
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
      const sourceNode = draft.nodes.find((node) => node.id === source);
      const targetNode = draft.nodes.find((node) => node.id === target);
      if (!sourceNode || !targetNode) {
        return draft;
      }
      if (targetNode.type === "session") {
        setError("Session nodes cannot have incoming links.");
        return draft;
      }
      const filteredEdges = draft.edges.filter((edge) => edge.source !== source);
      if (filteredEdges.some((edge) => edge.source === source && edge.target === target)) {
        return { ...draft, edges: filteredEdges };
      }
      if (filteredEdges.some((edge) => edge.target === target && edge.source !== source)) {
        setError("That node is already linked. Remove the existing link first.");
        return { ...draft, edges: filteredEdges };
      }
      const edgesWith = [...filteredEdges, { id: "pending", source, target }];
      const adjacency = new Map<string, string[]>();
      edgesWith.forEach((edge) => {
        if (!adjacency.has(edge.source)) {
          adjacency.set(edge.source, []);
        }
        adjacency.get(edge.source)!.push(edge.target);
      });
      const stack = [target];
      const seen = new Set<string>();
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;
        if (current === source) {
          setError("That link would create a loop. Choose a forward node.");
          return { ...draft, edges: filteredEdges };
        }
        const nextNodes = adjacency.get(current) || [];
        for (const next of nextNodes) {
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
      const edge: WorkflowEdge = {
        id: `edge_${source}_${target}_${Date.now()}`,
        source,
        target,
      };
      return { ...draft, edges: [...filteredEdges, edge] };
    });
  };

  useEffect(() => {
    const prev = workflowOriginRef.current;
    if (prev.x === workflowWorld.originX && prev.y === workflowWorld.originY) return;
    const dx = (workflowWorld.originX - prev.x) * zoom;
    const dy = (workflowWorld.originY - prev.y) * zoom;
    if (dx !== 0 || dy !== 0) {
      setCanvasOffset((offset) => ({ x: offset.x - dx, y: offset.y - dy }));
    }
    workflowOriginRef.current = { x: workflowWorld.originX, y: workflowWorld.originY };
  }, [workflowWorld.originX, workflowWorld.originY, zoom]);

  const handleNodeMouseDown = (event: ReactMouseEvent<HTMLDivElement>, node: WorkflowNode) => {
    event.preventDefault();
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    const worldX = (cursorX - canvasOffset.x) / zoom;
    const worldY = (cursorY - canvasOffset.y) / zoom;
    const nodeX = (node.position?.x ?? 0) + workflowWorld.originX;
    const nodeY = (node.position?.y ?? 0) + workflowWorld.originY;
    workflowWorldLock.current = { originX: workflowWorld.originX, originY: workflowWorld.originY };
    setSelectedNodeId(node.id);
    setDraggingNode({
      id: node.id,
      offsetX: worldX - nodeX,
      offsetY: worldY - nodeY,
    });
  };

  const handleNodeClick = (_event: ReactMouseEvent<HTMLDivElement>, node: WorkflowNode) => {
    if (linkFrom && linkFrom !== node.id) {
      addWorkflowEdge(linkFrom, node.id);
      setLinkFrom(null);
    }
    setSelectedNodeId(node.id);
  };

  const handleCanvasWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const nextZoom = clampZoom(zoom - event.deltaY * 0.001);
    if (nextZoom === zoom) return;
    const worldX = (cursorX - canvasOffset.x) / zoom;
    const worldY = (cursorY - canvasOffset.y) / zoom;
    const nextOffsetX = cursorX - worldX * nextZoom;
    const nextOffsetY = cursorY - worldY * nextZoom;
    setZoom(nextZoom);
    setCanvasOffset({ x: nextOffsetX, y: nextOffsetY });
  };

	  const validateWorkflow = () => {
	    const errors: string[] = [];
	    const sessionNodes = workflowDraft.nodes.filter((node) => node.type === "session");
	    if (sessionNodes.length === 0) {
	      errors.push("Add a Session node to start the workflow.");
	    }
	    if (sessionNodes.length > 1) {
	      errors.push("Only one Session node is allowed in a humanistic loop.");
	    }
	    sessionNodes.forEach((node) => {
	      const config = node.config as Record<string, any>;
	      const session = typeof config.session === "string" ? config.session.trim() : "";
	      if (!session) {
	        errors.push(`Session node ${node.id} needs a session selected.`);
	      }
	      const loopCount = Number(config.loop_count ?? 1);
	      if (!Number.isFinite(loopCount) || loopCount < 1) {
	        errors.push(`Session node ${node.id} needs a valid loop count.`);
	      }
	    });
	    if (sessionNodes.length === 1) {
	      const sessionId = sessionNodes[0].id;
	      const outgoing = workflowDraft.edges.filter((edge) => edge.source === sessionId);
	      if (outgoing.length === 0) {
	        errors.push("Session node must link to the first action.");
	      } else if (outgoing.length > 1) {
	        errors.push("Session node cannot have multiple outgoing links.");
	      }
	    }

	    const waitNodes = workflowDraft.nodes.filter((node) => node.type === "wait");
	    waitNodes.forEach((node) => {
	      const config = node.config as Record<string, any>;
	      if (config.min_seconds === "" || config.max_seconds === "") {
        errors.push(`Wait node ${node.id} needs min/max seconds.`);
        return;
      }
      const minSeconds = Number(config.min_seconds ?? 600);
      const maxSeconds = Number(config.max_seconds ?? 900);
      if (!Number.isFinite(minSeconds) || minSeconds < 0) {
        errors.push(`Wait node ${node.id} needs a valid min seconds value.`);
      }
      if (!Number.isFinite(maxSeconds) || maxSeconds < 0) {
        errors.push(`Wait node ${node.id} needs a valid max seconds value.`);
      }
      if (Number.isFinite(minSeconds) && Number.isFinite(maxSeconds) && minSeconds > maxSeconds) {
        errors.push(`Wait node ${node.id} min seconds must be <= max seconds.`);
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
      if (node.type !== "warmup" && !inputFile) {
        errors.push(`Action node ${node.id} (${node.type}) needs a CSV file.`);
      }
      if (node.type === "dm") {
        const message = typeof config.message === "string" ? config.message.trim() : "";
        if (!message) {
          errors.push(`DM node ${node.id} needs a message.`);
        }
        if (config.use_spintax && config.spintax_ai) {
          if (config.spintax_variations === "") {
            errors.push(`DM node ${node.id} needs AI variations.`);
          } else {
            const variations = Number(config.spintax_variations ?? 5);
            if (!Number.isFinite(variations) || variations < 2 || variations > 12) {
              errors.push(`DM node ${node.id} AI variations must be between 2 and 12.`);
            }
          }
        }
      }
      if (node.type === "invite") {
        const invite = typeof config.invite_url === "string" ? config.invite_url.trim() : "";
        if (!invite) {
          errors.push(`Invite node ${node.id} needs an invite link.`);
        }
        if (config.use_spintax && config.spintax_ai) {
          if (config.spintax_variations === "") {
            errors.push(`Invite node ${node.id} needs AI variations.`);
          } else {
            const variations = Number(config.spintax_variations ?? 5);
            if (!Number.isFinite(variations) || variations < 2 || variations > 12) {
              errors.push(`Invite node ${node.id} AI variations must be between 2 and 12.`);
            }
          }
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
	    const name = workflowDraft.name.trim();
	    if (!name) {
	      setError("Workflow name is required.");
	      return;
	    }
	    try {
	      // The backend starts the persisted workflow by id; save first so it matches the current canvas.
	      await api.saveWorkflow({
	        id,
	        name,
	        nodes: workflowDraft.nodes,
	        edges: workflowDraft.edges,
	        meta: workflowDraft.meta,
	      });
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
    const nodes = (workflow.nodes || []).map((node, idx) => {
      const nextConfig = { ...(node.config || {}) } as Record<string, any>;
      if (node.type === "session") {
        if (!nextConfig.session) {
          const sessionsValue = Array.isArray(nextConfig.sessions) ? nextConfig.sessions : [];
          nextConfig.session = sessionsValue[0] || "";
        }
        if (nextConfig.loop_count === undefined || nextConfig.loop_count === null) {
          nextConfig.loop_count = 1;
        }
      }
      return {
        ...node,
        config: nextConfig,
        position:
          node.position ??
          (() => {
            const gridIndex = node.type === "session" ? 0 : idx + 1;
            const col = gridIndex % 4;
            const row = Math.floor(gridIndex / 4);
            return {
              x: WORKFLOW_NODE_START_X + col * WORKFLOW_NODE_STEP_X,
              y: WORKFLOW_NODE_START_Y + row * WORKFLOW_NODE_STEP_Y,
            };
          })(),
      };
    });
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
        const warmupModes = presetForm.warmup_modes.length ? presetForm.warmup_modes : ["reply"];
        payload.warmup_modes = warmupModes;
        payload.context_messages = toInt(presetForm.context_messages, 50);
        if (warmupModes.some((mode) => mode === "reply" || mode === "message")) {
          const fallbackProfile = aiDefaultId || aiReadyProfiles[0]?.id;
          payload.ai_profile_id = presetForm.ai_profile_id || fallbackProfile || undefined;
        } else {
          payload.ai_profile_id = undefined;
        }
      } else {
        payload.interval_seconds = toInt(presetForm.interval_seconds, 600);
        payload.strict_timing = presetForm.strict_timing;
        payload.rate_mode = presetForm.rate_mode || "1";
        payload.max_wait_seconds = toInt(presetForm.max_wait_seconds, 3600);
        payload.max_flood_waits = toInt(presetForm.max_flood_waits, 3);
        payload.max_consecutive_errors = toInt(presetForm.max_consecutive_errors, 5);
        payload.all_csv_users = presetForm.all_csv_users;
        if (presetForm.all_csv_users) {
          payload.max_users = 0;
        } else {
          payload.max_users = toInt(presetForm.max_users, 0);
        }
      }
      await api.savePreset(payload as any);
      updateNotice(`Preset saved: ${name}`);
      setPresetForm({ ...defaultPresetForm, kind });
      setPresetEditing(false);
      refreshPresets();
    } catch (err: any) {
      setError(err.message || "Failed to save preset");
    }
  };

  const handlePresetEdit = (preset: PresetItem) => {
    const kind = preset.kind || "dm";
    setPresetEditing(true);
    setPresetPanel(kind === "warmup" ? "preset-warmup" : "preset-dm");
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
      all_csv_users:
        preset.all_csv_users ??
        (preset.max_users === null || preset.max_users === undefined || preset.max_users === 0),
      max_users:
        preset.max_users === null || preset.max_users === undefined || preset.max_users === 0
          ? ""
          : String(preset.max_users),
      warmup_modes:
        preset.warmup_modes && preset.warmup_modes.length
          ? preset.warmup_modes
          : preset.warmup_mode
          ? [preset.warmup_mode]
          : defaultPresetForm.warmup_modes,
      context_messages: String(preset.context_messages ?? defaultPresetForm.context_messages),
      ai_profile_id: preset.ai_profile_id ?? defaultPresetForm.ai_profile_id,
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

  const resetCreateSessionForm = () => {
    setCreateSessionForm({
      name: "",
      phone: "",
      login_id: "",
      code: "",
      password: "",
      need_password: false,
    });
  };

  const handleCreateSessionStart = async () => {
    setError(null);
    if (!createSessionForm.name.trim() || !createSessionForm.phone.trim()) {
      setError("Session name and phone are required.");
      return;
    }
    try {
      const res = await api.createSessionStart({
        name: createSessionForm.name.trim(),
        phone: createSessionForm.phone.trim(),
      });
      setCreateSessionForm((prev) => ({
        ...prev,
        login_id: res.login_id,
        code: "",
        password: "",
        need_password: false,
      }));
      updateNotice("Code sent. Enter the Telegram code to finish session creation.");
    } catch (err: any) {
      const message = err.message || "Failed to start session creation";
      if (isMissingTelegramApiError(message)) {
        setWarning(TELEGRAM_API_MISSING_MESSAGE);
        setSessionsPanel("sessions-api");
        setError(null);
        return;
      }
      setError(message);
    }
  };

  const handleCreateSessionFinish = async () => {
    setError(null);
    if (!createSessionForm.login_id) {
      setError("Start session creation first.");
      return;
    }
    if (!createSessionForm.need_password && !createSessionForm.code.trim()) {
      setError("Enter the Telegram code.");
      return;
    }
    if (createSessionForm.need_password && !createSessionForm.password) {
      setError("Enter your Telegram 2FA password.");
      return;
    }
    try {
      const res = await api.createSessionFinish({
        login_id: createSessionForm.login_id,
        code: createSessionForm.code.trim() || undefined,
        password: createSessionForm.password || undefined,
      });
      if (res.need_password) {
        setCreateSessionForm((prev) => ({
          ...prev,
          need_password: true,
          password: "",
        }));
        updateNotice("2FA password required. Enter it to complete sign-in.");
        return;
      }
      if (!res.ok || !res.session?.name) {
        setError("Session creation did not complete.");
        return;
      }
      const created = res.session.name;
      updateNotice(`Session created: ${created}`);
      resetCreateSessionForm();
      await refreshSessions();
      setManagedSession(created);
      setDeleteSession(created);
      setRenameSession((prev) => ({ ...prev, old_name: created }));
    } catch (err: any) {
      setError(err.message || "Failed to finish session creation");
    }
  };

  const handleCreateSessionCancel = async () => {
    setError(null);
    try {
      if (createSessionForm.login_id) {
        await api.createSessionCancel({ login_id: createSessionForm.login_id });
      }
      resetCreateSessionForm();
      updateNotice("Session creation cancelled.");
    } catch (err: any) {
      setError(err.message || "Failed to cancel session creation");
    }
  };

  const handleSaveTelegramApiSetup = async () => {
    setError(null);
    const apiId = telegramApiSetupForm.api_id.trim();
    const apiHash = telegramApiSetupForm.api_hash.trim();
    if (!apiId || !apiHash) {
      setError("API_ID and API_HASH are required.");
      return;
    }
    setSavingTelegramApiSetup(true);
    try {
      const res = await api.saveTelegramApiSetup({
        api_id: apiId,
        api_hash: apiHash,
      });
      setTelegramApiSetup(res);
      setTelegramApiSetupForm({
        api_id: res.api_id || apiId,
        api_hash: "",
      });
      let restartFailed = false;
      if (isTauri()) {
        try {
          await licensing.restartLocalBackend();
        } catch {
          restartFailed = true;
        }
      }
      await loadTelegramApiSetup();
      await refreshSessions();
      if (restartFailed) {
        setWarning("Credentials saved. Restart backend manually from Sessions -> API Setup context.");
      } else {
        setWarning(null);
      }
      updateNotice(isTauri() && !restartFailed ? "Telegram API credentials saved. Local backend restarted." : "Telegram API credentials saved.");
    } catch (err: any) {
      setError(err.message || "Failed to save Telegram API setup");
    } finally {
      setSavingTelegramApiSetup(false);
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
  const showSessions = activeTab === "sessions";
  const showPresets = activeTab === "presets";
  const showWorkflows = activeTab === "workflows";
  const showSingle = activeTab === "single";
  const showMulti = activeTab === "multi";
  const showMetrics = activeTab === "metrics";
  const showLicense = activeTab === "license";
  const runningJobs = useMemo(() => jobs.filter((job) => job.status === "running"), [jobs]);

  const focusSession = (name: string) => {
    const next = name.trim();
    if (!next) return;
    setManagedSession(next);
  };

  const selectManagedSession = (name: string) => {
    const next = name.trim();
    if (!next) return;
    setManagedSession(next);
    setRenameSession((prev) => ({ ...prev, old_name: next }));
    setDeleteSession(next);
    setProxyForm((prev) => ({ ...prev, session: next }));
  };

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

  const toggleWarmupMode = (mode: string) => {
    setPresetForm((prev) => {
      const next = new Set(prev.warmup_modes);
      if (next.has(mode)) {
        next.delete(mode);
      } else {
        next.add(mode);
      }
      if (next.size === 0) {
        next.add(mode);
      }
      const modes = Array.from(next);
      const needsAi = modes.some((item) => item === "reply" || item === "message");
      return {
        ...prev,
        warmup_modes: modes,
        ai_profile_id: needsAi ? prev.ai_profile_id : "",
      };
    });
  };

  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label || "Workspace";
  const singleNavItems = [
    { id: "dm", label: "Direct Message" },
    { id: "invite", label: "Invite Link DM" },
    { id: "bulk_add", label: "Bulk Add" },
    { id: "forward", label: "Forward" },
    { id: "profile", label: "Profile" },
    { id: "warmup", label: "Warmup" },
  ];
  const presetNavItems = [
    { id: "preset-dm", label: "DM presets" },
    { id: "preset-warmup", label: "Warmup presets" },
  ];
  const sessionNavItems = [
    { id: "sessions-main", label: "Session management" },
    { id: "sessions-tools", label: "Config and Tools" },
    { id: "sessions-api", label: "API Setup" },
  ];
  const multiNavItems = [
    { id: "multi-dm", label: "Multi DM" },
    { id: "multi-invite", label: "Multi Invite DM" },
    { id: "multi-bulk", label: "Multi Bulk Add" },
    { id: "multi-forward", label: "Multi Forward" },
    { id: "multi-profile", label: "Multi Profile" },
    { id: "multi-warmup", label: "Multi Warmup" },
  ];

  const handleSideNavToggle = (id: string) => {
    setSideNavOpen((prev) => {
      const next = { single: false, multi: false, presets: false, sessions: false };
      if (!prev[id]) {
        next[id as keyof typeof next] = true;
      }
      return next;
    });
  };

  const closeSideNav = () => {
    setSideNavOpen({ single: false, multi: false, presets: false, sessions: false });
  };

  const handleSideNavSelect = (tabId: string, subId?: string) => {
    setActiveTab(tabId);
    if (tabId === "single" && subId) {
      setSinglePanel(subId as typeof singlePanel);
    }
    if (tabId === "presets" && subId) {
      setPresetPanel(subId);
      setPresetForm((prev) => ({
        ...prev,
        kind: subId === "preset-warmup" ? "warmup" : "dm",
      }));
    }
    if (tabId === "sessions") {
      if (subId) {
        setSessionsPanel(subId);
      } else if (!sessionsPanel) {
        setSessionsPanel("sessions-main");
      }
    }
    if (tabId === "multi") {
      if (subId) {
        setMultiPanel(subId);
      } else if (!multiPanel) {
        setMultiPanel("multi-dm");
      }
      if (subId) {
        requestAnimationFrame(() => {
          const target = document.getElementById(subId);
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      }
    }
    if (tabId === "presets" && subId) {
      requestAnimationFrame(() => {
        const target = document.getElementById(subId);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
    if (tabId === "sessions" && subId) {
      requestAnimationFrame(() => {
        const target = document.getElementById(subId);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
  };

  if (!licenseReady) {
    return (
      <div className="page">
        <div className="card" style={{ maxWidth: 520, margin: "120px auto" }}>
          <h2 style={{ margin: 0 }}>Loading...</h2>
          <p style={{ opacity: 0.8 }}>Preparing the app.</p>
        </div>
      </div>
    );
  }

  if (!licenseActive) {
    return (
      <div className="page">
        <div className="card" style={{ maxWidth: 620, margin: "96px auto" }}>
          <div className="card-title-row" style={{ marginBottom: 18 }}>
            <div>
              <div className="app-kicker">TGCAMPAIGNER CONTROL</div>
              <h2 style={{ margin: "8px 0 0 0" }}>Activate your license</h2>
            </div>
          </div>
          <p style={{ marginTop: 0, opacity: 0.85 }}>
            Enter the license key from your purchase email to unlock the app on this machine.
          </p>
          <label>
            License key
            <input
              value={licenseKeyInput}
              onChange={(e) => setLicenseKeyInput(e.target.value)}
              placeholder="TP-ABCDE-12345-ABCDE-12345"
              autoFocus
            />
          </label>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
            <button className="primary" onClick={activateLicense}>
              Activate
            </button>
            <div style={{ opacity: 0.7, fontSize: 13 }}>Needs internet once to activate.</div>
          </div>
          {error ? (
            <div className="notice error" style={{ marginTop: 16 }}>
              {error}
            </div>
          ) : null}
          {licenseExp ? (
            <div style={{ marginTop: 14, opacity: 0.65, fontSize: 12 }}>
              Cached token valid until: {new Date(licenseExp * 1000).toLocaleString()}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" data-expanded={sidebarExpanded ? "true" : "false"}>
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarExpanded((prev) => !prev)}
          aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          <span
            className="sidebar-toggle-icon"
            style={navIconStyle(sidebarExpanded ? "/navArrowBack.svg" : "/navArrow.svg")}
          />
        </button>
        <div className="sidebar-brand">
          <p className="eyebrow">TGCampaigner Control</p>
        </div>
        <nav className="side-nav">
          {tabs.map((tab) => {
            if (tab.id === "single") {
              const iconSrc = NAV_ICONS.single;
              return (
                <div key={tab.id} className="side-group">
                  <button
                    className={`side-tab ${activeTab === tab.id ? "active" : ""}`}
                    onClick={() => {
                      handleSideNavSelect("single");
                      handleSideNavToggle("single");
                    }}
                  >
                    <span className="side-icon" style={navIconStyle(iconSrc)} />
                    <span className="side-label">{tab.label}</span>
                    <span className={`side-caret ${sideNavOpen.single ? "open" : ""}`}>▾</span>
                  </button>
                  {sideNavOpen.single && (
                    <div className="side-subnav">
                      {singleNavItems.map((item) => (
                        <button
                          key={item.id}
                          className={`side-subtab ${activeTab === "single" && singlePanel === item.id ? "active" : ""}`}
                          onClick={() => handleSideNavSelect("single", item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            if (tab.id === "sessions") {
              const iconSrc = NAV_ICONS.sessions;
              return (
                <div key={tab.id} className="side-group">
                  <button
                    className={`side-tab ${activeTab === tab.id ? "active" : ""}`}
                    onClick={() => {
                      handleSideNavSelect("sessions");
                      handleSideNavToggle("sessions");
                    }}
                  >
                    <span className="side-icon" style={navIconStyle(iconSrc)} />
                    <span className="side-label">{tab.label}</span>
                    <span className={`side-caret ${sideNavOpen.sessions ? "open" : ""}`}>▾</span>
                  </button>
                  {sideNavOpen.sessions && (
                    <div className="side-subnav">
                      {sessionNavItems.map((item) => (
                        <button
                          key={item.id}
                          className={`side-subtab ${activeTab === "sessions" && sessionsPanel === item.id ? "active" : ""}`}
                          onClick={() => handleSideNavSelect("sessions", item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            if (tab.id === "presets") {
              const iconSrc = NAV_ICONS.presets;
              return (
                <div key={tab.id} className="side-group">
                  <button
                    className={`side-tab ${activeTab === tab.id ? "active" : ""}`}
                    onClick={() => {
                      handleSideNavSelect("presets");
                      handleSideNavToggle("presets");
                    }}
                  >
                    <span className="side-icon" style={navIconStyle(iconSrc)} />
                    <span className="side-label">{tab.label}</span>
                    <span className={`side-caret ${sideNavOpen.presets ? "open" : ""}`}>▾</span>
                  </button>
                  {sideNavOpen.presets && (
                    <div className="side-subnav">
                      {presetNavItems.map((item) => (
                        <button
                          key={item.id}
                          className={`side-subtab ${activeTab === "presets" && presetPanel === item.id ? "active" : ""}`}
                          onClick={() => handleSideNavSelect("presets", item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            if (tab.id === "multi") {
              const iconSrc = NAV_ICONS.multi;
              return (
                <div key={tab.id} className="side-group">
                  <button
                    className={`side-tab ${activeTab === tab.id ? "active" : ""}`}
                    onClick={() => {
                      handleSideNavSelect("multi");
                      handleSideNavToggle("multi");
                    }}
                  >
                    <span className="side-icon" style={navIconStyle(iconSrc)} />
                    <span className="side-label">{tab.label}</span>
                    <span className={`side-caret ${sideNavOpen.multi ? "open" : ""}`}>▾</span>
                  </button>
                  {sideNavOpen.multi && (
                    <div className="side-subnav">
                      {multiNavItems.map((item) => (
                        <button
                          key={item.id}
                          className={`side-subtab ${activeTab === "multi" && multiPanel === item.id ? "active" : ""}`}
                          onClick={() => handleSideNavSelect("multi", item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            const iconSrc = NAV_ICONS[tab.id] || "/grid.svg";
            return (
              <button
                key={tab.id}
                className={`side-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => {
                  closeSideNav();
                  handleSideNavSelect(tab.id);
                }}
              >
                <span className="side-icon" style={navIconStyle(iconSrc)} />
                <span className="side-label">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="app-main">
        <div className="app-content">
          <header className="main-header">
            <div>
              <p className="eyebrow">Workspace</p>
              <h2>{activeTabLabel}</h2>
              <p className="subtle">Pick a section from the left navigation.</p>
            </div>
          </header>

          {(notice || warning || error) && (
            <div className="alerts">
              {notice && (
                <div key={`notice-${notice}`} className="alert-item alert-success">
                  <span>{notice}</span>
                  <span className="alert-progress" />
                </div>
              )}
              {warning && (
                <div key={`warning-${warning}`} className="alert-item alert-warning">
                  <span>{warning}</span>
                  <span className="alert-progress" />
                </div>
              )}
              {error && (
                <div key={`error-${error}`} className="alert-item alert-error">
                  <span>{error}</span>
                  <span className="alert-progress" />
                </div>
              )}
            </div>
          )}

      {showOverview && (
      <section className="section">
        <div className="section-header">
          <h2>Overview</h2>
          <button
            className="ghost"
            onClick={() => {
              refreshSessions();
              refreshJobs();
              refreshLogs();
            }}
          >
            Refresh all
          </button>
        </div>
        <div className="overview-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Sessions</h3>
              <span className="hint">{sessionOptions.length} total</span>
            </div>
            <SessionBrowser
              sessions={sessionViews}
              selected={managedSession}
              onSelect={focusSession}
              maxHeight={360}
              emptyText="No sessions found. Add sessions in the backend."
            />
          </div>

          <div className="overview-stack">
            <div className="panel">
              <div className="panel-header">
                <h3>Running Jobs</h3>
                <span className="hint">{runningJobs.length} running</span>
              </div>
              {runningJobs.length === 0 ? (
                <p className="muted">No running jobs.</p>
              ) : (
                <div className="job-list">
                  {runningJobs.map((job) => (
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
                            setActiveTab("metrics");
                          }}
                        >
                          View logs
                        </button>
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Log Source</h3>
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
          </div>

          <div className="overview-span">
            <div className="log-row">
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
            </div>
          </div>
        </div>
      </section>
      )}

      {showSessions && (
      <section className="section">
        <div className="section-header">
          <h2>Session management</h2>
          <button className="ghost" onClick={refreshSessions}>
            Refresh
          </button>
        </div>
          <div className="panel-grid">
          {(sessionsPanel === "sessions-main" || !sessionsPanel) && (
          <div className="panel" id="sessions-main">
            <div className="panel-header">
              <h3>Sessions</h3>
              <span className="hint">{sessionOptions.length} total</span>
            </div>
            <SessionBrowser
              sessions={sessionViews}
              selected={managedSession}
              onSelect={selectManagedSession}
              maxHeight={520}
              emptyText="No sessions found. Add sessions in the backend."
            />
          </div>
          )}

          {(sessionsPanel === "sessions-main" || !sessionsPanel) && (
          <div className="panel" id="sessions-manage">
            <div className="panel-header">
              <h3>Session Management</h3>
              <span className="hint">Create, rename, delete, import</span>
            </div>
            <div className="form-grid">
              <label>
                Create new session
                <div className="row">
                  <input
                    type="text"
                    value={createSessionForm.name}
                    onChange={(e) =>
                      setCreateSessionForm((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="session_name"
                  />
                  <input
                    type="text"
                    value={createSessionForm.phone}
                    onChange={(e) =>
                      setCreateSessionForm((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                    placeholder="+15551234567"
                  />
                  <button className="primary" onClick={handleCreateSessionStart}>
                    Send code
                  </button>
                </div>
              </label>

              {createSessionForm.login_id && (
                <label>
                  Verify session sign-in
                  <div className="row">
                    {!createSessionForm.need_password && (
                      <input
                        type="text"
                        value={createSessionForm.code}
                        onChange={(e) =>
                          setCreateSessionForm((prev) => ({
                            ...prev,
                            code: e.target.value,
                          }))
                        }
                        placeholder="Telegram code"
                      />
                    )}
                    <input
                      type="password"
                      value={createSessionForm.password}
                      onChange={(e) =>
                        setCreateSessionForm((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      placeholder={
                        createSessionForm.need_password
                          ? "2FA password (required)"
                          : "2FA password (if enabled)"
                      }
                    />
                    <button className="primary" onClick={handleCreateSessionFinish}>
                      Verify
                    </button>
                    <button className="ghost" onClick={handleCreateSessionCancel}>
                      Cancel
                    </button>
                  </div>
                </label>
              )}

              <label>
                Rename session
                <div className="row">
                  <SessionSelect
                    value={renameSession.old_name}
                    options={sessionViews}
                    onChange={(next) => {
                      setRenameSession((prev) => ({ ...prev, old_name: next }));
                      setManagedSession(next);
                    }}
                  />
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
                  <SessionSelect
                    value={deleteSession}
                    options={sessionViews}
                    onChange={(next) => {
                      setDeleteSession(next);
                      setManagedSession(next);
                    }}
                  />
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
          )}

          {sessionsPanel === "sessions-api" && (
          <div className="panel" id="sessions-api">
            <div className="panel-header">
              <h3>Telegram API Setup</h3>
              <span className="hint">{telegramApiSetup.configured ? "Configured" : "Required for sessions"}</span>
            </div>
            <p className="helper-text">
              Add your Telegram developer credentials from my.telegram.org. These are required to create or sign in sessions.
              The app stores them in the local backend environment file and restarts the local backend automatically.
            </p>
            <div className="form-grid">
              <label>
                API_ID
                <input
                  type="text"
                  value={telegramApiSetupForm.api_id}
                  onChange={(e) =>
                    setTelegramApiSetupForm((prev) => ({ ...prev, api_id: e.target.value }))
                  }
                  placeholder="12345678"
                />
              </label>
              <label>
                API_HASH
                <input
                  type="password"
                  value={telegramApiSetupForm.api_hash}
                  onChange={(e) =>
                    setTelegramApiSetupForm((prev) => ({ ...prev, api_hash: e.target.value }))
                  }
                  placeholder={
                    telegramApiSetup.api_hash_set
                      ? "Stored (enter new value to rotate)"
                      : "32-character hex value"
                  }
                />
              </label>
              <div className="row">
                <button className="primary" onClick={handleSaveTelegramApiSetup} disabled={savingTelegramApiSetup}>
                  {savingTelegramApiSetup ? "Saving..." : "Save API credentials"}
                </button>
                <button className="ghost" onClick={() => loadTelegramApiSetup()}>
                  Reload
                </button>
              </div>
            </div>
          </div>
          )}

          {sessionsPanel === "sessions-tools" && (
          <div className="panel" id="sessions-tools">
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
          )}

          {sessionsPanel === "sessions-tools" && (
          <div className="panel" id="sessions-proxy">
            <div className="panel-header">
              <h3>Session Proxy</h3>
              <span className="hint">One proxy per session</span>
            </div>
            <div className="form-grid">
              <label>
                Session
                <SessionSelect
                  value={proxyForm.session}
                  options={sessionViews}
                  onChange={(next) => {
                    setProxyForm((prev) => ({ ...prev, session: next }));
                    setManagedSession(next);
                  }}
                />
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
              <p className="helper-text">
                Proxies that require authentication must include username and password. Save runs a live connectivity check.
              </p>
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
                <button className="primary" onClick={handleSaveProxy} disabled={savingProxy}>
                  {savingProxy ? "Testing proxy..." : "Save proxy"}
                </button>
                <button className="ghost" onClick={handleClearProxy}>
                  Remove proxy
                </button>
              </div>
            </div>
          </div>
          )}

          {sessionsPanel === "sessions-tools" && (
          <div className="panel" id="sessions-ai">
            <div className="panel-header">
              <h3>AI Profiles</h3>
              <span className="hint">Store multiple providers + models for warmup</span>
            </div>
            <div className="session-list">
              {aiProfiles.length === 0 && <p className="muted">No AI profiles saved yet.</p>}
              {aiProfiles.map((profile) => (
                <div key={profile.id} className="session-card">
                  <div>
                    <h4>{profile.label || profile.provider}</h4>
                    <p className="meta">
                      {profile.provider}
                      {profile.model ? ` • ${profile.model}` : ""}
                    </p>
                    <p className="meta">
                      {profile.has_key ? "Key saved" : "No key"}
                      {aiDefaultId === profile.id ? " • Default" : ""}
                    </p>
                  </div>
                  <div className="row">
                    <button className="ghost" onClick={() => handleEditAiProfile(profile)}>
                      Edit
                    </button>
                    <button
                      className="ghost"
                      onClick={() => handleSetDefaultAiProfile(profile.id)}
                      disabled={aiDefaultId === profile.id}
                    >
                      {aiDefaultId === profile.id ? "Default" : "Set default"}
                    </button>
                    <button className="danger" onClick={() => handleDeleteAiProfile(profile.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="panel-header" style={{ marginTop: "16px" }}>
              <h3>{aiEditingId ? "Edit profile" : "Add profile"}</h3>
              <span className="hint">Leave API key blank to keep current</span>
            </div>
            <div className="form-grid">
              <label>
                Label
                <input
                  type="text"
                  value={aiProfileForm.label}
                  onChange={(e) => setAiProfileForm({ ...aiProfileForm, label: e.target.value })}
                  placeholder="OpenAI main"
                />
              </label>
              <label>
                Provider
                <select
                  value={aiProfileForm.provider}
                  onChange={(e) => setAiProfileForm({ ...aiProfileForm, provider: e.target.value })}
                >
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                  <option value="groq">Groq</option>
                </select>
              </label>
              <label>
                Model
                <input
                  type="text"
                  value={aiProfileForm.model}
                  onChange={(e) => setAiProfileForm({ ...aiProfileForm, model: e.target.value })}
                  placeholder={
                    aiProfileForm.provider === "groq"
                      ? "llama-3.1-8b-instant"
                      : aiProfileForm.provider === "gemini"
                      ? "gemini-2.5-flash"
                      : "gpt-4o-mini"
                  }
                />
              </label>
              <label>
                API key
                <input
                  type="password"
                  value={aiProfileForm.api_key}
                  onChange={(e) => setAiProfileForm({ ...aiProfileForm, api_key: e.target.value })}
                  placeholder={aiEditingId ? "Leave blank to keep existing key" : "Paste your API key"}
                />
              </label>
              <div className="row">
                <button className="primary" onClick={handleSaveAiProfile}>
                  {aiEditingId ? "Update profile" : "Add profile"}
                </button>
                {aiEditingId && (
                  <button className="ghost" onClick={resetAiProfileForm}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
          )}
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
          <div className="panel" id="preset-form">
            <div className="panel-header">
              <div>
                <h3>{presetEditing ? "Edit preset" : "Create preset"}</h3>
                <span className="hint">Timing + safety bundle</span>
              </div>
              {presetEditing && (
                <button
                  className="ghost"
                  onClick={() => {
                    const nextKind = presetPanel === "preset-warmup" ? "warmup" : "dm";
                    setPresetForm({ ...defaultPresetForm, kind: nextKind });
                    setPresetEditing(false);
                  }}
                >
                  New preset
                </button>
              )}
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
                  onChange={(e) => {
                    const nextKind = e.target.value;
                    setPresetForm({ ...presetForm, kind: nextKind });
                    setPresetPanel(nextKind === "warmup" ? "preset-warmup" : "preset-dm");
                  }}
                >
                  <option value="dm">DM / Invite / Bulk / Forward</option>
                  <option value="warmup">Warmup</option>
                </select>
              </label>
              {presetForm.kind === "dm" ? (
                <>
                  <div className="row">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={presetForm.all_csv_users}
                        onChange={(e) =>
                          setPresetForm({
                            ...presetForm,
                            all_csv_users: e.target.checked,
                            max_users: e.target.checked ? "" : presetForm.max_users,
                          })
                        }
                      />
                      All CSV users
                    </label>
                    <label>
                      Total users
                      <input
                        type="number"
                        min={1}
                        value={presetForm.max_users}
                        onChange={(e) => setPresetForm({ ...presetForm, max_users: e.target.value })}
                        disabled={presetForm.all_csv_users}
                      />
                    </label>
                  </div>
                  <p className="hint">
                    Warning: for humanistic loops and in general, DMing too many users can risk bans.
                  </p>
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
                      Warmup modes
                      <div className="toggles">
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={presetForm.warmup_modes.includes("react")}
                            onChange={() => toggleWarmupMode("react")}
                          />
                          React
                        </label>
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={presetForm.warmup_modes.includes("reply")}
                            onChange={() => toggleWarmupMode("reply")}
                            disabled={aiReadyProfiles.length === 0}
                          />
                          Reply
                        </label>
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={presetForm.warmup_modes.includes("message")}
                            onChange={() => toggleWarmupMode("message")}
                            disabled={aiReadyProfiles.length === 0}
                          />
                          Message
                        </label>
                      </div>
                    </label>
                    <label>
                      Context size (last messages)
                      <input
                        type="number"
                        value={presetForm.context_messages}
                        onChange={(e) => setPresetForm({ ...presetForm, context_messages: e.target.value })}
                      />
                    </label>
                  </div>
                  {presetForm.warmup_modes.some((mode) => mode === "reply" || mode === "message") && (
                    <label>
                      AI profile
                      <select
                        value={presetForm.ai_profile_id}
                        onChange={(e) => setPresetForm({ ...presetForm, ai_profile_id: e.target.value })}
                      >
                        <option value="">Use default</option>
                        {aiReadyProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.label || profile.provider} {profile.model ? `(${profile.model})` : ""}
                          </option>
                        ))}
                      </select>
                      {aiReadyProfiles.length === 0 && (
                        <span className="hint">No AI profiles with keys saved. Warmup will react only.</span>
                      )}
                    </label>
                  )}
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

	          {presetPanel !== "preset-warmup" && (
		          <div className="panel" id="preset-dm">
		            <div className="panel-header">
		              <h3>Saved DM presets</h3>
		              <span className="hint">
		                {dmPresetQuery ? `${filteredDmPresets.length} shown • ${dmPresets.length} total` : `${dmPresets.length} total`}
		              </span>
		            </div>
		            <div className="session-browser">
		              <div className="session-browser-controls">
		                <input
		                  type="text"
		                  value={dmPresetQuery}
		                  onChange={(e) => setDmPresetQuery(e.target.value)}
		                  placeholder="Search DM presets..."
		                />
		              </div>
		              <div className="session-list">
		                {dmPresets.length === 0 && <p className="muted">No DM presets yet.</p>}
		                {dmPresets.length > 0 && filteredDmPresets.length === 0 && (
		                  <p className="muted">No presets match that search.</p>
		                )}
		                {filteredDmPresets.map((preset) => (
		                  <div key={preset.name} className="session-card">
		                    <div>
		                      <h4>{preset.name}</h4>
		                      <p className="meta">
		                        Interval {preset.interval_seconds}s • Rate mode {preset.rate_mode} • Users{" "}
		                        {preset.all_csv_users || !preset.max_users ? "all" : preset.max_users}
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
		          )}

	          {presetPanel === "preset-warmup" && (
		          <div className="panel" id="preset-warmup">
		            <div className="panel-header">
		              <h3>Saved Warmup presets</h3>
		              <span className="hint">
		                {warmupPresetQuery
		                  ? `${filteredWarmupPresets.length} shown • ${warmupPresets.length} total`
		                  : `${warmupPresets.length} total`}
		              </span>
		            </div>
		            <div className="session-browser">
		              <div className="session-browser-controls">
		                <input
		                  type="text"
		                  value={warmupPresetQuery}
		                  onChange={(e) => setWarmupPresetQuery(e.target.value)}
		                  placeholder="Search warmup presets..."
		                />
		              </div>
		              <div className="session-list">
		                {warmupPresets.length === 0 && <p className="muted">No warmup presets yet.</p>}
		                {warmupPresets.length > 0 && filteredWarmupPresets.length === 0 && (
		                  <p className="muted">No presets match that search.</p>
		                )}
		                {filteredWarmupPresets.map((preset) => (
		                  <div key={preset.name} className="session-card">
		                    <div>
		                      <h4>{preset.name}</h4>
		                      <p className="meta">
		                        Total {preset.total_messages ?? 0} • {preset.min_delay ?? 0}-{preset.max_delay ?? 0}s • Modes{" "}
		                        {(preset.warmup_modes && preset.warmup_modes.length
		                          ? preset.warmup_modes
		                          : preset.warmup_mode
		                          ? [preset.warmup_mode]
		                          : ["reply"]
		                        ).join(", ")}
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
		          )}
        </div>
      </section>
      )}

      
      
      {showWorkflows && (
        <section className="workflow-section">
          <div className="workflow-layout">
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
              <div className="workflow-canvas-wrap">
                <div className="workflow-blocks-panel">
                  <div className="workflow-blocks">
                    {[
                      { type: "session", label: "Session", disabled: workflowHasSession },
                      { type: "wait", label: "Wait", disabled: !workflowHasSession },
                      { type: "dm", label: "DM", disabled: !workflowHasSession },
                      { type: "invite", label: "Invite", disabled: !workflowHasSession },
                      { type: "bulk_add", label: "Bulk add", disabled: !workflowHasSession },
                      { type: "forward", label: "Forward", disabled: !workflowHasSession },
                      { type: "warmup", label: "Warmup", disabled: !workflowHasSession },
                    ].map((block) => {
                      const iconSrc = WORKFLOW_NODE_ICONS[block.type];
                      return (
                        <button
                          key={block.type}
                          className="workflow-block-btn"
                          disabled={block.disabled}
                        aria-label={block.label}
                          onClick={() => addWorkflowNode(block.type)}
                        >
                          {iconSrc ? <img className="workflow-block-icon" src={iconSrc} alt="" aria-hidden="true" /> : null}
                          <span className="workflow-block-label">{block.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="workflow-sidebar-overlay">
                  {selectedNode && (
                    <div className="workflow-overlay-panel">
                      <div className="panel-header">
                        <h3>Inspector</h3>
                        <span className="hint">Configure selected node</span>
                      </div>
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
                            const sessionValue = typeof config.session === "string" ? config.session : "";
                            const loopCountValue =
                              config.loop_count === ""
                                ? ""
                                : Number.isFinite(Number(config.loop_count))
                                ? Number(config.loop_count)
                                : 1;
                            return (
                              <>
                                <label>
                                  Session
                                  <SessionSelect
                                    value={sessionValue}
                                    options={sessionViews}
                                    onChange={(next) => updateWorkflowNodeConfig(selectedNode.id, { session: next })}
                                  />
                                </label>
                                <label>
                                  Loop count
                                  <input
                                    type="number"
                                    min={1}
                                    value={loopCountValue}
                                    onChange={(e) =>
                                      updateWorkflowNodeConfig(selectedNode.id, {
                                        loop_count: e.target.value === "" ? "" : Number(e.target.value),
                                      })
                                    }
                                  />
                                </label>
                              </>
                            );
                          }
                          if (selectedNode.type === "wait") {
                            const minSecondsValue =
                              config.min_seconds === ""
                                ? ""
                                : Number.isFinite(Number(config.min_seconds))
                                ? Number(config.min_seconds)
                                : 600;
                            const maxSecondsValue =
                              config.max_seconds === ""
                                ? ""
                                : Number.isFinite(Number(config.max_seconds))
                                ? Number(config.max_seconds)
                                : 900;
                            return (
                              <>
                                <label>
                                  Min seconds
                                  <input
                                    type="number"
                                    min={0}
                                    value={minSecondsValue}
                                    onChange={(e) =>
                                      updateWorkflowNodeConfig(selectedNode.id, {
                                        min_seconds: e.target.value === "" ? "" : Number(e.target.value),
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  Max seconds
                                  <input
                                    type="number"
                                    min={0}
                                    value={maxSecondsValue}
                                    onChange={(e) =>
                                      updateWorkflowNodeConfig(selectedNode.id, {
                                        max_seconds: e.target.value === "" ? "" : Number(e.target.value),
                                      })
                                    }
                                  />
                                </label>
                              </>
                            );
                          }
                          if (selectedNode.type === "dm") {
                            const spintaxVariationsValue =
                              config.spintax_variations === ""
                                ? ""
                                : Number.isFinite(Number(config.spintax_variations))
                                ? Number(config.spintax_variations)
                                : 5;
	                            return (
	                              <>
	                                <label>
	                                  Preset
	                                  <PresetSelect
	                                    value={presetValue}
	                                    options={dmPresets}
	                                    onChange={(next) => updateWorkflowNodeConfig(selectedNode.id, { preset_name: next })}
	                                  />
	                                </label>
	                                {renderInputFile()}
	                                <label>
	                                  Media path
	                                  <input
                                    type="text"
                                    value={config.media_path ?? ""}
                                    onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { media_path: e.target.value })}
                                  />
                                </label>
                                <div className="workflow-inspector-toggles">
                                  <label className="toggle">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(config.use_spintax)}
                                      onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { use_spintax: e.target.checked })}
                                    />
                                    Spintax
                                  </label>
                                  <label className="toggle">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(config.spintax_ai)}
                                      disabled={!config.use_spintax}
                                      onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { spintax_ai: e.target.checked })}
                                    />
                                    AI Spintax
                                  </label>
                                </div>
                                <label>
                                  AI variations
                                  <input
                                    type="number"
                                    min={2}
                                    max={12}
                                    disabled={!config.use_spintax || !config.spintax_ai}
                                    value={spintaxVariationsValue}
                                    onChange={(e) =>
                                      updateWorkflowNodeConfig(selectedNode.id, {
                                        spintax_variations: e.target.value === "" ? "" : Number(e.target.value),
                                      })
                                    }
                                  />
                                </label>
                                <div className="helper-text">{SPINTAX_HELP}</div>
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
                            const spintaxVariationsValue =
                              config.spintax_variations === ""
                                ? ""
                                : Number.isFinite(Number(config.spintax_variations))
                                ? Number(config.spintax_variations)
                                : 5;
	                            return (
	                              <>
	                                <label>
	                                  Preset
	                                  <PresetSelect
	                                    value={presetValue}
	                                    options={dmPresets}
	                                    onChange={(next) => updateWorkflowNodeConfig(selectedNode.id, { preset_name: next })}
	                                  />
	                                </label>
	                                {renderInputFile()}
	                                <label>
	                                  Invite link
	                                  <input
                                    type="text"
                                    value={config.invite_url ?? ""}
                                    onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { invite_url: e.target.value })}
                                  />
                                </label>
                                <label>
                                  Media path
                                  <input
                                    type="text"
                                    value={config.media_path ?? ""}
                                    onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { media_path: e.target.value })}
                                  />
                                </label>
                                <div className="workflow-inspector-toggles">
                                  <label className="toggle">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(config.use_spintax)}
                                      onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { use_spintax: e.target.checked })}
                                    />
                                    Spintax
                                  </label>
                                  <label className="toggle">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(config.spintax_ai)}
                                      disabled={!config.use_spintax}
                                      onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { spintax_ai: e.target.checked })}
                                    />
                                    AI Spintax
                                  </label>
                                </div>
                                <label>
                                  AI variations
                                  <input
                                    type="number"
                                    min={2}
                                    max={12}
                                    disabled={!config.use_spintax || !config.spintax_ai}
                                    value={spintaxVariationsValue}
                                    onChange={(e) =>
                                      updateWorkflowNodeConfig(selectedNode.id, {
                                        spintax_variations: e.target.value === "" ? "" : Number(e.target.value),
                                      })
                                    }
                                  />
                                </label>
                                <div className="helper-text">{SPINTAX_HELP}</div>
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
	                                <label>
	                                  Preset
	                                  <PresetSelect
	                                    value={presetValue}
	                                    options={dmPresets}
	                                    onChange={(next) => updateWorkflowNodeConfig(selectedNode.id, { preset_name: next })}
	                                  />
	                                </label>
	                                {renderInputFile()}
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
	                                <label>
	                                  Preset
	                                  <PresetSelect
	                                    value={presetValue}
	                                    options={dmPresets}
	                                    onChange={(next) => updateWorkflowNodeConfig(selectedNode.id, { preset_name: next })}
	                                  />
	                                </label>
	                                {renderInputFile()}
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
                                    checked={Boolean(config.has_media)}
                                    onChange={(e) => updateWorkflowNodeConfig(selectedNode.id, { has_media: e.target.checked })}
                                  />
                                  Has media
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
	                                <label>
	                                  Preset
	                                  <PresetSelect
	                                    value={presetValue}
	                                    options={warmupPresets}
	                                    placeholder="Select warmup preset"
	                                    searchPlaceholder="Search warmup presets..."
	                                    onChange={(next) => updateWorkflowNodeConfig(selectedNode.id, { preset_name: next })}
	                                  />
	                                </label>
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
                    </div>
                  )}

	                  <div className="workflow-overlay-panel">
	                    <div className="panel-header">
	                      <h3>Saved loops</h3>
	                      <span className="hint">
	                        {workflowQuery
	                          ? `${filteredWorkflows.length} shown • ${workflows.length} total`
	                          : `${workflows.length} total`}
	                      </span>
	                    </div>
	                    <div className="session-browser">
	                      <div className="session-browser-controls">
	                        <input
	                          type="text"
	                          value={workflowQuery}
	                          onChange={(e) => setWorkflowQuery(e.target.value)}
	                          placeholder="Search loops..."
	                        />
	                      </div>
	                      <div className="session-list session-list-scroll" style={{ maxHeight: 320 }}>
	                        {workflows.length === 0 && <p className="muted">No loops saved yet.</p>}
	                        {workflows.length > 0 && filteredWorkflows.length === 0 && (
	                          <p className="muted">No loops match that search.</p>
	                        )}
	                        {filteredWorkflows.map((workflow) => (
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
	                  </div>
                </div>

                <div
                  className="workflow-canvas"
                  ref={canvasRef}
                  onMouseDown={(event) => {
                    const target = event.target as HTMLElement | null;
                    if (target && target.closest(".workflow-node")) {
                      return;
                    }
                    setSelectedNodeId(null);
                    setLinkFrom(null);
                    setPanning({
                      startX: event.clientX,
                      startY: event.clientY,
                      originX: canvasOffset.x,
                      originY: canvasOffset.y,
                    });
                  }}
                  onWheelCapture={handleCanvasWheel}
                >
                  <div className="workflow-zoom">
                    <button className="ghost" onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.1).toFixed(2))))}>−</button>
                    <button className="ghost" onClick={() => setZoom(1)}>100%</button>
                    <button className="ghost" onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.1).toFixed(2))))}>+</button>
                  </div>
                  <div
                    className="workflow-canvas-inner"
                    style={{
                      width: workflowWorld.width,
                      height: workflowWorld.height,
                      transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})`,
                    }}
                  >
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
                          <path d="M0,0 L0,6 L9,3 z" fill="var(--wf-edge, rgba(220,223,235,0.8))" />
                        </marker>
                      </defs>
                      {workflowDraft.edges.map((edge) => {
                        const source = nodeLookup.get(edge.source);
                        const target = nodeLookup.get(edge.target);
                        if (!source?.position || !target?.position) return null;
                        const { x1, y1, x2, y2, c1x, c1y, c2x, c2y } = getEdgePoints(
                          source.position,
                          target.position,
                          { x: workflowWorld.originX, y: workflowWorld.originY }
                        );
                        const d = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
                        return (
                          <path
                            key={edge.id}
                            d={d}
                            fill="none"
                            stroke="var(--wf-edge, rgba(220,223,235,0.75))"
                            strokeWidth="1.6"
                            markerEnd="url(#arrow)"
                          />
                        );
                      })}
                    </svg>

                    {workflowDraft.nodes.map((node) => {
                      const config = node.config as Record<string, any>;
                      const presetLabel = typeof config.preset_name === "string" ? config.preset_name : "";
                      const inputFile = typeof config.input_file === "string" ? config.input_file : "";
                      const sessionValue = typeof config.session === "string" ? config.session : "";
                      const loopCount = Number(config.loop_count ?? 1);
                      const iconSrc = WORKFLOW_NODE_ICONS[node.type];
                      const nodeLabel = node.type.replace("_", " ");
                      const sessionLabel = sessionValue
                        ? `Session: ${sessionValue} • Loops: ${Number.isFinite(loopCount) ? loopCount : 1}`
                        : "Select session";
                      const metaLines: string[] = [];
                      if (node.type === "session") {
                        metaLines.push(sessionLabel);
                      } else {
                        if (presetLabel) metaLines.push(`Preset: ${presetLabel}`);
                        if (inputFile && node.type !== "warmup") metaLines.push(`CSV: ${inputFile}`);
                      }
                      return (
                        <div
                          key={node.id}
                          className={`workflow-node${selectedNodeId === node.id ? " selected" : ""}${
                            linkFrom === node.id ? " linking" : ""
                          }`}
                          style={{
                            left: (node.position?.x ?? 0) + workflowWorld.originX,
                            top: (node.position?.y ?? 0) + workflowWorld.originY,
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
                          <div className="node-actions">
                            <button
                              className="node-btn"
                              title={workflowDraft.edges.some((edge) => edge.source === node.id) ? "Unlink" : "Link"}
                              aria-label={workflowDraft.edges.some((edge) => edge.source === node.id) ? "Unlink" : "Link"}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (workflowDraft.edges.some((edge) => edge.source === node.id)) {
                                  removeWorkflowLinks(node.id);
                                  return;
                                }
                                if (linkFrom === node.id) {
                                  setLinkFrom(null);
                                  return;
                                }
                                setLinkFrom(node.id);
                              }}
                            >
                              {workflowDraft.edges.some((edge) => edge.source === node.id) ? "⛓️‍💥" : "🔗"}
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
                          {iconSrc ? <img className="node-icon" src={iconSrc} alt="" aria-hidden="true" /> : null}
                          <div className="node-caption">
                            <div className="node-title">{nodeLabel}</div>
                            {metaLines.map((line) => (
                              <div key={line} className="node-subtitle">
                                {line}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

{showSingle && (
      <section className="section">
        <div className="section-header">
          <h2>Single-Account Campaigns</h2>
          <span className="hint">Pick a campaign type and run it fast</span>
        </div>
        <div className="panel-grid single-layout">
          <div className="panel single-session-panel">
            <div className="panel-header">
              <h3>Session</h3>
              <span className="hint">{singleSession ? "Active session" : "Pick a session"}</span>
            </div>
            <div className="form-grid">
              <label>
                Active session
                <SessionSelect value={singleSession} options={sessionViews} onChange={setSingleSession} />
              </label>
            </div>
          </div>
          {singlePanel === "dm" && (
          <div className="panel single-panel">
            <div className="panel-header">
              <h3>Direct Message</h3>
              <span className="hint">CSV → DM</span>
            </div>
	            <div className="form-grid">
	              <label>
	                Preset
	                <PresetSelect
	                  value={dmForm.preset_name}
	                  options={presetOptions}
	                  placeholder="Select preset"
	                  searchPlaceholder="Search DM presets..."
	                  onChange={(next) => setDmForm({ ...dmForm, preset_name: next })}
	                />
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
                    onChange={(e) =>
                      setDmForm({
                        ...dmForm,
                        use_spintax: e.target.checked,
                        spintax_ai: e.target.checked ? dmForm.spintax_ai : false,
                      })
                    }
                  />
                  Spintax
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={dmForm.spintax_ai}
                    disabled={!dmForm.use_spintax}
                    onChange={(e) => setDmForm({ ...dmForm, spintax_ai: e.target.checked })}
                  />
                  AI Spintax
                </label>
              </div>
              <label>
                AI variations
                <input
                  type="number"
                  min={2}
                  max={12}
                  disabled={!dmForm.use_spintax || !dmForm.spintax_ai}
                  value={dmForm.spintax_variations}
                  onChange={(e) => setDmForm({ ...dmForm, spintax_variations: e.target.value })}
                />
              </label>
              <div className="helper-text">{SPINTAX_HELP}</div>
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
                      spintax_ai: dmForm.spintax_ai,
                      spintax_variations:
                        dmForm.spintax_ai && dmForm.spintax_variations
                          ? toOptionalInt(dmForm.spintax_variations)
                          : undefined,
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
          )}

          {singlePanel === "invite" && (
          <div className="panel single-panel">
            <div className="panel-header">
              <h3>Invite Link DM</h3>
              <span className="hint">DM invite to group/channel</span>
            </div>
	            <div className="form-grid">
	              <label>
	                Preset
	                <PresetSelect
	                  value={inviteForm.preset_name}
	                  options={presetOptions}
	                  placeholder="Select preset"
	                  searchPlaceholder="Search DM presets..."
	                  onChange={(next) => setInviteForm({ ...inviteForm, preset_name: next })}
	                />
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
                    onChange={(e) =>
                      setInviteForm({
                        ...inviteForm,
                        use_spintax: e.target.checked,
                        spintax_ai: e.target.checked ? inviteForm.spintax_ai : false,
                      })
                    }
                  />
                  Spintax
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={inviteForm.spintax_ai}
                    disabled={!inviteForm.use_spintax}
                    onChange={(e) => setInviteForm({ ...inviteForm, spintax_ai: e.target.checked })}
                  />
                  AI Spintax
                </label>
              </div>
              <label>
                AI variations
                <input
                  type="number"
                  min={2}
                  max={12}
                  disabled={!inviteForm.use_spintax || !inviteForm.spintax_ai}
                  value={inviteForm.spintax_variations}
                  onChange={(e) => setInviteForm({ ...inviteForm, spintax_variations: e.target.value })}
                />
              </label>
              <div className="helper-text">{SPINTAX_HELP}</div>
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
                      spintax_ai: inviteForm.spintax_ai,
                      spintax_variations:
                        inviteForm.spintax_ai && inviteForm.spintax_variations
                          ? toOptionalInt(inviteForm.spintax_variations)
                          : undefined,
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
          )}

          {singlePanel === "bulk_add" && (
          <div className="panel single-panel">
            <div className="panel-header">
              <h3>Bulk Add</h3>
              <span className="hint">Invite users to group</span>
            </div>
	            <div className="form-grid">
	              <label>
	                Preset
	                <PresetSelect
	                  value={bulkAddForm.preset_name}
	                  options={presetOptions}
	                  placeholder="Select preset"
	                  searchPlaceholder="Search DM presets..."
	                  onChange={(next) => setBulkAddForm({ ...bulkAddForm, preset_name: next })}
	                />
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
          )}

          {singlePanel === "forward" && (
          <div className="panel single-panel">
            <div className="panel-header">
              <h3>Forward Message</h3>
              <span className="hint">Forward from source to users</span>
            </div>
	            <div className="form-grid">
	              <label>
	                Preset
	                <PresetSelect
	                  value={forwardForm.preset_name}
	                  options={presetOptions}
	                  placeholder="Select preset"
	                  searchPlaceholder="Search DM presets..."
	                  onChange={(next) => setForwardForm({ ...forwardForm, preset_name: next })}
	                />
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
          )}

          {singlePanel === "profile" && (
          <div className="panel single-panel">
            <div className="panel-header">
              <h3>Profile Rotation</h3>
              <span className="hint">Update name/bio/photo</span>
            </div>
            <div className="form-grid">
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
          )}

          {singlePanel === "warmup" && (
          <div className="panel single-panel">
            <div className="panel-header">
              <h3>Warmup</h3>
              <span className="hint">Group-only warmup with AI context</span>
            </div>
            <div className="form-grid">
              <p className="hint">
                Warmup mode is defined by the preset (React / Reply / Message). Uses the last 50 messages for context and falls back to reactions if no AI profile is available.
              </p>
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
	                <PresetSelect
	                  value={warmupForm.preset_name}
	                  options={warmupPresets}
	                  placeholder="Select warmup preset"
	                  searchPlaceholder="Search warmup presets..."
	                  onChange={(next) => setWarmupForm({ ...warmupForm, preset_name: next })}
	                />
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
          )}
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
            <MultiSessionPicker
              sessions={sessionViews}
              selected={multiSessions}
              onToggle={toggleMultiSession}
              onSelectAll={selectAllSessions}
              onClear={clearSessions}
            />
          </div>

          {multiPanel === "multi-dm" && (
          <div className="panel" id="multi-dm">
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
	                <PresetSelect
	                  value={multiForm.preset_name}
	                  options={presetOptions}
	                  placeholder="Select preset"
	                  searchPlaceholder="Search DM presets..."
	                  onChange={(next) => setMultiForm({ ...multiForm, preset_name: next })}
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
                    checked={multiForm.use_spintax}
                    onChange={(e) =>
                      setMultiForm({
                        ...multiForm,
                        use_spintax: e.target.checked,
                        spintax_ai: e.target.checked ? multiForm.spintax_ai : false,
                      })
                    }
                  />
                  Spintax
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={multiForm.spintax_ai}
                    disabled={!multiForm.use_spintax}
                    onChange={(e) => setMultiForm({ ...multiForm, spintax_ai: e.target.checked })}
                  />
                  AI Spintax
                </label>
              </div>
              <label>
                AI variations
                <input
                  type="number"
                  min={2}
                  max={12}
                  disabled={!multiForm.use_spintax || !multiForm.spintax_ai}
                  value={multiForm.spintax_variations}
                  onChange={(e) => setMultiForm({ ...multiForm, spintax_variations: e.target.value })}
                />
              </label>
              <div className="helper-text">{SPINTAX_HELP}</div>
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
                      spintax_ai: multiForm.spintax_ai,
                      spintax_variations:
                        multiForm.spintax_ai && multiForm.spintax_variations
                          ? toOptionalInt(multiForm.spintax_variations)
                          : undefined,
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
          )}

          {multiPanel === "multi-invite" && (
          <div className="panel" id="multi-invite">
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
	                <PresetSelect
	                  value={multiInviteForm.preset_name}
	                  options={presetOptions}
	                  placeholder="Select preset"
	                  searchPlaceholder="Search DM presets..."
	                  onChange={(next) => setMultiInviteForm({ ...multiInviteForm, preset_name: next })}
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
                    checked={multiInviteForm.use_spintax}
                    onChange={(e) =>
                      setMultiInviteForm({
                        ...multiInviteForm,
                        use_spintax: e.target.checked,
                        spintax_ai: e.target.checked ? multiInviteForm.spintax_ai : false,
                      })
                    }
                  />
                  Spintax
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={multiInviteForm.spintax_ai}
                    disabled={!multiInviteForm.use_spintax}
                    onChange={(e) => setMultiInviteForm({ ...multiInviteForm, spintax_ai: e.target.checked })}
                  />
                  AI Spintax
                </label>
              </div>
              <label>
                AI variations
                <input
                  type="number"
                  min={2}
                  max={12}
                  disabled={!multiInviteForm.use_spintax || !multiInviteForm.spintax_ai}
                  value={multiInviteForm.spintax_variations}
                  onChange={(e) => setMultiInviteForm({ ...multiInviteForm, spintax_variations: e.target.value })}
                />
              </label>
              <div className="helper-text">{SPINTAX_HELP}</div>
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
                      spintax_ai: multiInviteForm.spintax_ai,
                      spintax_variations:
                        multiInviteForm.spintax_ai && multiInviteForm.spintax_variations
                          ? toOptionalInt(multiInviteForm.spintax_variations)
                          : undefined,
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
          )}

          {multiPanel === "multi-bulk" && (
          <div className="panel" id="multi-bulk">
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
	                <PresetSelect
	                  value={multiBulkAddForm.preset_name}
	                  options={presetOptions}
	                  placeholder="Select preset"
	                  searchPlaceholder="Search DM presets..."
	                  onChange={(next) => setMultiBulkAddForm({ ...multiBulkAddForm, preset_name: next })}
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
          )}

          {multiPanel === "multi-forward" && (
          <div className="panel" id="multi-forward">
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
	                <PresetSelect
	                  value={multiForwardForm.preset_name}
	                  options={presetOptions}
	                  placeholder="Select preset"
	                  searchPlaceholder="Search DM presets..."
	                  onChange={(next) => setMultiForwardForm({ ...multiForwardForm, preset_name: next })}
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
          )}

          {multiPanel === "multi-profile" && (
          <div className="panel" id="multi-profile">
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
          )}


          {multiPanel === "multi-warmup" && (
          <div className="panel" id="multi-warmup">
            <div className="panel-header">
              <h3>Multi Warmup</h3>
              <span className="hint">Group-only warmup across selected sessions</span>
            </div>
            <div className="form-grid">
              <p className="hint">
                Warmup mode is defined by the preset (React / Reply / Message). Uses the last 50 messages for context and falls back to reactions if no AI profile is available.
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
	                <PresetSelect
	                  value={multiWarmupForm.preset_name}
	                  options={warmupPresets}
	                  placeholder="Select warmup preset"
	                  searchPlaceholder="Search warmup presets..."
	                  onChange={(next) => setMultiWarmupForm({ ...multiWarmupForm, preset_name: next })}
	                />
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
          )}
        </div>
      </section>
      )}

      {showMetrics && (
      <section className="section">
        <div className="section-header">
          <h2>Metrics</h2>
          <button
            className="ghost"
            onClick={() => {
              refreshJobs();
              refreshLogs();
            }}
          >
            Refresh
          </button>
        </div>
        <div className="panel-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Jobs</h3>
              <span className="hint">{jobs.length} total</span>
            </div>
            {jobs.length === 0 ? (
              <p className="muted">No jobs yet.</p>
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
          <div className="panel">
            <div className="panel-header">
              <h3>Log Source</h3>
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
        </div>
        <div className="log-row">
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
        </div>
      </section>
      )}

      {showLicense && (
      <section className="section">
        <div className="section-header">
          <h2>License</h2>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h3>Current machine license</h3>
          </div>
          <div className="form-grid">
            <label>
              License key
              <input type="text" value={licenseKeyValue || "Not available"} disabled />
            </label>
            <label>
              Customer email
              <input type="text" value={licenseEmail || "Not available"} disabled />
            </label>
            <label>
              Token expiry
              <input
                type="text"
                value={licenseExp ? new Date(licenseExp * 1000).toLocaleString() : "Not available"}
                disabled
              />
            </label>
            <label>
              Status
              <input type="text" value={licenseActive ? "Active" : "Inactive"} disabled />
            </label>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h3>Local data reset</h3>
            <span className="hint">Recommended: keep license</span>
          </div>
          <p className="helper-text">
            Clear local sessions, logs, and runtime state when troubleshooting. Keep license by default so users do not
            need to reactivate.
          </p>
          <div className="row">
            <button className="ghost" onClick={handleClearLocalData} disabled={resettingData || resettingFactory}>
              {resettingData ? "Clearing data..." : "Clear local data (keep license)"}
            </button>
            <button className="danger" onClick={handleFactoryReset} disabled={resettingData || resettingFactory}>
              {resettingFactory ? "Resetting..." : "Factory reset (clear data + license)"}
            </button>
          </div>
        </div>
      </section>
      )}
        </div>
      </main>
    </div>
  );
}

export default App;

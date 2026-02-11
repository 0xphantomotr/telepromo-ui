import { licensing, isTauri } from "./license";

type ApiResponse<T> = T & { error?: string };

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

const DEVICE_SIG_HEADER = "X-TGCampaigner-Device-Sig";
const DEVICE_TS_HEADER = "X-TGCampaigner-Device-Ts";

const headersToRecord = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers as Record<string, string>;
};

const sha256Hex = async (value: string) => {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const buildAuthHeaders = async (path: string, options?: RequestInit): Promise<Record<string, string>> => {
  // For browser dev / preview, we often run without Tauri; allow unlicensed requests in that mode.
  if (!isTauri()) {
    return {};
  }
  const token = await licensing.getToken();
  if (!token) {
    return {};
  }
  const method = (options?.method || "GET").toUpperCase();
  const body = typeof options?.body === "string" ? options.body : "";
  const ts = Math.floor(Date.now() / 1000);
  const bodyHash = await sha256Hex(body);
  const canonical = `${ts}\n${method}\n${path}\n${bodyHash}`;
  const sig = await licensing.sign(canonical);
  if (!sig) {
    return {};
  }
  return {
    Authorization: `Bearer ${token}`,
    [DEVICE_TS_HEADER]: String(ts),
    [DEVICE_SIG_HEADER]: sig,
  };
};

async function request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const authHeaders = await buildAuthHeaders(path, options);
  const baseHeaders = headersToRecord(options?.headers);
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...baseHeaders, ...authHeaders },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as ApiResponse<T>;
}

export const api = {
  health: () => request<{ ok: boolean }>("/health"),
  sessions: () =>
    request<{
      sessions: Array<{
        name: string;
        proxy: boolean;
        username?: string;
        phone?: string;
        last_used?: string;
      }>;
    }>("/sessions"),
  sessionProxy: (name: string) =>
    request<{
      proxy: {
        proxy_type: string;
        hostname?: string;
        port?: number;
        username?: string | null;
        password?: string | null;
        secret?: string | null;
      } | null;
    }>(`/sessions/${encodeURIComponent(name)}/proxy`),
  saveSessionProxy: (
    name: string,
    payload: {
      proxy_type: string;
      hostname?: string | null;
      port?: number | null;
      username?: string | null;
      password?: string | null;
      secret?: string | null;
      enabled?: boolean;
    }
  ) =>
    request<{ ok: boolean; proxy?: Record<string, unknown> | null }>(
      `/sessions/${encodeURIComponent(name)}/proxy`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),
  deleteSessionProxy: (name: string) =>
    request<{ ok: boolean }>(`/sessions/${encodeURIComponent(name)}/proxy`, {
      method: "DELETE",
    }),
  renameSession: (payload: { old_name: string; new_name: string }) =>
    request<{ renamed: boolean; old_name: string; new_name: string }>("/sessions/rename", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteSession: (name: string) =>
    request<{ deleted: boolean }>(`/sessions/${encodeURIComponent(name)}`,
      {
        method: "DELETE",
      }
    ),
  importSessions: (payload: { source_dir: string }) =>
    request<{ imported: number }>("/sessions/import", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  presets: (kind?: string) =>
    request<{ presets: Array<{
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
    }> }>(kind ? `/presets?kind=${encodeURIComponent(kind)}` : "/presets"),
  savePreset: (payload: {
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
  }) =>
    request<{ ok: boolean; preset: Record<string, unknown> }>("/presets", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deletePreset: (name: string) =>
    request<{ ok: boolean }>(`/presets/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  aiSettings: () =>
    request<{
      profiles: Array<{
        id: string;
        label?: string | null;
        provider: string;
        has_key: boolean;
        model?: string | null;
      }>;
      default_id?: string | null;
    }>("/settings/ai"),
  saveAiSettings: (payload: {
    profiles: Array<{
      id?: string;
      label?: string | null;
      provider: string;
      api_key?: string | null;
      model?: string | null;
    }>;
    default_id?: string | null;
  }) =>
    request<{ ok: boolean; profiles: Array<Record<string, unknown>>; default_id?: string | null }>("/settings/ai", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  workflows: () =>
    request<{ workflows: Array<Record<string, unknown>> }>("/workflows"),
  saveWorkflow: (payload: Record<string, unknown>) =>
    request<{ ok: boolean; workflow: Record<string, unknown> }>("/workflows", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteWorkflow: (workflowId: string) =>
    request<{ ok: boolean }>(`/workflows/${encodeURIComponent(workflowId)}`, {
      method: "DELETE",
    }),
  startWorkflow: (workflowId: string) =>
    request<{ ok: boolean; workflow: Record<string, unknown> }>(`/workflows/${encodeURIComponent(workflowId)}/start`, {
      method: "POST",
    }),
  stopWorkflow: (workflowId: string) =>
    request<{ ok: boolean; workflow: Record<string, unknown> }>(`/workflows/${encodeURIComponent(workflowId)}/stop`, {
      method: "POST",
    }),
  jobs: () => request<{ jobs: Array<Record<string, unknown>> }>("/jobs"),
  job: (jobId: string) => request<Record<string, unknown>>(`/jobs/${jobId}`),
  stopJob: (jobId: string) =>
    request<{ stopped: boolean }>(`/jobs/${jobId}/stop`, {
      method: "POST",
    }),
  actionsLog: (lines = 120, jobId?: string) =>
    request<{ path: string | null; lines: string[] }>(
      `/logs/actions?lines=${lines}${jobId ? `&job_id=${encodeURIComponent(jobId)}` : ""}`
    ),
  auditLog: (lines = 120, jobId?: string) =>
    request<{ path: string | null; lines: string[] }>(
      `/logs/audit?lines=${lines}${jobId ? `&job_id=${encodeURIComponent(jobId)}` : ""}`
    ),
  mergeCsv: (payload: { input_files: string[]; output_file: string }) =>
    request<{ output_file: string; total_rows: number; unique_users: number }>("/tools/merge-csv", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startDm: (payload: {
    session: string;
    input_file: string;
    message: string;
    use_spintax?: boolean;
    spintax_ai?: boolean;
    spintax_variations?: number;
    ai_profile_id?: string;
    media_path?: string;
    preset_name?: string;
    speed_profile?: string;
    safe_mode?: boolean;
    batch_size?: number;
    batch_delay?: number;
    message_delay?: number;
    rate_policy?: { mode: string; max_wait_seconds?: number; retry_file?: string };
    safety_limits?: { max_flood_waits?: number; max_consecutive_errors?: number; max_total_errors?: number };
    targeting?: {
      exclude_bots?: boolean;
      exclude_deleted?: boolean;
      last_seen_days?: number | null;
      whitelist_path?: string;
      blacklist_path?: string;
      max_users?: number;
    };
  }) =>
    request<{ job_id: string }>("/campaigns/dm", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startInviteDm: (payload: {
    session: string;
    input_file: string;
    invite_url: string;
    message?: string;
    use_spintax?: boolean;
    spintax_ai?: boolean;
    spintax_variations?: number;
    ai_profile_id?: string;
    media_path?: string;
    preset_name?: string;
    speed_profile?: string;
    safe_mode?: boolean;
    batch_size?: number;
    batch_delay?: number;
    message_delay?: number;
    rate_policy?: { mode: string; max_wait_seconds?: number; retry_file?: string };
    safety_limits?: { max_flood_waits?: number; max_consecutive_errors?: number; max_total_errors?: number };
    targeting?: {
      exclude_bots?: boolean;
      exclude_deleted?: boolean;
      last_seen_days?: number | null;
      whitelist_path?: string;
      blacklist_path?: string;
      max_users?: number;
    };
  }) =>
    request<{ job_id: string }>("/campaigns/invite-dm", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startBulkAdd: (payload: {
    session: string;
    input_file: string;
    target_ref: string;
    preset_name?: string;
    speed_profile?: string;
    safe_mode?: boolean;
    batch_size?: number;
    batch_delay?: number;
    message_delay?: number;
    rate_policy?: { mode: string; max_wait_seconds?: number; retry_file?: string };
    safety_limits?: { max_flood_waits?: number; max_consecutive_errors?: number; max_total_errors?: number };
    targeting?: {
      exclude_bots?: boolean;
      exclude_deleted?: boolean;
      last_seen_days?: number | null;
      whitelist_path?: string;
      blacklist_path?: string;
      max_users?: number;
    };
  }) =>
    request<{ job_id: string }>("/campaigns/bulk-add", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startForward: (payload: {
    session: string;
    input_file: string;
    source_peer?: string;
    message_id?: number | null;
    message_link?: string;
    drop_author?: boolean;
    has_media?: boolean;
    preset_name?: string;
    speed_profile?: string;
    safe_mode?: boolean;
    batch_size?: number;
    batch_delay?: number;
    message_delay?: number;
    rate_policy?: { mode: string; max_wait_seconds?: number; retry_file?: string };
    safety_limits?: { max_flood_waits?: number; max_consecutive_errors?: number; max_total_errors?: number };
    targeting?: {
      exclude_bots?: boolean;
      exclude_deleted?: boolean;
      last_seen_days?: number | null;
      whitelist_path?: string;
      blacklist_path?: string;
      max_users?: number;
    };
  }) =>
    request<{ job_id: string }>("/campaigns/forward", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startProfile: (payload: {
    session: string;
    profile: {
      first_name?: string | null;
      last_name?: string | null;
      bio?: string | null;
      photo?: string | null;
    };
  }) =>
    request<{ job_id: string }>("/campaigns/profile", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startWarmup: (payload: {
    session: string;
    targets?: string[];
    message?: string;
    preset_name?: string;
    total_messages?: number;
    min_delay?: number;
    max_delay?: number;
    max_wait_seconds?: number;
    warmup_mode?: string;
    context_messages?: number;
    ai_profile_id?: string;
  }) =>
    request<{ job_id: string }>("/campaigns/warmup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startMultiDm: (payload: {
    sessions: string[];
    input_file: string;
    message: string;
    use_spintax?: boolean;
    spintax_ai?: boolean;
    spintax_variations?: number;
    ai_profile_id?: string;
    media_path?: string;
    preset_name?: string;
    speed_profile?: string;
    safe_mode?: boolean;
    batch_size?: number;
    batch_delay?: number;
    message_delay?: number;
    rate_policy?: { mode: string; max_wait_seconds?: number; retry_file?: string };
    safety_limits?: { max_flood_waits?: number; max_consecutive_errors?: number; max_total_errors?: number };
    targeting?: {
      exclude_bots?: boolean;
      exclude_deleted?: boolean;
      last_seen_days?: number | null;
      whitelist_path?: string;
      blacklist_path?: string;
      max_users?: number;
    };
  }) =>
    request<{ job_id: string }>("/campaigns/multi/dm", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startMultiInviteDm: (payload: {
    sessions: string[];
    input_file: string;
    invite_url: string;
    message?: string;
    use_spintax?: boolean;
    spintax_ai?: boolean;
    spintax_variations?: number;
    ai_profile_id?: string;
    media_path?: string;
    preset_name?: string;
    speed_profile?: string;
    safe_mode?: boolean;
    batch_size?: number;
    batch_delay?: number;
    message_delay?: number;
    rate_policy?: { mode: string; max_wait_seconds?: number; retry_file?: string };
    safety_limits?: { max_flood_waits?: number; max_consecutive_errors?: number; max_total_errors?: number };
    targeting?: {
      exclude_bots?: boolean;
      exclude_deleted?: boolean;
      last_seen_days?: number | null;
      whitelist_path?: string;
      blacklist_path?: string;
      max_users?: number;
    };
  }) =>
    request<{ job_id: string }>("/campaigns/multi/invite-dm", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startMultiBulkAdd: (payload: {
    sessions: string[];
    input_file: string;
    target_ref: string;
    preset_name?: string;
    speed_profile?: string;
    safe_mode?: boolean;
    batch_size?: number;
    batch_delay?: number;
    message_delay?: number;
    rate_policy?: { mode: string; max_wait_seconds?: number; retry_file?: string };
    safety_limits?: { max_flood_waits?: number; max_consecutive_errors?: number; max_total_errors?: number };
    targeting?: {
      exclude_bots?: boolean;
      exclude_deleted?: boolean;
      last_seen_days?: number | null;
      whitelist_path?: string;
      blacklist_path?: string;
      max_users?: number;
    };
  }) =>
    request<{ job_id: string }>("/campaigns/multi/bulk-add", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startMultiForward: (payload: {
    sessions: string[];
    input_file: string;
    source_peer?: string;
    message_id?: number | null;
    message_link?: string;
    drop_author?: boolean;
    has_media?: boolean;
    preset_name?: string;
    speed_profile?: string;
    safe_mode?: boolean;
    batch_size?: number;
    batch_delay?: number;
    message_delay?: number;
    rate_policy?: { mode: string; max_wait_seconds?: number; retry_file?: string };
    safety_limits?: { max_flood_waits?: number; max_consecutive_errors?: number; max_total_errors?: number };
    targeting?: {
      exclude_bots?: boolean;
      exclude_deleted?: boolean;
      last_seen_days?: number | null;
      whitelist_path?: string;
      blacklist_path?: string;
      max_users?: number;
    };
  }) =>
    request<{ job_id: string }>("/campaigns/multi/forward", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startMultiWarmup: (payload: {
    sessions: string[];
    targets?: string[];
    message?: string;
    preset_name?: string;
    total_messages?: number;
    min_delay?: number;
    max_delay?: number;
    max_wait_seconds?: number;
    warmup_mode?: string;
    context_messages?: number;
    ai_profile_id?: string;
  }) =>
    request<{ job_id: string }>("/campaigns/multi/warmup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startMultiProfile: (payload: {
    sessions: string[];
    profile_map: Record<
      string,
      {
        first_name?: string | null;
        last_name?: string | null;
        bio?: string | null;
        photo?: string | null;
      }
    >;
    delay_seconds?: number;
  }) =>
    request<{ job_id: string }>("/campaigns/multi/profile", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export { API_BASE };

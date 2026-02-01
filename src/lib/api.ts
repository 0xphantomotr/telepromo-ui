type ApiResponse<T> = T & { error?: string };

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

async function request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
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
  jobs: () => request<{ jobs: Array<Record<string, unknown>> }>("/jobs"),
  job: (jobId: string) => request<Record<string, unknown>>(`/jobs/${jobId}`),
  stopJob: (jobId: string) =>
    request<{ stopped: boolean }>(`/jobs/${jobId}/stop`, {
      method: "POST",
    }),
  actionsLog: (lines = 120) => request<{ path: string | null; lines: string[] }>(`/logs/actions?lines=${lines}`),
  auditLog: (lines = 120) => request<{ path: string | null; lines: string[] }>(`/logs/audit?lines=${lines}`),
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
    media_path?: string;
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
    media_path?: string;
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
  startMultiDm: (payload: {
    sessions: string[];
    input_file: string;
    message: string;
    use_spintax?: boolean;
    media_path?: string;
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
    media_path?: string;
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

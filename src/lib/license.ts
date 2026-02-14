import { invoke } from "@tauri-apps/api/core";

export const LICENSE_API_BASE = import.meta.env.VITE_LICENSE_API_BASE || "http://127.0.0.1:9000";

type TokenPayload = {
  sub?: string;
  email?: string;
  dev?: string;
  iat?: number;
  exp?: number;
  ver?: number;
};

export const isTauri = () =>
  typeof window !== "undefined" && typeof (window as any).__TAURI_INTERNALS__ !== "undefined";

const b64urlDecode = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(normalized + pad);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
};

export const decodeTokenPayload = (token: string): TokenPayload | null => {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  try {
    const jsonBytes = b64urlDecode(parts[0]);
    const jsonText = new TextDecoder().decode(jsonBytes);
    const parsed = JSON.parse(jsonText) as TokenPayload;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const licensing = {
  async devicePublicKey(): Promise<string | null> {
    if (!isTauri()) {
      return null;
    }
    return (await invoke("licensing_device_public_key")) as string;
  },
  async sign(message: string): Promise<string | null> {
    if (!isTauri()) {
      return null;
    }
    return (await invoke("licensing_sign", { message })) as string;
  },
  async getToken(): Promise<string | null> {
    if (!isTauri()) {
      return null;
    }
    const token = (await invoke("licensing_get_token")) as string | null;
    return token || null;
  },
  async setToken(token: string): Promise<boolean> {
    if (!isTauri()) {
      return false;
    }
    return (await invoke("licensing_set_token", { token })) as boolean;
  },
  async clearToken(): Promise<boolean> {
    if (!isTauri()) {
      return false;
    }
    return (await invoke("licensing_clear_token")) as boolean;
  },
  async restartLocalBackend(): Promise<boolean> {
    if (!isTauri()) {
      return false;
    }
    return (await invoke("backend_restart")) as boolean;
  },
  async backendStatus(): Promise<{ healthy: boolean; startup_error?: string | null }> {
    if (!isTauri()) {
      return { healthy: true, startup_error: null };
    }
    return (await invoke("backend_status")) as { healthy: boolean; startup_error?: string | null };
  },
};

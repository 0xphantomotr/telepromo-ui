import { useRef, useState } from "react";
import { api } from "../lib/api";

type UploadKind = "csv" | "media" | "photo";

type FilePathFieldProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  kind: UploadKind;
  accept?: string;
  onError?: (message: string | null) => void;
  onNotice?: (message: string) => void;
};

const STORAGE_PATH_BY_KIND: Record<UploadKind, string> = {
  csv: "data/uploads/csv/",
  media: "data/uploads/media/",
  photo: "data/uploads/photo/",
};

export function FilePathField({
  label,
  value,
  onChange,
  kind,
  accept,
  onError,
  onNotice,
}: FilePathFieldProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  const importFile = async (file: File) => {
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      const result = await api.uploadFile(kind, file);
      onChange(result.relative_path);
      setSavedPath(result.saved_to);
      setSavedHint(result.telegram_limit_hint);
      onError?.(null);
      onNotice?.(
        `Imported ${file.name} → ${result.relative_path}. Saved locally at ${result.saved_to}. ${result.telegram_limit_hint}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import file";
      onError?.(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={`file-path-field ${dragActive ? "drag-active" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
          importFile(file);
        }
      }}
    >
      <label>
        {label}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <div className="file-path-actions">
        <button
          type="button"
          className="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Importing..." : "Choose file"}
        </button>
        <span className="hint">or drop file here</span>
      </div>
      <input
        ref={fileInputRef}
        className="file-path-hidden-input"
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            importFile(file);
          }
          e.currentTarget.value = "";
        }}
      />
      <p className="helper-text">
        Imported files are stored locally in <code>{STORAGE_PATH_BY_KIND[kind]}</code>.
      </p>
      {savedPath ? <p className="helper-text">Saved locally at: {savedPath}</p> : null}
      {savedHint ? <p className="helper-text">{savedHint}</p> : null}
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";

type TooltipInfoProps = {
  label?: string;
  wide?: boolean;
  children: ReactNode;
};

export function TooltipInfo({ label = "More info", wide = false, children }: TooltipInfoProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span className={`tooltip-info${wide ? " wide" : ""}${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="tooltip-info-button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        i
      </button>
      <span className="tooltip-info-popover" role="tooltip">
        {children}
      </span>
    </span>
  );
}

type SectionCardProps = {
  title: string;
  description?: ReactNode;
  titleHelp?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
  dense?: boolean;
};

export function SectionCard({
  title,
  description,
  titleHelp,
  status,
  children,
  dense = false,
}: SectionCardProps) {
  return (
    <div className={`section-card${dense ? " dense" : ""}`}>
      <div className="section-card-header">
        <div className="section-card-heading">
          <div className="section-card-title-row">
            <h4>{title}</h4>
            {titleHelp}
          </div>
          {description ? <p className="section-card-description">{description}</p> : null}
        </div>
        {status ? <div className="section-card-status">{status}</div> : null}
      </div>
      <div className="section-card-body">{children}</div>
    </div>
  );
}

type StatusBadgeProps = {
  tone?: "neutral" | "ok" | "warn" | "danger";
  children: ReactNode;
};

export function StatusBadge({ tone = "neutral", children }: StatusBadgeProps) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

export type ReadinessItem = {
  label: string;
  ready: boolean;
  detail?: string;
};

type ReadinessChecklistProps = {
  title?: string;
  description?: ReactNode;
  items: ReadinessItem[];
};

export function ReadinessChecklist({
  title = "Readiness",
  description,
  items,
}: ReadinessChecklistProps) {
  const readyCount = items.filter((item) => item.ready).length;

  return (
    <div className="readiness-card">
      <div className="readiness-card-header">
        <div>
          <h4>{title}</h4>
          {description ? <p className="section-card-description">{description}</p> : null}
        </div>
        <StatusBadge tone={readyCount === items.length ? "ok" : "warn"}>
          {readyCount}/{items.length} ready
        </StatusBadge>
      </div>
      <div className="readiness-list">
        {items.map((item) => (
          <div key={item.label} className={`readiness-item${item.ready ? " ready" : " missing"}`}>
            <span className="readiness-dot" aria-hidden="true" />
            <div>
              <div className="readiness-label">{item.label}</div>
              {item.detail ? <div className="readiness-detail">{item.detail}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

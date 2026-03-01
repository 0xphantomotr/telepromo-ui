import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TooltipInfoProps = {
  label?: string;
  wide?: boolean;
  children: ReactNode;
};

export function TooltipInfo({ label = "More info", wide = false, children }: TooltipInfoProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLSpanElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const width = wide ? 320 : 260;
    const margin = 16;

    const updatePosition = () => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const popoverHeight = popoverRef.current?.offsetHeight ?? 120;

      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - width / 2, margin),
        viewportWidth - width - margin
      );

      const spaceBelow = viewportHeight - rect.bottom - margin;
      const placeAbove = spaceBelow < popoverHeight + 12 && rect.top > popoverHeight + 20;
      const top = placeAbove ? rect.top - popoverHeight - 10 : rect.bottom + 10;

      setPopoverStyle({
        position: "fixed",
        top,
        left,
        width,
        zIndex: 1000,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, wide]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const inTrigger = rootRef.current?.contains(target);
      const inPopover = popoverRef.current?.contains(target);
      if (!inTrigger && !inPopover) {
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
    <span
      className={`tooltip-info${wide ? " wide" : ""}${open ? " open" : ""}`}
      ref={rootRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
    >
      <button
        type="button"
        className="tooltip-info-button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        i
      </button>
      {open
        ? createPortal(
            <span
              ref={popoverRef}
              className={`tooltip-portal-popover${wide ? " wide" : ""}`}
              style={popoverStyle}
              role="tooltip"
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
            >
              {children}
            </span>,
            document.body
          )
        : null}
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
  const [expanded, setExpanded] = useState(false);
  const readyCount = items.filter((item) => item.ready).length;
  const missingItems = items.filter((item) => !item.ready);
  const allReady = readyCount === items.length;
  const summaryText = allReady
    ? "Everything required for this step is set."
    : `${missingItems.length} item${missingItems.length === 1 ? "" : "s"} still need attention.`;

  return (
    <div className="readiness-card">
      <div className="readiness-card-header">
        <div className="readiness-card-copy">
          <h4>{title}</h4>
          {description ? <p className="section-card-description">{description}</p> : null}
        </div>
        <StatusBadge tone={readyCount === items.length ? "ok" : "warn"}>
          {readyCount}/{items.length} ready
        </StatusBadge>
      </div>
      <div className="readiness-summary-row">
        <div className={`readiness-summary${allReady ? " all-ready" : ""}`}>{summaryText}</div>
        {items.length > 1 ? (
          <button
            type="button"
            className="ghost readiness-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? "Hide details" : "Details"}
          </button>
        ) : null}
      </div>
      {!allReady ? (
        <div className="readiness-chip-row">
          {missingItems.map((item) => (
            <span
              key={item.label}
              className="readiness-chip"
              title={item.detail || item.label}
            >
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
      {expanded ? (
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
      ) : null}
    </div>
  );
}

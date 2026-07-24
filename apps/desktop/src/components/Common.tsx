import type { ReactNode } from "react";

import { Icon } from "./Icon.js";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {actions === undefined ? null : <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function StatusPill({
  state,
  children,
}: {
  state: "ready" | "fresh" | "success" | "stale" | "warning" | "failed" | "neutral";
  children: ReactNode;
}) {
  return <span className={`status-pill status-${state}`}>{children}</span>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-orbit" aria-hidden="true">
        <i />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function LoadingBlock({ label = "Loading companion data" }: { label?: string }) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function InlineAlert({
  tone,
  children,
}: {
  tone: "info" | "success" | "error" | "warning";
  children: ReactNode;
}) {
  return (
    <div className={`inline-alert alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={tone === "error" || tone === "warning" ? "warning" : "check"} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  accent = "mint",
}: {
  label: string;
  value: ReactNode;
  detail: string;
  accent?: "mint" | "gold" | "blue" | "rose";
}) {
  return (
    <article className={`metric-card metric-${accent}`}>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

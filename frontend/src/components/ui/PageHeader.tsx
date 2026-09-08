import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Rendered above the title — breadcrumbs, back links, status. */
  eyebrow?: ReactNode;
}

export function PageHeader({ title, description, actions, eyebrow }: Props) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <div className="row" style={{ marginBottom: 8 }}>{eyebrow}</div> : null}
        <h2 className="page-header__title">{title}</h2>
        {description ? <p className="page-header__desc">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

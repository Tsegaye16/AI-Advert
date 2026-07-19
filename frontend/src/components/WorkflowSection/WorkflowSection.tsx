import { Typography } from "antd";
import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function WorkflowSection({
  title,
  subtitle,
  badge,
  children,
  className = "",
}: Props) {
  return (
    <section className={`workflow-section ${className}`.trim()}>
      <div className="workflow-section__head">
        <div>
          <Typography.Title level={5} className="workflow-section__title">
            {title}
          </Typography.Title>
          {subtitle ? (
            <Typography.Text type="secondary" className="workflow-section__sub">
              {subtitle}
            </Typography.Text>
          ) : null}
        </div>
        {badge ? <div className="workflow-section__badge">{badge}</div> : null}
      </div>
      <div className="workflow-section__body">{children}</div>
    </section>
  );
}

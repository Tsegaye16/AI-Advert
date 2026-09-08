import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Button, Typography } from "antd";
import { ReloadOutlined, WarningOutlined } from "@ant-design/icons";

interface Props {
  children: ReactNode;
  /** Rendered instead of the default fallback when provided. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="empty-state" role="alert">
        <div className="empty-state__icon">
          <WarningOutlined />
        </div>
        <h2 className="empty-state__title">Something went wrong</h2>
        <p className="empty-state__desc">
          The interface hit an unexpected error. Your data is safe — reloading
          the view usually clears it.
        </p>
        <Typography.Text className="mono subtle" style={{ maxWidth: "60ch" }}>
          {error.message}
        </Typography.Text>
        <div className="row">
          <Button icon={<ReloadOutlined />} onClick={this.reset}>
            Try again
          </Button>
          <Button type="primary" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    );
  }
}

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Modal,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { getProvenance, verifyAsset } from "../../services/api";
import type { Asset, Provenance, VerifyResult } from "../../types";

interface Props {
  asset: Asset | null;
  open: boolean;
  onClose: () => void;
}

function BoolBadge({
  ok,
  label,
}: {
  ok: boolean | null | undefined;
  label: string;
}) {
  if (ok === null || ok === undefined) {
    return <Tag>{label}: n/a</Tag>;
  }
  return (
    <Tag
      icon={ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
      color={ok ? "success" : "error"}
    >
      {label}: {ok ? "ok" : "fail"}
    </Tag>
  );
}

export function ProvenanceViewer({ asset, open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [provenance, setProvenance] = useState<Provenance | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);

  useEffect(() => {
    if (!open || !asset) return;
    let cancelled = false;
    setLoading(true);
    setVerify(null);
    void (async () => {
      try {
        const data = await getProvenance(asset.id);
        if (!cancelled) setProvenance(data);
      } catch (err) {
        if (!cancelled) {
          message.error(
            err instanceof Error ? err.message : "Failed to load provenance",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset, open]);

  const onVerify = async () => {
    if (!asset) return;
    setVerifying(true);
    try {
      const result = await verifyAsset(asset.id);
      setVerify(result);
      if (result.verified) message.success("Asset verified");
      else message.warning("Verification did not pass");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Verify failed");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <SafetyCertificateOutlined />
          Provenance record
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={760}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        <Button
          key="verify"
          type="primary"
          loading={verifying}
          onClick={() => void onVerify()}
        >
          Verify integrity
        </Button>,
      ]}
    >
      {loading || !provenance ? (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <Spin />
        </div>
      ) : (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {verify && (
            <Card size="small" className="verify-result-card">
              <Alert
                type={verify.verified ? "success" : "error"}
                showIcon
                message={
                  verify.verified
                    ? "Verified — manifest and asset integrity check passed"
                    : "Not verified"
                }
                description={verify.detail}
                style={{ marginBottom: 12 }}
              />
              <Space wrap>
                <BoolBadge ok={verify.manifest_ok} label="manifest_ok" />
                <BoolBadge ok={verify.byte_match} label="byte_match" />
              </Space>
              <Descriptions
                size="small"
                column={1}
                style={{ marginTop: 12 }}
                bordered
              >
                <Descriptions.Item label="Expected SHA-256">
                  <Typography.Text className="mono" copyable={!!verify.expected_sha256}>
                    {verify.expected_sha256 || "—"}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="Actual SHA-256">
                  <Typography.Text className="mono" copyable={!!verify.actual_sha256}>
                    {verify.actual_sha256 || "—"}
                  </Typography.Text>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}

          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Asset">
              {asset?.step_name} · {asset?.kind}
            </Descriptions.Item>
            <Descriptions.Item label="Run">{provenance.run_id}</Descriptions.Item>
            <Descriptions.Item label="Canonical hash">
              <Typography.Text className="mono" copyable>
                {provenance.canonical_hash || "—"}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Manifest key">
              <Typography.Text className="mono">
                {provenance.manifest_b2_key || "—"}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Parent run">
              {provenance.parent_run_id || "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Providers">
              {provenance.providers.map((p) => (
                <Tag key={p}>{p}</Tag>
              ))}
            </Descriptions.Item>
            <Descriptions.Item label="Models">
              {provenance.models.map((m) => (
                <Tag key={m} color="geekblue">
                  {m}
                </Tag>
              ))}
            </Descriptions.Item>
          </Descriptions>

          <div>
            <Typography.Title level={5}>Pipeline steps</Typography.Title>
            <Timeline
              items={(provenance.steps || []).map((step) => ({
                color:
                  step.status === "succeeded"
                    ? "green"
                    : step.status === "failed"
                      ? "red"
                      : "blue",
                children: (
                  <div>
                    <strong>{step.name}</strong>{" "}
                    <span className="muted">
                      {step.provider}/{step.model}
                    </span>
                    {step.fallback_used ? (
                      <Tag color="orange" style={{ marginLeft: 8 }}>
                        fallback used
                      </Tag>
                    ) : null}
                  </div>
                ),
              }))}
            />
          </div>

          <Collapse
            items={[
              {
                key: "manifest",
                label: "Raw manifest JSON",
                children: (
                  <pre className="manifest-json">
                    {JSON.stringify(provenance.manifest ?? {}, null, 2)}
                  </pre>
                ),
              },
            ]}
          />
        </Space>
      )}
    </Modal>
  );
}

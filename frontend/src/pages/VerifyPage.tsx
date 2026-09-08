import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, App, Button, Descriptions, Input, Tag, Typography } from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { getAsset, verifyAsset } from "../services/api";
import type { Asset, VerifyResult } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { PageMeta } from "../components/PageMeta/PageMeta";
import { CopyableHash } from "../components/ui/CopyableHash";
import { downloadJson } from "../utils/assetFiles";

export default function VerifyPage() {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [input, setInput] = useState(assetId || "");
  const [asset, setAsset] = useState<Asset | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (id: string) => {
    const target = id.trim();
    if (!target) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const [fetched, outcome] = await Promise.all([
        getAsset(target).catch(() => null),
        verifyAsset(target),
      ]);
      setAsset(fetched);
      setResult(outcome);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (assetId) void run(assetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  const submit = () => {
    const target = input.trim();
    if (!target) {
      message.warning("Paste an asset ID to verify");
      return;
    }
    navigate(`/verify/${target}`);
  };

  const pass = result?.verified;

  return (
    <>
      <PageMeta title="Verify" />
      <PageHeader
        title="Verify an asset"
        description="Paste any AdVault asset ID. We fetch the object from storage, recompute its SHA-256, and check it against the signed manifest recorded when it was created."
      />

      <section className="surface surface--padded">
        <div className="row" style={{ gap: "var(--space-3)" }}>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={submit}
            placeholder="e.g. 3f9c2a17-8b5e-4c21-9f0d-1a2b3c4d5e6f"
            aria-label="Asset ID"
            allowClear
          />
          <Button
            type="primary"
            icon={<SafetyCertificateOutlined />}
            loading={busy}
            onClick={submit}
          >
            Verify
          </Button>
        </div>
      </section>

      {error ? (
        <Alert type="error" showIcon title="Could not verify" description={error} />
      ) : null}

      {result ? (
        <>
          <div
            className={`verify-banner ${pass ? "verify-banner--pass" : "verify-banner--fail"}`}
          >
            {pass ? (
              <CheckCircleFilled style={{ color: "var(--success)", fontSize: 24 }} />
            ) : (
              <CloseCircleFilled style={{ color: "var(--danger)", fontSize: 24 }} />
            )}
            <div className="grow">
              <Typography.Title level={4} style={{ margin: 0 }}>
                {pass ? "This asset is authentic" : "This asset did not verify"}
              </Typography.Title>
              <div className="muted">{result.detail}</div>
              <div className="row row--wrap" style={{ marginTop: 8, gap: 6 }}>
                <Tag color={result.manifest_ok ? "success" : "error"}>
                  manifest {result.manifest_ok ? "valid" : "invalid"}
                </Tag>
                <Tag
                  color={
                    result.byte_match === null
                      ? "default"
                      : result.byte_match
                        ? "success"
                        : "error"
                  }
                >
                  bytes{" "}
                  {result.byte_match === null
                    ? "not checked"
                    : result.byte_match
                      ? "match"
                      : "differ"}
                </Tag>
              </div>
            </div>
            <Button
              onClick={() =>
                downloadJson(
                  { verified_at: new Date().toISOString(), asset, result },
                  `advault-verification-${result.asset_id.slice(0, 8)}.json`,
                )
              }
            >
              Export result
            </Button>
          </div>

          <section className="surface surface--padded">
            <Descriptions
              bordered
              size="small"
              column={1}
              items={[
                { key: "id", label: "Asset ID", children: <CopyableHash value={result.asset_id} head={36} tail={8} /> },
                {
                  key: "canonical",
                  label: "Manifest canonical hash",
                  children: <CopyableHash value={result.canonical_hash} head={32} tail={16} />,
                },
                {
                  key: "expected",
                  label: "Expected SHA-256",
                  children: <CopyableHash value={result.expected_sha256} head={32} tail={16} />,
                },
                {
                  key: "actual",
                  label: "Recomputed SHA-256",
                  children: <CopyableHash value={result.actual_sha256} head={32} tail={16} />,
                },
                ...(asset
                  ? [
                      {
                        key: "kind",
                        label: "Asset",
                        children: `${asset.kind} — ${asset.step_name} (${asset.provider || "unknown"} · ${asset.model || "—"})`,
                      },
                    ]
                  : []),
              ]}
            />
          </section>
        </>
      ) : null}
    </>
  );
}

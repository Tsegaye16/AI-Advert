import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  App,
  Alert,
  Button,
  Collapse,
  Descriptions,
  Skeleton,
  Tag,
  Typography,
} from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  DownloadOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { getProvenance, verifyAsset } from "../../services/api";
import type { Asset, Provenance, VerifyResult } from "../../types";
import { CopyableHash } from "../ui/CopyableHash";
import { downloadJson } from "../../utils/assetFiles";

function VerifyBanner({ result }: { result: VerifyResult }) {
  const pass = result.verified;
  return (
    <div className={`verify-banner ${pass ? "verify-banner--pass" : "verify-banner--fail"}`}>
      {pass ? (
        <CheckCircleFilled style={{ color: "var(--success)", fontSize: 20 }} />
      ) : (
        <CloseCircleFilled style={{ color: "var(--danger)", fontSize: 20 }} />
      )}
      <div className="grow">
        <Typography.Text strong>
          {pass ? "Integrity verified" : "Verification failed"}
        </Typography.Text>
        <div className="muted" style={{ fontSize: "var(--text-sm)" }}>
          {result.detail}
        </div>
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
    </div>
  );
}

export function ProvenancePanel({ asset }: { asset: Asset }) {
  const { message } = App.useApp();
  const [provenance, setProvenance] = useState<Provenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setResult(null);
    void getProvenance(asset.id)
      .then((data) => alive && setProvenance(data))
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [asset.id]);

  const verify = async () => {
    setVerifying(true);
    try {
      const outcome = await verifyAsset(asset.id);
      setResult(outcome);
      if (outcome.verified) message.success("Integrity verified");
      else message.warning("Verification did not pass");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const exportCertificate = () => {
    downloadJson(
      {
        generated_at: new Date().toISOString(),
        asset: {
          id: asset.id,
          kind: asset.kind,
          step: asset.step_name,
          mime: asset.mime,
          sha256: asset.sha256,
          b2_key: asset.b2_key,
          created_at: asset.created_at,
        },
        run_id: provenance?.run_id,
        parent_run_id: provenance?.parent_run_id,
        canonical_hash: provenance?.canonical_hash,
        manifest_b2_key: provenance?.manifest_b2_key,
        providers: provenance?.providers,
        models: provenance?.models,
        steps: provenance?.steps,
        verification: result,
        manifest: provenance?.manifest,
      },
      `advault-provenance-${asset.id.slice(0, 8)}.json`,
    );
  };

  if (loading) return <Skeleton active paragraph={{ rows: 5 }} />;

  if (error) {
    return (
      <Alert type="error" showIcon title="Could not load provenance" description={error} />
    );
  }

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <h3 className="section-head__title">Provenance</h3>
          <span className="section-head__sub">
            Verification downloads the object from storage, recomputes its SHA-256, and
            checks it against the signed manifest.
          </span>
        </div>
        <div className="row">
          <Button icon={<DownloadOutlined />} onClick={exportCertificate}>
            Export record
          </Button>
          <Button
            type="primary"
            icon={<SafetyCertificateOutlined />}
            loading={verifying}
            onClick={() => void verify()}
          >
            Verify integrity
          </Button>
        </div>
      </div>

      {result ? <VerifyBanner result={result} /> : null}

      <Descriptions
        bordered
        size="small"
        column={{ xs: 1, md: 2 }}
        items={[
          {
            key: "run",
            label: "Run",
            children: (
              <Link to={`/runs/${provenance?.run_id}`} className="mono">
                {provenance?.run_id?.slice(0, 12)}
              </Link>
            ),
          },
          {
            key: "parent",
            label: "Parent run",
            children: provenance?.parent_run_id ? (
              <Link to={`/runs/${provenance.parent_run_id}`} className="mono">
                {provenance.parent_run_id.slice(0, 12)}
              </Link>
            ) : (
              <span className="subtle">Original — not a remix</span>
            ),
          },
          {
            key: "hash",
            label: "Canonical hash",
            children: <CopyableHash value={provenance?.canonical_hash} label="canonical hash" />,
          },
          {
            key: "sha",
            label: "Asset SHA-256",
            children: <CopyableHash value={asset.sha256} label="asset hash" />,
          },
          {
            key: "manifest",
            label: "Manifest key",
            span: 2,
            children: <CopyableHash value={provenance?.manifest_b2_key} head={40} tail={14} label="manifest key" />,
          },
          {
            key: "providers",
            label: "Providers",
            children: provenance?.providers?.length ? (
              <span className="row row--wrap" style={{ gap: 4 }}>
                {provenance.providers.map((p) => (
                  <Tag key={p}>{p}</Tag>
                ))}
              </span>
            ) : (
              <span className="subtle">—</span>
            ),
          },
          {
            key: "models",
            label: "Models",
            children: provenance?.models?.length ? (
              <span className="row row--wrap" style={{ gap: 4 }}>
                {provenance.models.map((m) => (
                  <Tag key={m} color="blue">
                    {m}
                  </Tag>
                ))}
              </span>
            ) : (
              <span className="subtle">—</span>
            ),
          },
        ]}
      />

      {result ? (
        <Descriptions
          bordered
          size="small"
          column={1}
          items={[
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
          ]}
        />
      ) : null}

      {provenance?.manifest ? (
        <Collapse
          items={[
            {
              key: "manifest",
              label: "Raw manifest",
              children: (
                <pre className="code-block">
                  {JSON.stringify(provenance.manifest, null, 2)}
                </pre>
              ),
            },
          ]}
        />
      ) : null}
    </div>
  );
}

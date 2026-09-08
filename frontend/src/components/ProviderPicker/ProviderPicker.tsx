import { useEffect, useMemo, useState } from "react";
import { Col, Form, Row, Select, Typography } from "antd";
import { getProvidersStatus } from "../../services/api";
import type { ProviderSelectionValues } from "../../utils/providerSelection";

type MatrixEntry = {
  vendor: string;
  default_model: string;
  suggested_models: string[];
  key_available: boolean;
};

type ProviderMatrix = {
  image?: MatrixEntry[];
  video?: MatrixEntry[];
  tts?: MatrixEntry[];
  music?: MatrixEntry[];
};

interface Props {
  mode: "quick" | "full";
}

function modelOptions(entry: MatrixEntry | undefined) {
  if (!entry) return [];
  const models = [
    entry.default_model,
    ...(entry.suggested_models || []),
  ].filter(Boolean);
  return [...new Set(models)].map((m) => ({ value: m, label: m }));
}

function SlotPicker({
  label,
  slot,
  matrix,
  vendorField,
  modelField,
}: {
  label: string;
  slot: keyof ProviderMatrix;
  matrix: ProviderMatrix;
  vendorField: keyof ProviderSelectionValues;
  modelField: keyof ProviderSelectionValues;
}) {
  const entries = matrix[slot] || [];
  const vendorOptions = entries.map((e) => ({
    value: e.vendor,
    label: `${e.vendor}${e.key_available ? "" : " (no key)"}`,
    disabled: !e.key_available,
  }));

  return (
    <>
      <Col xs={24} md={6}>
        <Form.Item label={`${label} vendor`} name={vendorField}>
          <Select
            allowClear
            placeholder="Auto"
            options={vendorOptions}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={6}>
        <Form.Item
          noStyle
          shouldUpdate={(prev, cur) => prev[vendorField] !== cur[vendorField]}
        >
          {({ getFieldValue }) => {
            const vendor = getFieldValue(vendorField) as string | undefined;
            const entry = entries.find((e) => e.vendor === vendor);
            const options = modelOptions(entry);
            return (
              <Form.Item label={`${label} model`} name={modelField}>
                <Select
                  allowClear
                  placeholder={vendor ? "Model" : "Pick vendor first"}
                  disabled={!vendor}
                  options={options}
                />
              </Form.Item>
            );
          }}
        </Form.Item>
      </Col>
    </>
  );
}

export function ProviderPicker({ mode }: Props) {
  const [matrix, setMatrix] = useState<ProviderMatrix>({});

  useEffect(() => {
    void getProvidersStatus().then((data) => {
      setMatrix((data as { matrix?: ProviderMatrix }).matrix || {});
    });
  }, []);

  const showVideo = mode === "full";
  const showTts = mode === "full";
  const showMusic = mode === "full";

  const hasMatrix = useMemo(
    () => Object.keys(matrix).length > 0,
    [matrix],
  );

  if (!hasMatrix) return null;

  return (
    <div className="stack stack--sm">
      <Typography.Text type="secondary">
        Leave blank to use free-first auto-selection. AdVault falls back to the next
        vendor automatically if a provider errors or times out.
      </Typography.Text>
      <Row gutter={16} style={{ marginTop: 8 }}>
        <SlotPicker
          label="Image"
          slot="image"
          matrix={matrix}
          vendorField="image_vendor"
          modelField="image_model"
        />
        {showVideo ? (
          <SlotPicker
            label="Video"
            slot="video"
            matrix={matrix}
            vendorField="video_vendor"
            modelField="video_model"
          />
        ) : null}
        {showTts ? (
          <SlotPicker
            label="TTS"
            slot="tts"
            matrix={matrix}
            vendorField="tts_vendor"
            modelField="tts_model"
          />
        ) : null}
        {showMusic ? (
          <SlotPicker
            label="Music"
            slot="music"
            matrix={matrix}
            vendorField="music_vendor"
            modelField="music_model"
          />
        ) : null}
      </Row>
    </div>
  );
}

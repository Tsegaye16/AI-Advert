import { useEffect, useMemo, useState } from "react";
import { Col, Form, Row, Select, Typography } from "antd";
import { getProvidersStatus } from "../../services/api";

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

export type ProviderSelectionValues = {
  image_vendor?: string;
  image_model?: string;
  video_vendor?: string;
  video_model?: string;
  tts_vendor?: string;
  tts_model?: string;
  music_vendor?: string;
  music_model?: string;
};

interface Props {
  mode: "quick" | "full";
  value?: ProviderSelectionValues;
  onChange?: (value: ProviderSelectionValues) => void;
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
    <div className="provider-picker-block">
      <Typography.Text type="secondary">
        Provider overrides (optional — defaults use free-first auto selection)
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

export function buildSelectionPayload(
  values: ProviderSelectionValues,
): Record<string, { vendor?: string; model?: string }> | undefined {
  const slots = [
    ["image", "image_vendor", "image_model"],
    ["video", "video_vendor", "video_model"],
    ["tts", "tts_vendor", "tts_model"],
    ["music", "music_vendor", "music_model"],
  ] as const;
  const selection: Record<string, { vendor?: string; model?: string }> = {};
  for (const [slot, vendorKey, modelKey] of slots) {
    const vendor = values[vendorKey] as string | undefined;
    const model = values[modelKey] as string | undefined;
    if (vendor || model) {
      selection[slot] = {
        ...(vendor ? { vendor } : {}),
        ...(model ? { model } : {}),
      };
    }
  }
  return Object.keys(selection).length ? selection : undefined;
}

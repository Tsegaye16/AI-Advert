import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Radio,
  Skeleton,
  Space,
  Steps,
  Switch,
  Tag,
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  PictureOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import { generateCampaign, getCampaign } from "../services/api";
import type { Campaign, RunMode, VideoFormatKey } from "../types";
import { ProviderPicker } from "../components/ProviderPicker/ProviderPicker";
import { FormatPicker } from "../components/FormatPicker/FormatPicker";
import { buildSelectionPayload } from "../utils/providerSelection";
import type { ProviderSelectionValues } from "../utils/providerSelection";
import { PageHeader } from "../components/ui/PageHeader";
import { PageMeta } from "../components/PageMeta/PageMeta";
import { useFormDraft } from "../hooks/useFormDraft";

interface WizardValues extends ProviderSelectionValues {
  mode: RunMode;
  storyboard: boolean;
  scene_count: number;
  video_format: VideoFormatKey;
  prompt_override?: string;
  voiceover_script?: string;
  include_music: boolean;
  music_prompt?: string;
}

const DEFAULTS: WizardValues = {
  mode: "full",
  storyboard: true,
  scene_count: 4,
  video_format: "landscape",
  include_music: false,
};

export default function GeneratePage() {
  const { campaignId = "" } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm<WizardValues>();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const { draft, save: saveDraft, clear: clearDraft } = useFormDraft<WizardValues>(
    `generate:${campaignId}`,
    DEFAULTS,
  );

  const mode = (Form.useWatch("mode", form) ?? draft.mode ?? DEFAULTS.mode) as RunMode;
  const storyboardEnabled = Form.useWatch("storyboard", form) ?? draft.storyboard;
  const includeMusic = Form.useWatch("include_music", form) ?? draft.include_music;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void getCampaign(campaignId)
      .then((c) => alive && setCampaign(c))
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [campaignId]);

  const submit = async () => {
    const values = { ...DEFAULTS, ...draft, ...form.getFieldsValue(true) };
    setSubmitting(true);
    try {
      const run = await generateCampaign(campaignId, {
        mode: values.mode,
        prompt_override: values.prompt_override || undefined,
        voiceover_script: values.voiceover_script || undefined,
        music_prompt: values.include_music ? values.music_prompt || undefined : undefined,
        storyboard: values.mode === "full" ? !!values.storyboard : false,
        scene_count:
          values.mode === "full" && values.storyboard ? values.scene_count || 4 : undefined,
        video_format: values.video_format || "landscape",
        selection: buildSelectionPayload(values),
      });
      clearDraft();
      message.success("Pipeline started");
      navigate(`/runs/${run.id}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not start the run");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageMeta title="New run" />
        <Skeleton active paragraph={{ rows: 6 }} />
      </>
    );
  }

  if (error || !campaign) {
    return (
      <>
        <PageMeta title="New run" />
        <Alert
          type="error"
          showIcon
          title="Campaign unavailable"
          description={error || "That campaign no longer exists."}
          action={
            <Link to="/campaigns">
              <Button size="small">Back to campaigns</Button>
            </Link>
          }
        />
      </>
    );
  }

  const steps = [
    { title: "Format", description: "What to produce" },
    { title: "Creative", description: "Prompt & narration" },
    { title: "Providers", description: "Models & review" },
  ];

  return (
    <>
      <PageMeta title={`Generate — ${campaign.name}`} />
      <PageHeader
        eyebrow={
          <Link to={`/campaigns/${campaign.id}`}>
            <Button type="text" size="small" icon={<ArrowLeftOutlined />}>
              {campaign.name}
            </Button>
          </Link>
        }
        title="New generation run"
        description={`Producing creative for ${campaign.product_name}. The campaign brief, tone, and brand kit are applied automatically.`}
      />

      <section className="surface surface--padded">
        <Steps
          current={step}
          items={steps}
          onChange={setStep}
          style={{ marginBottom: "var(--space-7)" }}
        />

        <Form
          form={form}
          layout="vertical"
          requiredMark="optional"
          initialValues={{ ...DEFAULTS, ...draft }}
          onValuesChange={(_, all) => saveDraft(all)}
        >
          <div hidden={step !== 0} className="stack">
            <Form.Item name="mode" label="Output">
              <Radio.Group style={{ width: "100%" }}>
                <Space orientation="vertical" style={{ width: "100%" }} size={12}>
                  <Card size="small" hoverable>
                    <Radio value="quick">
                      <Space orientation="vertical" size={2}>
                        <Typography.Text strong>
                          <PictureOutlined /> Hero image
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          A single still. Fastest path — roughly one provider call.
                        </Typography.Text>
                      </Space>
                    </Radio>
                  </Card>
                  <Card size="small" hoverable>
                    <Radio value="full">
                      <Space orientation="vertical" size={2}>
                        <Typography.Text strong>
                          <VideoCameraOutlined /> Full ad pack
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Imagery, motion, voiceover, and a muxed MP4 with a provenance
                          manifest.
                        </Typography.Text>
                      </Space>
                    </Radio>
                  </Card>
                </Space>
              </Radio.Group>
            </Form.Item>

            <Form.Item
              name="video_format"
              label="Placement"
              extra="Sets the render dimensions and steers image composition for the target feed."
            >
              <FormatPicker />
            </Form.Item>

            {mode === "full" ? (
              <div className="stack">
                <Form.Item
                  name="storyboard"
                  label="Review scenes before rendering"
                  valuePropName="checked"
                  extra="Recommended. Generates each scene as a still first so you can edit prompts and regenerate before committing to video."
                >
                  <Switch />
                </Form.Item>

                {storyboardEnabled ? (
                  <Form.Item
                    name="scene_count"
                    label="Scenes"
                    extra="Narration is split across scenes; longer lines get longer screen time."
                  >
                    <InputNumber min={2} max={10} />
                  </Form.Item>
                ) : null}
              </div>
            ) : null}
          </div>

          <div hidden={step !== 1} className="stack">
            <Form.Item
              name="prompt_override"
              label="Image prompt override"
              rules={[{ max: 2000, message: "Keep it under 2000 characters" }]}
              extra="Leave blank to build the prompt from the campaign brief."
            >
              <Input.TextArea rows={3} showCount maxLength={2000} />
            </Form.Item>

            <Form.Item
              name="voiceover_script"
              label="Voiceover script"
              rules={[{ max: 2000, message: "Keep it under 2000 characters" }]}
              extra="Leave blank to generate narration from the brief."
            >
              <Input.TextArea rows={4} showCount maxLength={2000} />
            </Form.Item>

            <Form.Item
              name="include_music"
              label="Background music"
              valuePropName="checked"
              extra="Adds a music generation step. Requires a Replicate or GMI Cloud key."
            >
              <Switch />
            </Form.Item>

            {includeMusic ? (
              <Form.Item name="music_prompt" label="Music direction" rules={[{ max: 500 }]}>
                <Input placeholder="Warm acoustic bed, gentle build, no vocals" />
              </Form.Item>
            ) : null}
          </div>

          <div hidden={step !== 2} className="stack">
            <ProviderPicker mode={mode} />

            <Alert
              type="info"
              showIcon
              title="Ready to run"
              description={
                <Space orientation="vertical" size={4}>
                  <span>
                    Campaign: <strong>{campaign.name}</strong> · Product:{" "}
                    <strong>{campaign.product_name}</strong>
                  </span>
                  <Space wrap size={4}>
                    <Tag>{campaign.tone}</Tag>
                    <Tag>{campaign.cta}</Tag>
                    {campaign.logo_b2_key ? <Tag color="blue">logo attached</Tag> : null}
                  </Space>
                </Space>
              }
            />
          </div>

          <div className="row" style={{ marginTop: "var(--space-6)" }}>
            {step > 0 ? <Button onClick={() => setStep(step - 1)}>Back</Button> : null}
            <span className="grow" />
            {step < steps.length - 1 ? (
              <Button type="primary" onClick={() => setStep(step + 1)}>
                Continue
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={submitting}
                onClick={() => void submit()}
              >
                Start generation
              </Button>
            )}
          </div>
        </Form>
      </section>
    </>
  );
}

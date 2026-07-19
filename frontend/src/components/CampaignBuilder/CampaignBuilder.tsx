import { useEffect, useState } from "react";
import {
  Button,
  Col,
  Form,
  Input,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import { ThunderboltOutlined, UploadOutlined } from "@ant-design/icons";
import {
  createCampaign,
  deleteCampaignLogo,
  generateCampaign,
  pollRun,
  uploadCampaignLogo,
} from "../../services/api";
import type { Campaign, Run, RunMode } from "../../types";
import { filterSteps } from "../../utils/runSteps";
import {
  ProviderPicker,
  buildSelectionPayload,
} from "../ProviderPicker/ProviderPicker";
import { RunStatus } from "../RunStatus/RunStatus";
import { StoryboardEditor } from "../StoryboardEditor/StoryboardEditor";
import { WorkflowSection } from "../WorkflowSection/WorkflowSection";

interface Props {
  campaigns?: Campaign[];
  defaultCampaignId?: string | null;
  onCampaignCreated?: (campaign: Campaign) => void;
  onCampaignSelected?: (campaign: Campaign) => void;
  onRunUpdate?: (run: Run) => void;
  onGenerationStarted?: () => void;
}

interface FormValues {
  name: string;
  product_name: string;
  product_description: string;
  audience: string;
  tone: string;
  cta: string;
  brief: string;
  mode: RunMode;
  prompt_override?: string;
  voiceover_script?: string;
  storyboard?: boolean;
  scene_count?: number;
  existing_campaign_id?: string;
  image_vendor?: string;
  image_model?: string;
  video_vendor?: string;
  video_model?: string;
  tts_vendor?: string;
  tts_model?: string;
  music_vendor?: string;
  music_model?: string;
}

export function CampaignBuilder({
  campaigns = [],
  defaultCampaignId,
  onCampaignCreated,
  onCampaignSelected,
  onRunUpdate,
  onGenerationStarted,
}: Props) {
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [useExisting, setUseExisting] = useState(campaigns.length > 0);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [campaignLogoKey, setCampaignLogoKey] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (campaigns.length > 0) {
      setUseExisting(true);
      const preferred =
        defaultCampaignId && campaigns.some((c) => c.id === defaultCampaignId)
          ? defaultCampaignId
          : campaigns[0]?.id;
      if (preferred) {
        form.setFieldsValue({ existing_campaign_id: preferred });
      }
    }
  }, [campaigns, defaultCampaignId, form]);

  const onFinish = async (values: FormValues) => {
    setSubmitting(true);
    onGenerationStarted?.();
    try {
      let campaign: Campaign;

      if (useExisting && values.existing_campaign_id) {
        const found = campaigns.find((c) => c.id === values.existing_campaign_id);
        if (!found) {
          throw new Error("Selected campaign not found");
        }
        campaign = found;
        onCampaignSelected?.(campaign);
        setCampaignLogoKey(campaign.logo_b2_key);
        message.success(`Reusing “${campaign.name}”`);
      } else {
        campaign = await createCampaign({
          name: values.name,
          product_name: values.product_name,
          product_description: values.product_description,
          audience: values.audience,
          tone: values.tone,
          cta: values.cta,
          brief: values.brief,
          brand_colors: ["#0f7a5f", "#c45c26"],
        });
        if (logoFile) {
          campaign = await uploadCampaignLogo(campaign.id, logoFile);
          setCampaignLogoKey(campaign.logo_b2_key);
        }
        onCampaignCreated?.(campaign);
        message.success("Campaign created — starting pipeline");
      }

      const selection = buildSelectionPayload(values);

      const run = await generateCampaign(campaign.id, {
        mode: values.mode,
        prompt_override: values.prompt_override || undefined,
        voiceover_script: values.voiceover_script || undefined,
        storyboard: values.mode === "full" ? !!values.storyboard : false,
        scene_count:
          values.mode === "full" && values.storyboard
            ? values.scene_count || 4
            : undefined,
        selection,
      });
      setActiveRun(run);
      onRunUpdate?.(run);

      const finalRun = await pollRun(run.id, (tick) => {
        setActiveRun(tick);
        onRunUpdate?.(tick);
      });

      if (finalRun.status === "storyboard") {
        message.success("Storyboard ready — review scenes below");
      } else if (finalRun.status === "succeeded") {
        message.success("Ad pack ready");
      } else {
        message.error(finalRun.error || "Pipeline failed");
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const hasStoryboardAssets = (activeRun?.assets || []).some((a) =>
    a.step_name.startsWith("scene-"),
  );
  const hasStoryboardSteps =
    filterSteps(activeRun?.steps || [], "storyboard").length > 0;
  const hasVideoSteps = filterSteps(activeRun?.steps || [], "video").length > 0;

  const sceneGenerationInProgress =
    activeRun?.status === "running" && hasStoryboardSteps && !hasVideoSteps;

  const showStoryboardWorkflow =
    !!activeRun &&
    !sceneGenerationInProgress &&
    (activeRun.status === "storyboard" ||
      hasStoryboardAssets ||
      hasVideoSteps ||
      activeRun.status === "succeeded");

  const showSceneGenerationProgress = sceneGenerationInProgress;

  const showClassicPipeline =
    activeRun &&
    !showStoryboardWorkflow &&
    !showSceneGenerationProgress &&
    activeRun.status !== "storyboard";

  return (
    <div className="panel campaign-builder-panel">
      <div className="gallery-toolbar" style={{ marginBottom: 12 }}>
        <h2 className="panel-title" style={{ margin: 0 }}>
          Campaign builder
        </h2>
        {campaigns.length > 0 ? (
          <Space>
            <Typography.Text type="secondary">Use existing</Typography.Text>
            <Switch checked={useExisting} onChange={setUseExisting} />
          </Space>
        ) : null}
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          tone: "confident",
          cta: "Shop now",
          mode: "full",
          storyboard: true,
          scene_count: 4,
          existing_campaign_id: defaultCampaignId || campaigns[0]?.id,
        }}
        onFinish={(vals) => void onFinish(vals)}
      >
        {useExisting && campaigns.length > 0 ? (
          <>
            <Form.Item
              label="Existing campaign"
              name="existing_campaign_id"
              rules={[{ required: true, message: "Select a campaign" }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={campaigns.map((c) => ({
                  value: c.id,
                  label: `${c.name} · ${c.product_name}`,
                }))}
                onChange={(id) => {
                  const c = campaigns.find((x) => x.id === id);
                  if (c) {
                    onCampaignSelected?.(c);
                    setCampaignLogoKey(c.logo_b2_key);
                  }
                }}
              />
            </Form.Item>
            <Form.Item label="Brand logo on B2">
              <Space wrap>
                <Upload
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  maxCount={1}
                  showUploadList={false}
                  beforeUpload={(file) => {
                    void (async () => {
                      const id = form.getFieldValue("existing_campaign_id") as
                        | string
                        | undefined;
                      if (!id) {
                        message.warning("Select a campaign first");
                        return;
                      }
                      setUploadingLogo(true);
                      try {
                        const updated = await uploadCampaignLogo(id, file);
                        setCampaignLogoKey(updated.logo_b2_key);
                        message.success("Logo uploaded — used in image steps");
                        onCampaignCreated?.(updated);
                      } catch (err) {
                        message.error(
                          err instanceof Error ? err.message : "Logo upload failed",
                        );
                      } finally {
                        setUploadingLogo(false);
                      }
                    })();
                    return false;
                  }}
                >
                  <Button icon={<UploadOutlined />} loading={uploadingLogo}>
                    Upload / replace logo
                  </Button>
                </Upload>
                {campaignLogoKey ? (
                  <>
                    <Tag color="green">Logo on B2</Tag>
                    <Button
                      type="link"
                      danger
                      onClick={() => {
                        void (async () => {
                          const id = form.getFieldValue(
                            "existing_campaign_id",
                          ) as string | undefined;
                          if (!id) return;
                          try {
                            const updated = await deleteCampaignLogo(id);
                            setCampaignLogoKey(null);
                            message.success("Logo removed");
                            onCampaignCreated?.(updated);
                          } catch (err) {
                            message.error(
                              err instanceof Error
                                ? err.message
                                : "Logo delete failed",
                            );
                          }
                        })();
                      }}
                    >
                      Remove
                    </Button>
                  </>
                ) : (
                  <Typography.Text type="secondary">
                    No logo — image steps run without brand reference
                  </Typography.Text>
                )}
              </Space>
            </Form.Item>
          </>
        ) : (
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Campaign name"
                name="name"
                rules={[{ required: true }]}
              >
                <Input placeholder="Spring Launch — Aurora Bottle" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Product name"
                name="product_name"
                rules={[{ required: true }]}
              >
                <Input placeholder="Aurora Insulated Bottle" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="Product description" name="product_description">
                <Input.TextArea
                  rows={3}
                  placeholder="What makes this product worth advertising?"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Audience" name="audience">
                <Input placeholder="Urban professionals 25–40" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Tone" name="tone">
                <Select
                  options={[
                    { value: "confident", label: "Confident" },
                    { value: "warm", label: "Warm" },
                    { value: "playful", label: "Playful" },
                    { value: "premium", label: "Premium" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="CTA" name="cta">
                <Input placeholder="Shop now" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="Brief" name="brief">
                <Input.TextArea
                  rows={2}
                  placeholder="Brand constraints, must-haves"
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="Brand logo (optional)">
                <Space wrap>
                  <Upload
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    maxCount={1}
                    beforeUpload={(file) => {
                      setLogoFile(file);
                      return false;
                    }}
                    onRemove={() => setLogoFile(null)}
                  >
                    <Button icon={<UploadOutlined />}>Select logo</Button>
                  </Upload>
                  {logoFile ? (
                    <Typography.Text type="secondary">
                      {logoFile.name} — uploaded when campaign is created
                    </Typography.Text>
                  ) : null}
                </Space>
              </Form.Item>
            </Col>
          </Row>
        )}

        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.mode !== cur.mode}>
          {({ getFieldValue }) => (
            <ProviderPicker mode={getFieldValue("mode") as "quick" | "full"} />
          )}
        </Form.Item>

        <Row gutter={16}>
          <Col span={24}>
            <Form.Item label="Generation mode" name="mode">
              <Radio.Group>
                <Radio.Button value="quick">Quick (image)</Radio.Button>
                <Radio.Button value="full">
                  Full Ad (storyboard → video → VO)
                </Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              noStyle
              shouldUpdate={(prev, cur) => prev.mode !== cur.mode}
            >
              {({ getFieldValue }) =>
                getFieldValue("mode") === "full" ? (
                  <Form.Item
                    label="Scene-by-scene storyboard"
                    name="storyboard"
                    valuePropName="checked"
                    tooltip="Generate multiple scene prompts and images from your product + voiceover. Edit each prompt, then build the video."
                  >
                    <Switch />
                  </Form.Item>
                ) : null
              }
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              noStyle
              shouldUpdate={(prev, cur) =>
                prev.mode !== cur.mode || prev.storyboard !== cur.storyboard
              }
            >
              {({ getFieldValue }) =>
                getFieldValue("mode") === "full" &&
                getFieldValue("storyboard") ? (
                  <Form.Item label="Number of scenes" name="scene_count">
                    <Select
                      options={Array.from({ length: 9 }, (_, i) => i + 2).map(
                        (n) => ({
                          value: n,
                          label: `${n} scenes`,
                        }),
                      )}
                    />
                  </Form.Item>
                ) : null
              }
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="Prompt override (optional)" name="prompt_override">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              label="Voiceover script (optional)"
              name="voiceover_script"
              tooltip="Leave blank to auto-generate one line per scene from your product details."
            >
              <Input.TextArea
                rows={2}
                placeholder="Optional — auto-generated from product + scene count when empty"
              />
            </Form.Item>
          </Col>
        </Row>

        <Space wrap>
          <Button
            type="primary"
            htmlType="submit"
            icon={<ThunderboltOutlined />}
            loading={submitting}
            size="large"
          >
            Generate ad pack
          </Button>
          {activeRun ? (
            <Tag
              color={
                activeRun.status === "succeeded"
                  ? "success"
                  : activeRun.status === "failed"
                    ? "error"
                    : activeRun.status === "storyboard"
                      ? "gold"
                      : "processing"
              }
            >
              {activeRun.status}
            </Tag>
          ) : null}
        </Space>
      </Form>

      {showSceneGenerationProgress && activeRun ? (
        <div className="campaign-workflow-block">
          <WorkflowSection
            title="Generating scenes"
            subtitle="Planning prompts and creating one image per voiceover beat."
          >
            <RunStatus run={activeRun} phase="storyboard" />
          </WorkflowSection>
        </div>
      ) : null}

      {showStoryboardWorkflow && activeRun ? (
        <div className="campaign-workflow-block">
          <StoryboardEditor
            run={activeRun}
            onRunUpdate={(tick) => {
              setActiveRun(tick);
              onRunUpdate?.(tick);
            }}
            onFinalized={() => onRunUpdate?.(activeRun)}
          />
        </div>
      ) : null}

      {showClassicPipeline && activeRun ? (
        <div className="campaign-workflow-block">
          <WorkflowSection
            title="Pipeline progress"
            subtitle="Quick mode or non-storyboard full ad."
          >
            <RunStatus run={activeRun} phase="all" />
          </WorkflowSection>
        </div>
      ) : null}
    </div>
  );
}

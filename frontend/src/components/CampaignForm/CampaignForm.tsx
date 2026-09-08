import { useEffect, useState } from "react";
import {
  App,
  Button,
  Col,
  ColorPicker,
  Form,
  Input,
  Row,
  Select,
  Space,
  Typography,
  Upload,
} from "antd";
import type { UploadFile } from "antd";
import { DeleteOutlined, UploadOutlined } from "@ant-design/icons";
import type { Campaign, CampaignCreate } from "../../types";
import { deleteCampaignLogo, uploadCampaignLogo } from "../../services/api";

const TONES = [
  "confident",
  "playful",
  "premium",
  "warm",
  "urgent",
  "technical",
  "minimal",
];

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export interface CampaignFormValues extends CampaignCreate {
  brand_colors: string[];
}

interface Props {
  /** Existing campaign enables logo management, which requires an id. */
  campaign?: Campaign | null;
  submitLabel?: string;
  submitting?: boolean;
  onSubmit: (values: CampaignFormValues, logo: File | null) => Promise<void> | void;
  onCancel?: () => void;
}

export function CampaignForm({
  campaign = null,
  submitLabel = "Create campaign",
  submitting = false,
  onSubmit,
  onCancel,
}: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CampaignFormValues>();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoKey, setLogoKey] = useState<string | null>(campaign?.logo_b2_key ?? null);
  const [logoBusy, setLogoBusy] = useState(false);

  useEffect(() => {
    setLogoKey(campaign?.logo_b2_key ?? null);
    if (campaign) {
      form.setFieldsValue({
        name: campaign.name,
        product_name: campaign.product_name,
        product_description: campaign.product_description,
        audience: campaign.audience,
        tone: campaign.tone,
        cta: campaign.cta,
        brief: campaign.brief,
        brand_colors: campaign.brand_colors?.length
          ? campaign.brand_colors
          : ["#4f46e5", "#101828"],
      });
    }
  }, [campaign, form]);

  const validateLogo = (file: File): boolean => {
    if (!LOGO_TYPES.includes(file.type)) {
      message.error("Logo must be PNG, JPEG, WebP, or GIF");
      return false;
    }
    if (file.size > MAX_LOGO_BYTES) {
      message.error("Logo must be 5 MB or smaller");
      return false;
    }
    return true;
  };

  const uploadNow = async (file: File) => {
    if (!campaign) {
      setLogoFile(file);
      return;
    }
    setLogoBusy(true);
    try {
      const updated = await uploadCampaignLogo(campaign.id, file);
      setLogoKey(updated.logo_b2_key);
      message.success("Logo uploaded");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async () => {
    if (!campaign) {
      setLogoFile(null);
      return;
    }
    setLogoBusy(true);
    try {
      await deleteCampaignLogo(campaign.id);
      setLogoKey(null);
      message.success("Logo removed");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not remove logo");
    } finally {
      setLogoBusy(false);
    }
  };

  const fileList: UploadFile[] = logoFile
    ? [{ uid: "pending", name: logoFile.name, status: "done" }]
    : logoKey
      ? [{ uid: "stored", name: logoKey.split("/").pop() || "logo", status: "done" }]
      : [];

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark="optional"
      initialValues={{
        tone: "confident",
        cta: "Shop now",
        brand_colors: ["#4f46e5", "#101828"],
      }}
      onFinish={(values) => void onSubmit(values, logoFile)}
    >
      <Row gutter={[24, 0]}>
        <Col xs={24} md={12}>
          <Form.Item
            name="name"
            label="Campaign name"
            rules={[
              { required: true, message: "Give the campaign a name" },
              { max: 200, message: "Keep it under 200 characters" },
            ]}
          >
            <Input placeholder="Spring launch — Aurora Bottle" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name="product_name"
            label="Product"
            rules={[
              { required: true, message: "What are you advertising?" },
              { max: 200, message: "Keep it under 200 characters" },
            ]}
          >
            <Input placeholder="Aurora Bottle" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        name="product_description"
        label="Product description"
        rules={[{ max: 2000, message: "Keep it under 2000 characters" }]}
        extra="What it is and why it matters. Feeds every generated prompt."
      >
        <Input.TextArea
          rows={3}
          showCount
          maxLength={2000}
          placeholder="A 24-hour vacuum-insulated bottle with a leak-proof magnetic cap."
        />
      </Form.Item>

      <Row gutter={[24, 0]}>
        <Col xs={24} md={12}>
          <Form.Item
            name="audience"
            label="Audience"
            rules={[{ max: 300, message: "Keep it under 300 characters" }]}
          >
            <Input placeholder="Outdoor enthusiasts, 25–40" />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <Form.Item name="tone" label="Tone">
            <Select
              options={TONES.map((t) => ({ value: t, label: t }))}
              showSearch
            />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <Form.Item
            name="cta"
            label="Call to action"
            rules={[{ max: 100, message: "Keep it short" }]}
          >
            <Input placeholder="Shop now" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        name="brief"
        label="Creative brief"
        rules={[{ max: 5000, message: "Keep it under 5000 characters" }]}
        extra="Optional. Constraints, mandatories, references — anything the prompts should respect."
      >
        <Input.TextArea rows={4} showCount maxLength={5000} />
      </Form.Item>

      <Row gutter={[24, 0]}>
        <Col xs={24} md={12}>
          <Form.Item
            label="Brand colours"
            extra="Used to steer palette in generated imagery."
          >
            <Form.List name="brand_colors">
              {(fields, { add, remove }) => (
                <Space wrap>
                  {fields.map(({ key, ...field }) => (
                    <Space key={key} size={4}>
                      <Form.Item
                        {...field}
                        noStyle
                        getValueFromEvent={(_color, hex: string) => hex}
                      >
                        <ColorPicker showText format="hex" />
                      </Form.Item>
                      {fields.length > 1 ? (
                        <Button
                          type="text"
                          size="small"
                          aria-label="Remove colour"
                          icon={<DeleteOutlined />}
                          onClick={() => remove(field.name)}
                        />
                      ) : null}
                    </Space>
                  ))}
                  {fields.length < 5 ? (
                    <Button size="small" onClick={() => add("#667085")}>
                      Add colour
                    </Button>
                  ) : null}
                </Space>
              )}
            </Form.List>
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label="Brand logo"
            extra="PNG, JPEG, WebP, or GIF up to 5 MB. Passed to providers that accept image references."
          >
            <Space orientation="vertical" style={{ width: "100%" }}>
              <Upload
                accept={LOGO_TYPES.join(",")}
                maxCount={1}
                fileList={fileList}
                beforeUpload={(file) => {
                  if (!validateLogo(file)) return Upload.LIST_IGNORE;
                  void uploadNow(file);
                  return false;
                }}
                onRemove={() => {
                  void removeLogo();
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />} loading={logoBusy}>
                  {logoKey || logoFile ? "Replace logo" : "Upload logo"}
                </Button>
              </Upload>
              {!campaign && logoFile ? (
                <Typography.Text type="secondary" style={{ fontSize: "var(--text-sm)" }}>
                  Uploads once the campaign is created.
                </Typography.Text>
              ) : null}
            </Space>
          </Form.Item>
        </Col>
      </Row>

      <div className="row" style={{ marginTop: 8 }}>
        <Button type="primary" htmlType="submit" loading={submitting}>
          {submitLabel}
        </Button>
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
      </div>
    </Form>
  );
}

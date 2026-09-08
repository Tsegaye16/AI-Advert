import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { App, Button } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { createCampaign, uploadCampaignLogo } from "../services/api";
import { CampaignForm } from "../components/CampaignForm/CampaignForm";
import type { CampaignFormValues } from "../components/CampaignForm/CampaignForm";
import { PageHeader } from "../components/ui/PageHeader";
import { PageMeta } from "../components/PageMeta/PageMeta";

export default function NewCampaignPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (values: CampaignFormValues, logo: File | null) => {
    setSubmitting(true);
    try {
      let campaign = await createCampaign({
        ...values,
        brand_colors: (values.brand_colors || []).filter(Boolean),
      });
      if (logo) {
        campaign = await uploadCampaignLogo(campaign.id, logo);
      }
      message.success("Campaign created");
      navigate(`/campaigns/${campaign.id}/generate`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not create campaign");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageMeta title="New campaign" />
      <PageHeader
        eyebrow={
          <Link to="/campaigns">
            <Button type="text" size="small" icon={<ArrowLeftOutlined />}>
              Campaigns
            </Button>
          </Link>
        }
        title="New campaign"
        description="Describe the product once. Every run in this campaign inherits the brief, tone, and brand kit."
      />

      <section className="surface surface--padded">
        <CampaignForm
          submitLabel="Create and continue"
          submitting={submitting}
          onSubmit={submit}
          onCancel={() => navigate("/campaigns")}
        />
      </section>
    </>
  );
}

import { Link } from "react-router-dom";
import { Button } from "antd";
import { CompassOutlined } from "@ant-design/icons";
import { EmptyState } from "../components/ui/EmptyState";
import { PageMeta } from "../components/PageMeta/PageMeta";

export default function NotFoundPage() {
  return (
    <>
      <PageMeta title="Page not found" />
      <EmptyState
        icon={<CompassOutlined />}
        title="We couldn't find that page"
        description="The link may be out of date, or the campaign, run, or asset it pointed to has been deleted."
        actions={
          <>
            <Link to="/">
              <Button type="primary">Back to overview</Button>
            </Link>
            <Link to="/assets">
              <Button>Browse assets</Button>
            </Link>
          </>
        }
      />
    </>
  );
}

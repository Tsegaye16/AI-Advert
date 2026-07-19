import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  finalizeStoryboard,
  getAssetUrl,
  getRun,
  getStoryboard,
  pollRun,
  regenerateStoryboardScene,
  updateStoryboardScene,
} from "../../services/api";
import type { Run, Storyboard, StoryboardScene } from "../../types";
import { filterSteps, isVideoPipelineStep } from "../../utils/runSteps";
import { RunStatus } from "../RunStatus/RunStatus";
import { WorkflowSection } from "../WorkflowSection/WorkflowSection";

interface Props {
  run: Run;
  onRunUpdate?: (run: Run) => void;
  onFinalized?: () => void;
}

function useSceneImageUrl(scene: StoryboardScene): string | null {
  const [viewUrl, setViewUrl] = useState<string | null>(scene.image_url);

  useEffect(() => {
    let cancelled = false;
    if (scene.image_url) {
      setViewUrl(scene.image_url);
      return;
    }
    if (!scene.asset_id) {
      setViewUrl(null);
      return;
    }
    void getAssetUrl(scene.asset_id)
      .then(({ url }) => {
        if (!cancelled) setViewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setViewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [scene.asset_id, scene.image_url]);

  return viewUrl;
}

function SceneCard({
  scene,
  runId,
  onSceneUpdated,
  disabled,
}: {
  scene: StoryboardScene;
  runId: string;
  onSceneUpdated: (board: Storyboard) => void;
  disabled?: boolean;
}) {
  const [prompt, setPrompt] = useState(scene.prompt);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const imageUrl = useSceneImageUrl(scene);

  useEffect(() => {
    setPrompt(scene.prompt);
  }, [scene.prompt]);

  const savePrompt = async () => {
    if (!prompt.trim()) {
      message.warning("Prompt cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const board = await updateStoryboardScene(runId, scene.index, prompt.trim());
      onSceneUpdated(board);
      message.success(`Scene ${scene.index + 1} prompt saved`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      if (prompt.trim() !== scene.prompt.trim()) {
        await updateStoryboardScene(runId, scene.index, prompt.trim());
      }
      const board = await regenerateStoryboardScene(runId, scene.index);
      onSceneUpdated(board);
      message.success(`Scene ${scene.index + 1} image regenerated`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <Card
      className="storyboard-scene-card"
      title={
        <Space wrap>
          <Typography.Text strong>
            Scene {scene.index + 1}: {scene.title}
          </Typography.Text>
          <Tag color={scene.status === "ready" ? "green" : "processing"}>
            {scene.status}
          </Tag>
        </Space>
      }
      size="small"
    >
      <Typography.Text type="secondary" className="storyboard-voice-line">
        VO: “{scene.voice_line}”
      </Typography.Text>

      <div className="storyboard-scene-media">
        {imageUrl ? (
          <img
            key={scene.asset_id || `${scene.index}-${imageUrl}`}
            src={imageUrl}
            alt={`Scene ${scene.index + 1}`}
          />
        ) : (
          <div className="storyboard-scene-placeholder">No image yet</div>
        )}
      </div>

      <Input.TextArea
        rows={4}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Image generation prompt for this scene"
        disabled={disabled && !regenerating}
        style={{ marginTop: 12 }}
      />

      <Space wrap style={{ marginTop: 12 }}>
        <Button
          size="small"
          icon={<SaveOutlined />}
          loading={saving}
          disabled={disabled}
          onClick={() => void savePrompt()}
        >
          Save prompt
        </Button>
        <Button
          size="small"
          type="primary"
          icon={<ReloadOutlined />}
          loading={regenerating}
          disabled={disabled && !regenerating}
          onClick={() => void regenerate()}
        >
          Regenerate image
        </Button>
      </Space>
    </Card>
  );
}

export function StoryboardEditor({ run, onRunUpdate, onFinalized }: Props) {
  const [board, setBoard] = useState<Storyboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [activeRun, setActiveRun] = useState<Run | null>(run);
  const [videoPhaseStarted, setVideoPhaseStarted] = useState(false);

  const loadStoryboard = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStoryboard(run.id);
      setBoard(data);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to load storyboard");
    } finally {
      setLoading(false);
    }
  }, [run.id]);

  useEffect(() => {
    if (run.status !== "storyboard" && run.status !== "succeeded") return;
    void loadStoryboard();
  }, [run.id, run.status, loadStoryboard]);

  // Single safety retry if API was briefly empty right after status flip.
  useEffect(() => {
    if (run.status !== "storyboard") return;
    if (board?.ready) return;
    const timer = window.setTimeout(() => {
      void loadStoryboard();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [run.status, board?.ready, loadStoryboard]);

  useEffect(() => {
    setActiveRun(run);
    const hasVideoSteps = (run.steps || []).some((s) =>
      isVideoPipelineStep(s.name),
    );
    if (
      hasVideoSteps ||
      run.status === "succeeded" ||
      (run.status === "running" && hasVideoSteps)
    ) {
      setVideoPhaseStarted(true);
    }
  }, [run]);

  const showVideoPipeline = useMemo(() => {
    const r = activeRun || run;
    const videoSteps = filterSteps(r.steps || [], "video");
    return (
      videoPhaseStarted ||
      finalizing ||
      videoSteps.length > 0 ||
      r.status === "succeeded"
    );
  }, [activeRun, run, videoPhaseStarted, finalizing]);

  const videoRun = activeRun || run;
  const scenesReady = board?.scenes?.filter((s) => s.status === "ready").length ?? 0;
  const sceneTotal = board?.scenes?.length ?? 0;

  const onFinalize = async () => {
    if (!board?.ready) {
      message.warning("Wait until all scene images are ready");
      return;
    }
    setFinalizing(true);
    setVideoPhaseStarted(true);
    try {
      const queued = await finalizeStoryboard(run.id);
      setActiveRun(queued);
      onRunUpdate?.(queued);
      message.success("Building multi-scene video + voiceover…");

      const finalRun = await pollRun(run.id, (tick) => {
        setActiveRun(tick);
        onRunUpdate?.(tick);
      });

      if (finalRun.status === "succeeded") {
        message.success("Full ad ready — scenes stitched into final video");
        onFinalized?.();
      } else {
        message.error(finalRun.error || "Video pipeline failed");
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Finalize failed");
      setVideoPhaseStarted(false);
    } finally {
      setFinalizing(false);
    }
  };

  const editingLocked = finalizing;

  return (
    <div className="storyboard-workflow">
      <WorkflowSection
        title="Scene storyboard"
        subtitle="Each scene has its own prompt and image, synced to your voiceover. You can edit and regenerate scenes anytime — even after the video is built."
        badge={
          board?.ready && sceneTotal > 0 ? (
            <Tag icon={<CheckCircleOutlined />} color="success">
              {scenesReady}/{sceneTotal} scenes ready
            </Tag>
          ) : board?.scenes?.length ? (
            <Tag color="processing">
              Loading scenes… ({board.scenes.length} planned)
            </Tag>
          ) : (
            <Tag color="processing">Preparing scenes…</Tag>
          )
        }
      >
        {board?.voiceover ? (
          <Alert
            type="info"
            showIcon
            className="storyboard-vo-alert"
            message="Voiceover script"
            description={board.voiceover}
          />
        ) : null}

        <Spin spinning={loading && !board?.scenes?.length}>
          <Row gutter={[16, 16]}>
            {(board?.scenes || []).map((scene) => (
              <Col xs={24} lg={12} key={scene.index}>
                <SceneCard
                  scene={scene}
                  runId={run.id}
                  disabled={editingLocked}
                  onSceneUpdated={async (updated) => {
                    setBoard(updated);
                    try {
                      const latest = await getRun(run.id);
                      onRunUpdate?.(latest);
                    } catch {
                      /* gallery refresh is best-effort */
                    }
                  }}
                />
              </Col>
            ))}
          </Row>
        </Spin>

        <div className="storyboard-footer">
          <div className="storyboard-footer__copy">
            <Typography.Text strong>Ready for video?</Typography.Text>
            <Typography.Text type="secondary">
              Scenes will be stitched into a multi-scene clip, voiceover added,
              then muxed into your final ad.
            </Typography.Text>
          </div>
          <Button
            type="primary"
            size="large"
            icon={<PlayCircleOutlined />}
            loading={finalizing}
            disabled={!board?.ready || finalizing || sceneTotal === 0}
            onClick={() => void onFinalize()}
          >
            {finalizing ? "Building video…" : "Generate video"}
          </Button>
        </div>
      </WorkflowSection>

      {showVideoPipeline ? (
        <>
          <div className="workflow-divider" aria-hidden />
          <WorkflowSection
            title="Video production"
            subtitle="Multi-scene video, voiceover, and final mux — runs below your storyboard."
            badge={
              videoRun.status === "succeeded" ? (
                <Tag color="success">Complete</Tag>
              ) : videoRun.status === "running" || finalizing ? (
                <Tag color="processing">In progress</Tag>
              ) : videoRun.status === "failed" ? (
                <Tag color="error">Failed</Tag>
              ) : (
                <Tag>Queued</Tag>
              )
            }
            className="video-production-section"
          >
            <RunStatus run={videoRun} phase="video" />
            {videoRun.status === "succeeded" ? (
              <Alert
                type="success"
                showIcon
                style={{ marginTop: 16 }}
                message="Final ad is in the gallery"
                description="Scroll up to tweak any scene and regenerate — then hit Generate video again for a new cut."
              />
            ) : null}
          </WorkflowSection>
        </>
      ) : null}
    </div>
  );
}

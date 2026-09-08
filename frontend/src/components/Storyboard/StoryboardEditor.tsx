import { useCallback, useEffect, useState } from "react";
import { App, Button, Input, Tag, Tooltip, Typography } from "antd";
import {
  CheckCircleOutlined,
  PictureOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  getStoryboard,
  regenerateStoryboardScene,
  updateStoryboardScene,
} from "../../services/api";
import { invalidateAssetUrl, resolveAssetUrl } from "../../hooks/useAssetUrl";
import type { Storyboard, StoryboardScene } from "../../types";

function useSceneImage(scene: StoryboardScene): string | null {
  const [url, setUrl] = useState<string | null>(scene.image_url);

  useEffect(() => {
    let alive = true;
    if (!scene.asset_id) {
      setUrl(scene.image_url);
      return;
    }
    void resolveAssetUrl(scene.asset_id)
      .then((fresh) => alive && setUrl(fresh))
      .catch(() => alive && setUrl(scene.image_url));
    return () => {
      alive = false;
    };
  }, [scene.asset_id, scene.image_url]);

  return url;
}

function SceneCard({
  scene,
  runId,
  locked,
  onUpdated,
}: {
  scene: StoryboardScene;
  runId: string;
  locked: boolean;
  onUpdated: (board: Storyboard) => void;
}) {
  const { message } = App.useApp();
  const [prompt, setPrompt] = useState(scene.prompt);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const imageUrl = useSceneImage(scene);

  useEffect(() => setPrompt(scene.prompt), [scene.prompt]);

  const dirty = prompt.trim() !== scene.prompt.trim();

  const save = async () => {
    if (!prompt.trim()) {
      message.warning("A scene prompt cannot be empty");
      return;
    }
    setSaving(true);
    try {
      onUpdated(await updateStoryboardScene(runId, scene.index, prompt.trim()));
      message.success(`Scene ${scene.index + 1} saved`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      if (dirty) await updateStoryboardScene(runId, scene.index, prompt.trim());
      if (scene.asset_id) invalidateAssetUrl(scene.asset_id);
      onUpdated(await regenerateStoryboardScene(runId, scene.index));
      message.success(`Scene ${scene.index + 1} regenerated`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <article className="scene-card">
      <header className="scene-card__head">
        <span className="scene-card__index">{scene.index + 1}</span>
        <Typography.Text className="scene-card__title">{scene.title}</Typography.Text>
        {dirty ? (
          <Tooltip title="You have unsaved prompt changes">
            <Tag color="warning">unsaved</Tag>
          </Tooltip>
        ) : (
          <Tag color={scene.status === "ready" ? "success" : "processing"}>
            {scene.status}
          </Tag>
        )}
      </header>

      <div className="media-frame" style={{ "--media-aspect": "16 / 9" } as React.CSSProperties}>
        {imageUrl ? (
          <img
            key={scene.asset_id || `${scene.index}`}
            src={imageUrl}
            alt={`Scene ${scene.index + 1}: ${scene.title}`}
            loading="lazy"
          />
        ) : (
          <div className="media-frame__placeholder">
            <PictureOutlined />
            <span>Generating…</span>
          </div>
        )}
      </div>

      <div className="scene-card__body">
        <blockquote className="scene-card__vo">{scene.voice_line}</blockquote>

        <Input.TextArea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={locked}
          aria-label={`Prompt for scene ${scene.index + 1}`}
          placeholder="Image prompt for this scene"
        />

        <div className="scene-card__actions">
          <Button
            size="small"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={locked || !dirty}
            onClick={() => void save()}
          >
            Save
          </Button>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={regenerating}
            disabled={locked}
            onClick={() => void regenerate()}
          >
            Regenerate
          </Button>
        </div>
      </div>
    </article>
  );
}

interface Props {
  runId: string;
  /** Blocks edits while the video render is in flight. */
  locked?: boolean;
  onReadyChange?: (ready: boolean) => void;
}

export function StoryboardEditor({ runId, locked = false, onReadyChange }: Props) {
  const { message } = App.useApp();
  const [board, setBoard] = useState<Storyboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getStoryboard(runId);
      setBoard(data);
      onReadyChange?.(data.ready);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Could not load storyboard");
    } finally {
      setLoading(false);
    }
  }, [runId, message, onReadyChange]);

  useEffect(() => {
    void load();
  }, [load]);

  // Scenes can still be rendering when the run first reports storyboard status.
  useEffect(() => {
    if (board?.ready || loading) return;
    const timer = setTimeout(() => void load(), 3000);
    return () => clearTimeout(timer);
  }, [board?.ready, loading, load]);

  const scenes = board?.scenes ?? [];
  const ready = scenes.filter((s) => s.status === "ready").length;

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <h3 className="section-head__title">Storyboard</h3>
          <span className="section-head__sub">
            Each scene carries its own prompt and still. Edit and regenerate freely —
            the video is only rendered when you finalise.
          </span>
        </div>
        {scenes.length > 0 ? (
          <Tag
            icon={board?.ready ? <CheckCircleOutlined /> : undefined}
            color={board?.ready ? "success" : "processing"}
          >
            {ready}/{scenes.length} scenes ready
          </Tag>
        ) : null}
      </div>

      {board?.voiceover ? (
        <div className="scene-card__vo" style={{ borderLeftColor: "var(--accent)" }}>
          <Typography.Text type="secondary" style={{ fontSize: "var(--text-xs)" }}>
            Voiceover script
          </Typography.Text>
          <div>{board.voiceover}</div>
        </div>
      ) : null}

      {loading && scenes.length === 0 ? (
        <div className="storyboard-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 320, borderRadius: "var(--radius-lg)" }}
            />
          ))}
        </div>
      ) : (
        <div className="storyboard-grid">
          {scenes.map((scene) => (
            <SceneCard
              key={scene.index}
              scene={scene}
              runId={runId}
              locked={locked}
              onUpdated={(next) => {
                setBoard(next);
                onReadyChange?.(next.ready);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

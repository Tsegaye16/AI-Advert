import type { StepStatus } from "../types";

export function isStoryboardStep(name: string): boolean {
  const n = name.toLowerCase();
  return n === "storyboard-plan" || n.startsWith("scene-");
}

export function isVideoPipelineStep(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n === "video" ||
    n.includes("voiceover") ||
    n.includes("voice") ||
    n === "music" ||
    n.includes("compose") ||
    n.includes("ffmpeg") ||
    n.includes("mux")
  );
}

export function filterSteps(
  steps: StepStatus[],
  phase: "storyboard" | "video" | "all",
): StepStatus[] {
  if (phase === "all") return steps;
  if (phase === "storyboard") {
    return steps.filter((s) => isStoryboardStep(s.name));
  }
  return steps.filter((s) => isVideoPipelineStep(s.name));
}

export function runPhaseLabel(run: {
  status: string;
  steps?: StepStatus[];
}): string {
  if (run.status === "storyboard") return "Storyboard review";
  const steps = run.steps || [];
  const hasVideo = steps.some((s) => isVideoPipelineStep(s.name));
  const hasStoryboard = steps.some((s) => isStoryboardStep(s.name));
  if (run.status === "running" && hasStoryboard && !hasVideo) {
    return "Generating scenes";
  }
  if (hasVideo && run.status === "running") return "Building video";
  if (run.status === "succeeded" && hasVideo) return "Ad pack complete";
  if (run.status === "succeeded") return "Complete";
  if (run.status === "failed") return "Failed";
  if (run.status === "queued") return "Queued";
  return "In progress";
}

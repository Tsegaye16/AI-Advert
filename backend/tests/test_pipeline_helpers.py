from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.core.branding import logo_external_inputs
from app.core.pipeline import (
    _embed_manifest_in_final_mp4,
    _manifest_to_dict,
    run_storyboard_phase,
)


def test_manifest_to_dict_from_model_dump():
    manifest = SimpleNamespace(model_dump=lambda: {"canonical_hash": "abc", "run": {}})
    data = _manifest_to_dict(manifest)
    assert data["canonical_hash"] == "abc"


def test_logo_external_inputs_none_without_key():
    b2 = MagicMock()
    assert logo_external_inputs(None, b2) is None
    b2.presign_get.assert_not_called()


def test_logo_external_inputs_presigns():
    b2 = MagicMock()
    b2.get_bytes.return_value = b"png-bytes"
    b2.sha256_bytes.return_value = "a" * 64
    b2.presign_get.return_value = "https://example/logo.png"
    with patch("genblaze_core.models.asset.Asset", side_effect=lambda **kw: SimpleNamespace(**kw)):
        inputs = logo_external_inputs("advault/campaigns/x/brand/logo.png", b2)
    assert inputs is not None
    assert len(inputs) == 1
    assert inputs[0].sha256 == "a" * 64
    b2.get_bytes.assert_called_once()


def test_embed_manifest_skips_without_final_asset():
    assets = [{"kind": "image", "b2_key": "k1"}]
    out_assets, manifest = _embed_manifest_in_final_mp4(
        run=SimpleNamespace(steps=[]),
        manifest=SimpleNamespace(),
        assets=assets,
        b2=MagicMock(),
    )
    assert out_assets == assets


@patch("app.core.pipeline._generate_storyboard_scene_image")
@patch("app.core.pipeline.build_object_storage_sink")
@patch("app.core.pipeline.provider_factory.get_image_provider")
def test_run_storyboard_phase_builds_scenes(
    mock_get_image,
    mock_sink,
    mock_scene_gen,
):
    from genblaze_core.models.asset import Asset
    from genblaze_core.models.enums import Modality
    from genblaze_core.models.step import Step

    mock_get_image.return_value = (MagicMock(), "flux", "nvidia")
    mock_sink.return_value = MagicMock()

    fake_step = Step(
        step_id="scene-0",
        provider="nvidia-image",
        model="flux",
        prompt="test",
        modality=Modality.IMAGE,
    )
    fake_step.assets.append(
        Asset(url="https://b2/x.png", media_type="image/png", sha256="a" * 64)
    )
    mock_scene_gen.return_value = (
        {
            "kind": "image",
            "step_name": "scene-1",
            "provider": "nvidia",
            "model": "flux",
            "url": "https://b2/x.png",
            "b2_key": "k",
            "sha256": "a" * 64,
            "mime": "image/png",
        },
        fake_step,
        "nvidia",
        "flux",
        False,
    )

    mock_b2 = MagicMock()
    with patch("app.core.pipeline.B2Service", return_value=mock_b2):
        with patch("app.core.pipeline._persist_manifest_sidecar", return_value="manifest-key"):
            with patch("genblaze_core.Manifest.from_run") as mock_from_run:
                mock_from_run.return_value = SimpleNamespace(
                    canonical_hash="hash123",
                    verify=lambda: True,
                    model_dump=lambda: {"canonical_hash": "hash123"},
                )
                result = run_storyboard_phase(
                    campaign_id="camp-1",
                    run_id="run-1",
                    campaign_context={
                        "product_name": "Bottle",
                        "product_description": "Steel bottle",
                        "audience": "hikers",
                        "tone": "premium",
                    },
                    prompts={"voice": "Meet Bottle. Buy now."},
                    storyboard_meta={"scene_count": 2},
                    settings=MagicMock(
                        b2_configured=True,
                        output_dir="/tmp",
                        b2_prefix="advault",
                    ),
                )

    assert result.mode == "storyboard-scenes"
    assert result.manifest_b2_key == "manifest-key"
    assert len(result.storyboard_scenes) == 2
    assert mock_scene_gen.call_count == 2

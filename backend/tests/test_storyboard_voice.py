from app.core.storyboard import generate_voice_lines, plan_scenes


def test_generate_voice_lines_respects_scene_count():
    lines = generate_voice_lines(
        product_name="EcoBottle",
        product_description="Insulated steel bottle",
        audience="hikers",
        tone="premium",
        cta="Shop now",
        scene_count=5,
    )
    assert len(lines) == 5
    assert "EcoBottle" in lines[0]
    assert "Shop now" in lines[-1]


def test_plan_scenes_auto_voice_when_empty():
    scenes = plan_scenes(
        product_name="EcoBottle",
        product_description="Insulated steel bottle",
        audience="hikers",
        tone="premium",
        voiceover="",
        cta="Buy today",
        scene_count=4,
    )
    assert len(scenes) == 4
    assert all(s["voice_line"] for s in scenes)
    assert scenes[0]["index"] == 0
    assert scenes[-1]["index"] == 3


def test_plan_scenes_caps_at_ten():
    scenes = plan_scenes(
        product_name="EcoBottle",
        product_description="Insulated steel bottle",
        audience="hikers",
        tone="premium",
        voiceover="",
        scene_count=10,
    )
    assert len(scenes) == 10

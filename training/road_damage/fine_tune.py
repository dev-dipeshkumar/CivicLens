"""Fine-tune a YOLOv8 road-damage detector on a Roboflow dataset.

Run from the road_damage/ folder:
    python fine_tune.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from _common import JobConfig, load_job_env, run_training  # noqa: E402

if __name__ == "__main__":
    load_job_env(Path(__file__).parent / ".env")
    run_training(JobConfig(category="road_damage", run_name="road_damage"))

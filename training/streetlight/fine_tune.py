"""Fine-tune a YOLOv8 streetlight detector on a Roboflow dataset.

Run from the streetlight/ folder:
    python fine_tune.py
"""
import sys
from pathlib import Path

# Make training/_common.py importable regardless of CWD.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from _common import JobConfig, load_job_env, run_training  # noqa: E402

if __name__ == "__main__":
    load_job_env(Path(__file__).parent / ".env")
    run_training(JobConfig(category="streetlight", run_name="streetlight"))

"""
Upload fine-tuned YOLOv8 weights to Roboflow so they're served by the
hosted inference API — the same endpoint the backend already calls.

After deployment, add the resulting slug to your backend .env:

    ROBOFLOW_MODELS=pothole:pothole-detection-yolov8/1,\\
                    garbage:garbage_detection-wvzwv/9,\\
                    streetlight:<your-workspace-project>/<version>

Run:
    python deploy_weights.py
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s | %(levelname)-5s | %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger("civiclens.deploy")

WEIGHTS = Path(__file__).parent / "runs" / "streetlight" / "weights" / "best.pt"


def _require(k: str) -> str:
    v = os.environ.get(k, "").strip()
    if not v:
        log.error("Missing env: %s", k); sys.exit(1)
    return v


def main() -> None:
    if not WEIGHTS.exists():
        log.error("No trained weights at %s — run fine_tune_streetlight.py first", WEIGHTS)
        sys.exit(1)

    from roboflow import Roboflow

    api_key   = _require("ROBOFLOW_API_KEY")
    workspace = _require("ROBOFLOW_WORKSPACE")
    project   = _require("ROBOFLOW_PROJECT")
    version   = int(os.environ.get("ROBOFLOW_DATASET_VERSION", "1"))

    log.info("Uploading %s -> %s/%s v%d", WEIGHTS, workspace, project, version)
    rf = Roboflow(api_key=api_key)
    ds_version = rf.workspace(workspace).project(project).version(version)

    # Roboflow's deploy() expects the parent folder that contains weights/best.pt
    weights_parent = WEIGHTS.parent.parent  # .../runs/streetlight
    ds_version.deploy(
        model_type="yolov8",
        model_path=str(weights_parent),
        filename="weights/best.pt",
    )

    slug = f"{project}/{version}"
    print("\n" + "=" * 70)
    print(f"  ✅  Deployed! Model slug: {slug}")
    print(f"  ▶️  Append to backend ROBOFLOW_MODELS:")
    print(f"          streetlight:{slug}")
    print("=" * 70)


if __name__ == "__main__":
    main()

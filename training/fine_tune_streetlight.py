"""
Fine-tune a YOLOv8 streetlight detector on a Roboflow dataset.

End-to-end flow:

    1. Download the labeled dataset from Roboflow (YOLOv8 format).
    2. Fine-tune YOLOv8n on top of the COCO-pretrained weights.
    3. Save the best checkpoint to  training/runs/streetlight/weights/best.pt

Run:
    cd training/
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env    # fill in ROBOFLOW_API_KEY, workspace, project
    python fine_tune_streetlight.py

Notes:
    * Works CPU-only (slow — expect 45–90 min for 50 epochs on a laptop).
    * On free Colab GPUs it's ~5–10 min. See training/README.md for the
      Colab one-cell recipe.
    * The trained weights are deployed back to Roboflow for hosted inference
      by running deploy_weights.py right after this script.
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env sitting next to this file
load_dotenv(Path(__file__).parent / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-5s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("civiclens.train")

RUN_NAME = "streetlight"
RUN_ROOT = Path(__file__).parent / "runs"


def _require_env(key: str) -> str:
    v = os.environ.get(key, "").strip()
    if not v:
        log.error("Missing required env var: %s (see training/.env.example)", key)
        sys.exit(1)
    return v


def download_dataset() -> Path:
    """Pull the streetlight dataset from Roboflow in YOLOv8 format."""
    from roboflow import Roboflow

    api_key   = _require_env("ROBOFLOW_API_KEY")
    workspace = _require_env("ROBOFLOW_WORKSPACE")
    project   = _require_env("ROBOFLOW_PROJECT")
    version   = int(os.environ.get("ROBOFLOW_DATASET_VERSION", "1"))

    log.info("Connecting to Roboflow workspace=%s project=%s v=%d",
             workspace, project, version)
    rf = Roboflow(api_key=api_key)
    proj = rf.workspace(workspace).project(project)
    ds = proj.version(version).download("yolov8", location=str(RUN_ROOT / "dataset"))

    data_yaml = Path(ds.location) / "data.yaml"
    if not data_yaml.exists():
        log.error("Roboflow download did not produce data.yaml at %s", data_yaml)
        sys.exit(1)
    log.info("Dataset ready at %s", data_yaml)
    return data_yaml


def train(data_yaml: Path) -> Path:
    """Fine-tune YOLOv8 on top of the COCO-pretrained weights."""
    from ultralytics import YOLO

    arch    = os.environ.get("MODEL_ARCH", "yolov8n.pt")
    epochs  = int(os.environ.get("EPOCHS", "50"))
    imgsz   = int(os.environ.get("IMG_SIZE", "640"))
    batch   = int(os.environ.get("BATCH_SIZE", "16"))

    log.info("Training %s for %d epochs @ imgsz=%d batch=%d",
             arch, epochs, imgsz, batch)

    model = YOLO(arch)
    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        project=str(RUN_ROOT),
        name=RUN_NAME,
        exist_ok=True,   # overwrite previous run
        patience=15,     # early-stop if no improvement
        verbose=True,
    )
    best_path = Path(results.save_dir) / "weights" / "best.pt"
    if not best_path.exists():
        log.error("Training finished but best.pt not found at %s", best_path)
        sys.exit(1)

    # Quick sanity metric dump for the log
    metrics = model.val(data=str(data_yaml))
    log.info(
        "Training complete — mAP50=%.3f mAP50-95=%.3f",
        float(metrics.box.map50), float(metrics.box.map),
    )
    log.info("Best weights: %s", best_path)
    return best_path


def main() -> None:
    RUN_ROOT.mkdir(parents=True, exist_ok=True)
    data_yaml = download_dataset()
    best = train(data_yaml)
    print("\n" + "=" * 70)
    print(f"  ✅  Best weights saved to: {best}")
    print(f"  ▶️  Next step:  python deploy_weights.py")
    print("=" * 70)


if __name__ == "__main__":
    main()

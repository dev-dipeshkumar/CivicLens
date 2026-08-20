"""
Shared training utilities — the download-train-deploy pipeline is identical
for every category, only the dataset/model slug and hyperparameters differ.

Each category folder (streetlight/, road_damage/, ...) just supplies a small
JobConfig via `run_training()` / `run_deploy()`.
"""

from __future__ import annotations

import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-5s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("civiclens.train")


@dataclass
class JobConfig:
    """Everything a category-specific training script needs to describe itself."""
    category: str          # normalized backend category, e.g. "streetlight"
    run_name: str          # subfolder under training/runs/, e.g. "streetlight"
    workspace_env: str = "ROBOFLOW_WORKSPACE"
    project_env:   str = "ROBOFLOW_PROJECT"
    version_env:   str = "ROBOFLOW_DATASET_VERSION"

    @property
    def run_dir(self) -> Path:
        # Sits at training/runs/<run_name>/  regardless of which subfolder called us.
        return Path(__file__).parent / "runs" / self.run_name

    @property
    def weights_path(self) -> Path:
        return self.run_dir / "weights" / "best.pt"


# --------------------------------------------------------------------------- #
# Env loading                                                                 #
# --------------------------------------------------------------------------- #

def load_job_env(env_file: Path) -> None:
    """Load the caller's .env sitting next to their script."""
    if env_file.exists():
        load_dotenv(env_file)
    # Also try the shared training/.env if it exists
    shared = Path(__file__).parent / ".env"
    if shared.exists():
        load_dotenv(shared, override=False)


def _require(key: str) -> str:
    v = os.environ.get(key, "").strip()
    if not v:
        log.error("Missing required env: %s — see %s.env.example", key, "")
        sys.exit(1)
    return v


# --------------------------------------------------------------------------- #
# Public entry points                                                         #
# --------------------------------------------------------------------------- #

def run_training(job: JobConfig) -> Path:
    """Download the dataset from Roboflow and fine-tune YOLOv8 on it."""
    from roboflow import Roboflow
    from ultralytics import YOLO

    api_key   = _require("ROBOFLOW_API_KEY")
    workspace = _require(job.workspace_env)
    project   = _require(job.project_env)
    version   = int(os.environ.get(job.version_env, "1"))

    arch    = os.environ.get("MODEL_ARCH", "yolov8n.pt")
    epochs  = int(os.environ.get("EPOCHS", "50"))
    imgsz   = int(os.environ.get("IMG_SIZE", "640"))
    batch   = int(os.environ.get("BATCH_SIZE", "16"))

    log.info("Downloading dataset workspace=%s project=%s v=%d", workspace, project, version)
    rf = Roboflow(api_key=api_key)
    ds = (rf.workspace(workspace).project(project).version(version)
            .download("yolov8", location=str(job.run_dir / "dataset")))
    data_yaml = Path(ds.location) / "data.yaml"
    if not data_yaml.exists():
        log.error("Roboflow download missing data.yaml at %s", data_yaml)
        sys.exit(1)

    log.info("Training %s for %d epochs @ imgsz=%d batch=%d", arch, epochs, imgsz, batch)
    model = YOLO(arch)
    results = model.train(
        data=str(data_yaml),
        epochs=epochs, imgsz=imgsz, batch=batch,
        project=str(job.run_dir.parent),      # -> training/runs/
        name=job.run_name,                    # -> training/runs/<run_name>/
        exist_ok=True, patience=15, verbose=True,
    )

    best = Path(results.save_dir) / "weights" / "best.pt"
    if not best.exists():
        log.error("best.pt not found at %s", best); sys.exit(1)

    metrics = model.val(data=str(data_yaml))
    log.info("Done — mAP50=%.3f mAP50-95=%.3f",
             float(metrics.box.map50), float(metrics.box.map))
    print("\n" + "=" * 70)
    print(f"  ✅  Best weights: {best}")
    print(f"  ▶️  Next:         python deploy.py")
    print("=" * 70)
    return best


def run_deploy(job: JobConfig) -> None:
    """Upload best.pt back to Roboflow hosted inference."""
    from roboflow import Roboflow

    weights = job.weights_path
    if not weights.exists():
        log.error("No trained weights at %s — run fine_tune.py first", weights)
        sys.exit(1)

    api_key   = _require("ROBOFLOW_API_KEY")
    workspace = _require(job.workspace_env)
    project   = _require(job.project_env)
    version   = int(os.environ.get(job.version_env, "1"))

    log.info("Uploading %s -> %s/%s v%d", weights, workspace, project, version)
    rf = Roboflow(api_key=api_key)
    ds_v = rf.workspace(workspace).project(project).version(version)
    ds_v.deploy(
        model_type="yolov8",
        model_path=str(weights.parent.parent),  # folder containing weights/best.pt
        filename="weights/best.pt",
    )

    slug = f"{project}/{version}"
    print("\n" + "=" * 70)
    print(f"  ✅  Deployed. Model slug: {slug}")
    print(f"  ▶️  Append to backend ROBOFLOW_MODELS:")
    print(f"          {job.category}:{slug}")
    print("=" * 70)

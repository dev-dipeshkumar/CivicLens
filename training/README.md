# Fine-tuning the streetlight detector

This folder contains the scripts to **fine-tune your own YOLOv8 streetlight
detector on Roboflow** and plug it into the CivicLens backend.

Why fine-tune? Two great public *datasets* exist (964 images labeled
Working/Nonworking/Flicker, and 619 images labeled Working/Not-Working),
but nobody has trained + deployed a hosted model from them yet.

- Dataset A (recommended, richer labels):
  https://universe.roboflow.com/pothole-fw8hn/street_light-0wrmn
- Dataset B (binary working/not-working):
  https://universe.roboflow.com/godspeed-yqpeo/damaged-lights

You pick one, fork it into your Roboflow workspace, and this pipeline does
the rest.

---

## Choose your path

### Path 1 · Roboflow Train (cloud, one click) — easiest

If you have Roboflow credits (starter tier includes 3 free trainings):

1. Sign in to https://app.roboflow.com.
2. Open one of the datasets above → **Fork** into your workspace.
   Rename it to `civiclens-streetlight` (or whatever) so the slug is memorable.
3. In your fork → **Versions → Generate New Version** (accept the default
   resize/augmentations).
4. On the version page click **Train with Roboflow → Fast** (~15 min).
5. When training finishes, the version page shows a model slug like
   `civiclens-streetlight/1`.
6. Add it to the backend `.env`:

   ```env
   AI_MODE=roboflow
   ROBOFLOW_API_KEY=rf_...
   ROBOFLOW_MODELS=pothole:pothole-detection-yolov8/1,garbage:garbage_detection-wvzwv/9,streetlight:civiclens-streetlight/1
   ```

Done. Skip to **Verifying** at the bottom.

---

### Path 2 · Local training + deploy (free, full control)

Uses the two scripts in this folder. No cloud training credits needed —
just a laptop CPU (slow, ~1 hr) or a free Colab GPU (~5 min).

**Prerequisites**

- Python 3.10+
- A Roboflow workspace with a forked streetlight dataset (steps 1–3 above)
- Your Roboflow **Private API key** — https://app.roboflow.com/settings/api

**Setup**

```bash
cd training
python -m venv .venv
source .venv/bin/activate               # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and fill in:
#   ROBOFLOW_API_KEY, ROBOFLOW_WORKSPACE, ROBOFLOW_PROJECT
```

**Train**

```bash
python fine_tune_streetlight.py
```

What it does:
1. Downloads your dataset version in YOLOv8 format
2. Fine-tunes `yolov8n.pt` (COCO-pretrained) on your labels
3. Saves the best checkpoint to `runs/streetlight/weights/best.pt`

Look for the final line printing `mAP50=...`. Anything above ~0.55 is
usable for a demo; above ~0.75 is genuinely good.

**Deploy to Roboflow hosted inference**

```bash
python deploy_weights.py
```

Uploads `best.pt` back to your Roboflow project version, so subsequent
calls to `https://serverless.roboflow.com/<slug>/<version>` return
predictions from *your* model.

The script prints the exact `ROBOFLOW_MODELS` fragment to append to your
backend `.env`.

---

### Path 3 · Google Colab (free GPU) — recommended if you don't have a GPU

Copy-paste this into a fresh Colab notebook (Runtime → Change runtime type → **GPU**):

```python
!pip -q install roboflow ultralytics
import os
os.environ["ROBOFLOW_API_KEY"] = "rf_...paste_your_key..."
os.environ["ROBOFLOW_WORKSPACE"] = "your-workspace"
os.environ["ROBOFLOW_PROJECT"]   = "civiclens-streetlight"
os.environ["ROBOFLOW_DATASET_VERSION"] = "1"
os.environ["EPOCHS"] = "60"

from roboflow import Roboflow
rf = Roboflow(api_key=os.environ["ROBOFLOW_API_KEY"])
ds = (rf.workspace(os.environ["ROBOFLOW_WORKSPACE"])
        .project(os.environ["ROBOFLOW_PROJECT"])
        .version(int(os.environ["ROBOFLOW_DATASET_VERSION"]))
        .download("yolov8"))

from ultralytics import YOLO
m = YOLO("yolov8n.pt")
m.train(data=f"{ds.location}/data.yaml", epochs=60, imgsz=640, batch=16)

# Deploy back to Roboflow
ds_v = (rf.workspace(os.environ["ROBOFLOW_WORKSPACE"])
          .project(os.environ["ROBOFLOW_PROJECT"])
          .version(int(os.environ["ROBOFLOW_DATASET_VERSION"])))
ds_v.deploy(model_type="yolov8",
            model_path="runs/detect/train",
            filename="weights/best.pt")
```

Total time on a Colab T4: **~5–8 minutes**.

---

## Verifying

Once your model is deployed and the backend `.env` includes the streetlight
entry, restart uvicorn and upload a streetlight photo through the citizen
wizard. In the backend logs you'll see:

```
ROBOFLOW civiclens-streetlight -> streetlight (Nonworking) conf=0.87 area=6.3%
```

meaning your fine-tuned model handled it. The severity engine automatically
routes any `streetlight` detection to the **Lighting** department.

---

## How class-name mapping works

Public streetlight datasets use various raw class names — the backend
already normalizes them:

| Raw class | Normalized category |
|---|---|
| `streetlight`, `street_light`, `Nonworking`, `Not Working`, `Flicker`, `broken_light`, `lamp` | `streetlight` |

If your dataset uses a class name that isn't yet in the map, add it to
`CLASS_MAP` in `backend/app/services/detection.py`.

---

## Cost / rate limits

- **Datasets** on Roboflow Universe are free (CC BY 4.0).
- **Hosted inference** on the serverless endpoint has a free monthly quota
  that's more than enough for a hackathon demo.
- **Roboflow Train** consumes credits — check your plan first, or use
  Path 2/3 which are 100% free.

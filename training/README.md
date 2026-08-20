# CivicLens AI — model training

Optional pipelines to fine-tune your own detectors on Roboflow. **Not needed
to run the app** — the backend ships with public models for pothole /
garbage / road_damage, and a deterministic mock covers streetlight when no
model is deployed.

## When to train

| Category | Public model available? | Recommended action |
|---|---|---|
| Pothole | ✅ `pothole-detection-yolov8/1` | Use as-is |
| Garbage | ✅ `garbage_detection-wvzwv/9` | Use as-is |
| Road damage | ✅ `road_defects-eif9i/9` | Use as-is, fine-tune only if you need local coverage |
| Streetlight | ❌ (only datasets, no deployed models) | **Fine-tune** — see [`streetlight/`](./streetlight/README.md) |

## Layout

```
training/
├── _common.py               # shared download → train → deploy logic
├── requirements.txt         # heavy deps live here, isolated from backend
├── streetlight/
│   ├── fine_tune.py
│   ├── deploy.py
│   ├── .env.example
│   └── README.md            # 3 recipes: Roboflow Train / local / Colab GPU
└── road_damage/
    ├── fine_tune.py
    ├── deploy.py
    ├── .env.example
    └── README.md
```

## Setup (once, for either category)

```bash
cd training
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # ~3 GB of PyTorch + Ultralytics
```

Then follow the README inside `streetlight/` or `road_damage/`.

## Plugging in a trained model

After `deploy.py` finishes, edit `backend/.env` and add or replace the
category's entry in `ROBOFLOW_MODELS`:

```env
ROBOFLOW_MODELS=pothole:pothole-detection-yolov8/1,\
                garbage:garbage_detection-wvzwv/9,\
                road_damage:my-workspace-road-damage/2,\
                streetlight:my-workspace-streetlight/1
```

Restart uvicorn and every upload now runs through 4 real detectors in
parallel. The strongest hit wins.

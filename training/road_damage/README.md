# Fine-tuning the road-damage detector

**Do you actually need this?** Probably not. There's already a strong public
Roboflow Universe model for road defects:

- `road_defects-eif9i/9` — 3,530 images, mAP ~0.8, classes:
  `alligator-crack, cracks, potholes, ruts`

It's already listed in the default `ROBOFLOW_MODELS` in `backend/.env.example`.
The backend normalizes every one of those class names into our `road_damage`
category, so you get real inference for free.

Fine-tune your own only if:

- The public model misses your local road textures (rural, monsoon-damaged, etc.)
- You want to add classes it doesn't cover (e.g. sinkholes, edge-erosion)
- You want full control over the model & data

---

## Quick recipes

Everything works the same way as the streetlight pipeline — see
[`../streetlight/README.md`](../streetlight/README.md) for the three paths
(**Roboflow Train**, **local**, **Colab**) with copy-paste snippets. Just
substitute this folder's `.env.example` and script paths.

### Datasets to fork

| Dataset | Images | Classes | Notes |
|---|---|---|---|
| [`road_defects-eif9i`](https://universe.roboflow.com/defect-road-detection/road_defects-eif9i) | 3,530 | alligator-crack, cracks, potholes, ruts | Best all-round — already deployed publicly, but you can fork + re-train on your city |
| [`road-damage-classification-drone`](https://universe.roboflow.com/syadil/road-damage-classification-drone) | 100 | Alligator/Longitudinal/Transverse/Pothole | Aerial imagery, mAP@50 92.7% |
| [`road-damage-dataset-8jvz5-zrjf5`](https://universe.roboflow.com/juris-drone/road-damage-dataset-8jvz5-zrjf5) | 4,915 | Pothole + crack types | Drone imagery |

### Setup + train + deploy

```bash
cd training
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cd road_damage
cp .env.example .env    # fill in ROBOFLOW_API_KEY, workspace, project

python fine_tune.py     # ~1 hr CPU / ~5 min Colab GPU
python deploy.py        # upload best.pt to Roboflow hosted inference
```

`deploy.py` prints the exact `ROBOFLOW_MODELS` fragment to append to
`backend/.env` — replace the default `road_damage:road_defects-eif9i/9`
with `road_damage:<your-slug>/<version>`.

---

## Class-name mapping

Every raw class name across every road-damage dataset is normalized by
`backend/app/services/detection.py`:

| Raw class | Normalized |
|---|---|
| `crack`, `cracks`, `alligator-crack`, `alligator_crack`, `longitudinal_crack`, `transverse_crack`, `lateral_crack`, `crack_alligator`, `crack_long`, `crack_trans`, `rut`, `ruts`, `D00`, `D10`, `D20`, `D40` | `road_damage` |
| `pothole`, `potholes` | `pothole` (still handled, but by pothole department) |

If your dataset uses a class name not on this list, add it to `CLASS_MAP` in
the backend.

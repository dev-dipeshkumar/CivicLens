"""Deploy the trained streetlight weights to Roboflow hosted inference."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from _common import JobConfig, load_job_env, run_deploy  # noqa: E402

if __name__ == "__main__":
    load_job_env(Path(__file__).parent / ".env")
    run_deploy(JobConfig(category="streetlight", run_name="streetlight"))

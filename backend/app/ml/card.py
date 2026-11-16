"""The trained model's test results, for the public stats page.

train.py writes ml/results.json (the canonical copy, next to EVAL.md) and this
package copy, because the API image contains only backend/. A test checks the two
never drift. No scikit-learn import here: the API runs without the ml extras.
"""

import json
from functools import cache
from pathlib import Path
from typing import Any

PUBLISHED_RESULTS = Path(__file__).with_name("results.json")


@cache
def load_results(path: Path = PUBLISHED_RESULTS) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None

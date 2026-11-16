"""Facts about tests/fixtures/repo.json, the repo most tests store their issues under."""

import json
from pathlib import Path

REPO_STARS: int = json.loads((Path(__file__).parent / "fixtures" / "repo.json").read_text())[
    "stargazers_count"
]

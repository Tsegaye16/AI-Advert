"""Test environment setup.

These must be applied before ``app`` is imported anywhere, because Settings is
cached with ``lru_cache`` at first access.
"""

import os
from pathlib import Path

os.environ.setdefault("DEMO_MODE", "true")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("B2_KEY_ID", "")
os.environ.setdefault("B2_APPLICATION_KEY", "")
# The limiter is exercised directly in test_rate_limit.py; leaving it on here
# would make unrelated tests fail once the suite grows past the write budget.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test-advault.db")

# A database left behind by a previous run carries stale rows and makes the
# suite order-dependent, so start from a clean file every session.
_url = os.environ["DATABASE_URL"]
if _url.startswith("sqlite") and ":memory:" not in _url:
    _path = Path(_url.split("///")[-1])
    if _path.exists():
        _path.unlink()

import pytest  # noqa: E402

from app.jobs.runner import reset_registry  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate_job_registry():
    """Each TestClient closes its event loop with demo runs still pending, so
    without this the in-process job registry leaks between tests."""
    reset_registry()
    yield
    reset_registry()

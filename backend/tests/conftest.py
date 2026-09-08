"""Test environment setup.

These must be applied before ``app`` is imported anywhere, because Settings is
cached with ``lru_cache`` at first access.
"""

import os

os.environ.setdefault("DEMO_MODE", "true")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("B2_KEY_ID", "")
os.environ.setdefault("B2_APPLICATION_KEY", "")
# The limiter is exercised directly in test_rate_limit.py; leaving it on here
# would make unrelated tests fail once the suite grows past the write budget.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test-advault.db")

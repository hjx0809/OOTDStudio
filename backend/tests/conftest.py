"""Test configuration. Environment must be set before importing the app."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

TEST_ROOT = Path(tempfile.mkdtemp(prefix="ootd-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_ROOT / 'test.db'}"
os.environ["UPLOAD_DIR"] = str(TEST_ROOT / "uploads")
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["ENVIRONMENT"] = "test"
os.environ["GEMINI_API_KEY"] = ""
os.environ["ENABLE_AI_IMAGES"] = "false"
os.environ["ALLOWED_ORIGINS"] = "http://testserver"

import pytest  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client

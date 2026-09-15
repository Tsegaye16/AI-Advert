"""The rate limiter is verified against a throwaway app so the shared suite
doesn't have to run inside its budget."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.middleware import RateLimitMiddleware, RequestContextMiddleware


def _app(*, requests: int = 3, write_requests: int = 2) -> FastAPI:
    app = FastAPI()
    app.add_middleware(
        RateLimitMiddleware,
        requests=requests,
        write_requests=write_requests,
        window_seconds=60,
    )
    app.add_middleware(RequestContextMiddleware)

    @app.get("/ping")
    def ping():
        return {"ok": True}

    @app.post("/write")
    def write():
        return {"ok": True}

    @app.get("/health")
    def health():
        return {"ok": True}

    return app


def test_reads_are_limited_after_the_budget():
    with TestClient(_app(requests=3)) as client:
        assert [client.get("/ping").status_code for _ in range(3)] == [200, 200, 200]
        blocked = client.get("/ping")
        assert blocked.status_code == 429
        assert blocked.headers["Retry-After"] == "60"
        assert "detail" in blocked.json()


def test_writes_have_a_tighter_budget():
    with TestClient(_app(requests=100, write_requests=2)) as client:
        assert client.post("/write").status_code == 200
        assert client.post("/write").status_code == 200
        assert client.post("/write").status_code == 429


def test_health_is_exempt():
    with TestClient(_app(requests=1)) as client:
        client.get("/ping")
        client.get("/ping")
        assert client.get("/health").status_code == 200


def test_forwarded_ip_partitions_clients():
    with TestClient(_app(requests=1)) as client:
        assert (
            client.get("/ping", headers={"X-Forwarded-For": "10.0.0.1"}).status_code
            == 200
        )
        assert (
            client.get("/ping", headers={"X-Forwarded-For": "10.0.0.2"}).status_code
            == 200
        )
        assert (
            client.get("/ping", headers={"X-Forwarded-For": "10.0.0.1"}).status_code
            == 429
        )

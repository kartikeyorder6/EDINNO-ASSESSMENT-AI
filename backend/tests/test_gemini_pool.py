import time
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.gemini_pool import GeminiKeyMetadata, GeminiKeyPool, gemini_pool

client = TestClient(app)


def test_sliding_window_rpm_limiting():
    """Verify that sliding window rate limiting limits traffic to 12 RPM per key."""
    meta = GeminiKeyMetadata("test_key_sample_123456789")
    t0 = time.time()

    # Initiate 12 requests at t0
    for _ in range(12):
        assert meta.is_eligible(t0, max_rpm=12) is True
        meta.record_start(t0)

    # 13th request at the same time must exceed the 12 RPM safety ceiling
    assert meta.current_rpm(t0) == 12
    assert meta.is_eligible(t0, max_rpm=12) is False

    # Soft ceiling at 14 still allows it if emergency fallback is needed
    assert meta.is_eligible(t0, max_rpm=14) is True

    # After 61 seconds, the oldest requests slide out of the rolling window
    t1 = t0 + 61.0
    assert meta.current_rpm(t1) == 0
    assert meta.is_eligible(t1, max_rpm=12) is True


def test_non_repeating_key_selection():
    """Verify that sequential calls never reuse the key from the previous response."""
    pool = GeminiKeyPool()
    test_keys = ["KEY_ALPHA_111111", "KEY_BETA_222222", "KEY_GAMMA_333333"]

    # Mock discover_keys
    pool.discover_keys = lambda: list(test_keys)
    for k in test_keys:
        pool._keys_meta[k] = GeminiKeyMetadata(k)

    # Response 1: Picks a key
    selected_1 = pool.select_best_keys(max_candidates=1)[0]
    pool.record_start(selected_1)
    pool.record_success(selected_1, latency_sec=4.0)
    assert pool._last_used_key == selected_1

    # Response 2: MUST NOT pick selected_1!
    selected_2 = pool.select_best_keys(max_candidates=1)[0]
    assert selected_2 != selected_1
    pool.record_start(selected_2)
    pool.record_success(selected_2, latency_sec=4.5)
    assert pool._last_used_key == selected_2

    # Response 3: MUST NOT pick selected_2!
    selected_3 = pool.select_best_keys(max_candidates=1)[0]
    assert selected_3 != selected_2
    pool.record_start(selected_3)
    pool.record_success(selected_3, latency_sec=3.8)
    assert pool._last_used_key == selected_3


def test_exponential_backoff_on_rate_limits():
    """Verify exponential backoff escalation: 60s -> 180s -> 3600s."""
    meta = GeminiKeyMetadata("test_key_cooldown_1234567")
    t0 = time.time()

    # 1st 429
    backoff_1 = meta.record_rate_limit(t0)
    assert backoff_1 == 60.0
    assert meta.cooldown_until == t0 + 60.0
    assert meta.is_eligible(t0 + 10) is False

    # 2nd 429
    t1 = t0 + 65.0
    backoff_2 = meta.record_rate_limit(t1)
    assert backoff_2 == 180.0
    assert meta.cooldown_until == t1 + 180.0

    # 3rd 429 (daily quota exhausted)
    t2 = t1 + 190.0
    backoff_3 = meta.record_rate_limit(t2)
    assert backoff_3 == 3600.0
    assert meta.cooldown_until == t2 + 3600.0

    # Successful call resets backoff
    meta.record_success(latency_sec=5.0)
    assert meta.consecutive_429_count == 0
    assert meta.cooldown_until == 0.0


def test_latency_aware_routing():
    """Verify that faster keys (lower EWMA latency) are prioritized over slower keys."""
    pool = GeminiKeyPool()
    fast_key = "KEY_FAST_RESPONSE_0001"
    slow_key = "KEY_SLOW_RESPONSE_0002"

    pool.discover_keys = lambda: [fast_key, slow_key]
    pool._keys_meta[fast_key] = GeminiKeyMetadata(fast_key)
    pool._keys_meta[slow_key] = GeminiKeyMetadata(slow_key)

    # Establish EWMA latencies
    pool._keys_meta[fast_key].ewma_latency_sec = 2.5
    pool._keys_meta[slow_key].ewma_latency_sec = 18.0

    # Both idle; fast_key should be selected first
    candidates = pool.select_best_keys(max_candidates=2)
    assert candidates[0] == fast_key
    assert candidates[1] == slow_key


def test_key_pool_telemetry_endpoint():
    """Verify GET /api/v1/system/key-pool telemetry schema and live stats."""
    resp = client.get("/api/v1/system/key-pool")
    assert resp.status_code == 200
    data = resp.json()

    assert "total_configured_keys" in data
    assert "healthy_keys" in data
    assert "cooling_keys" in data
    assert "pool_theoretical_rpm_capacity" in data
    assert "pool_safe_rpm_capacity" in data
    assert "keys" in data
    assert isinstance(data["keys"], list)

    if data["total_configured_keys"] > 0:
        first_key = data["keys"][0]
        assert "key_id" in first_key
        assert "status" in first_key
        assert "rpm_usage" in first_key
        assert "avg_latency_sec" in first_key
        assert "success_rate" in first_key

"""
gemini_pool.py - Enterprise-Grade Google Gemini API Key Pool & Rate-Limiter

Features:
1. Preemptive Sliding-Window Rate Limiting (12 RPM ceiling vs 15 RPM limit).
2. Latency-Aware Routing via Exponentially Weighted Moving Average (EWMA).
3. Exponential Failure Backoff (60s -> 180s -> 3600s).
4. Strict Non-Repeating Key Invariant (never reuses the last key consecutively).
5. Dynamic Key Hot-Reloading from .env and Settings.
6. Real-Time Telemetry and Health Metrics.
"""

import os
import re
import time
import threading
from collections import deque
from typing import Dict, List, Optional, Any, Set

from app.core.config import settings
from app.core.logging import logger


class GeminiKeyMetadata:
    """Tracks per-key health, sliding-window request rate, and latency metrics."""

    def __init__(self, key: str):
        self.key: str = key
        self.masked: str = f"{key[:8]}...{key[-4:]}" if len(key) > 12 else "***"
        self.request_timestamps: deque = deque()
        self.cooldown_until: float = 0.0
        self.consecutive_429_count: int = 0
        self.consecutive_503_count: int = 0
        self.total_requests: int = 0
        self.total_successes: int = 0
        self.total_failures: int = 0
        self.ewma_latency_sec: float = 8.0  # Assumed nominal baseline
        self.last_used_timestamp: float = 0.0
        self.last_error_reason: str = ""

    def clean_timestamps(self, now: float) -> None:
        """Evict timestamps older than 60 seconds (rolling 1-minute window)."""
        while self.request_timestamps and now - self.request_timestamps[0] > 60.0:
            self.request_timestamps.popleft()

    def current_rpm(self, now: float) -> int:
        """Returns the number of requests initiated within the last 60 seconds."""
        self.clean_timestamps(now)
        return len(self.request_timestamps)

    def is_eligible(self, now: float, max_rpm: int = 12) -> bool:
        """
        True if the key is not in cooldown and has not hit its preemptive RPM ceiling.
        Google allows 15 RPM on free tier; 12 RPM provides an active 20% safety margin.
        """
        if now < self.cooldown_until:
            return False
        return self.current_rpm(now) < max_rpm

    def record_start(self, now: float) -> None:
        """Records initiation of a request on this key."""
        self.request_timestamps.append(now)
        self.total_requests += 1
        self.last_used_timestamp = now

    def record_success(self, latency_sec: float) -> None:
        """Records successful response and updates latency via EWMA."""
        self.total_successes += 1
        self.consecutive_429_count = 0
        self.consecutive_503_count = 0
        self.cooldown_until = 0.0
        self.last_error_reason = ""
        # EWMA update: 70% historical, 30% recent observation
        self.ewma_latency_sec = round(0.7 * self.ewma_latency_sec + 0.3 * max(latency_sec, 0.1), 2)

    def record_rate_limit(self, now: float, reason: str = "HTTP 429 Quota Exceeded") -> float:
        """Applies exponential backoff on consecutive 429 quota exhaustion."""
        self.consecutive_429_count += 1
        self.total_failures += 1
        self.last_error_reason = reason

        if self.consecutive_429_count == 1:
            backoff = 60.0
        elif self.consecutive_429_count == 2:
            backoff = 180.0
        else:
            backoff = 3600.0  # Daily limit exceeded, isolate for 1 hour

        self.cooldown_until = now + backoff
        return backoff

    def record_high_demand(self, now: float, reason: str = "HTTP 503 High Demand") -> float:
        """Applies backoff for temporary server-side demand spikes."""
        self.consecutive_503_count += 1
        self.total_failures += 1
        self.last_error_reason = reason
        backoff = min(20.0 * (2 ** (self.consecutive_503_count - 1)), 120.0)
        self.cooldown_until = now + backoff
        return backoff

    def record_failure(self, now: float, reason: str = "Request Failed", backoff_sec: float = 25.0) -> float:
        """Applies cooldown for timeouts, connection drops, or other non-retryable failures."""
        self.total_failures += 1
        self.last_error_reason = reason
        self.cooldown_until = max(self.cooldown_until, now + backoff_sec)
        return backoff_sec

    def to_dict(self, now: float) -> Dict[str, Any]:
        """Telemetry snapshot for dashboards and observability."""
        rpm = self.current_rpm(now)
        in_cooldown = now < self.cooldown_until
        remaining_cd = max(0.0, round(self.cooldown_until - now, 1)) if in_cooldown else 0.0

        status = "HEALTHY"
        if in_cooldown:
            status = f"COOLDOWN ({remaining_cd}s)"
        elif rpm >= 12:
            status = "MAX_RPM_BUFFER"

        success_pct = round((self.total_successes / self.total_requests * 100), 1) if self.total_requests > 0 else 100.0

        return {
            "key_id": self.masked,
            "status": status,
            "rpm_usage": f"{rpm}/15 RPM",
            "active_cooldown_sec": remaining_cd,
            "avg_latency_sec": f"{self.ewma_latency_sec:.2f}s",
            "total_requests": self.total_requests,
            "total_successes": self.total_successes,
            "success_rate": f"{success_pct}%",
            "last_used_sec_ago": round(now - self.last_used_timestamp, 1) if self.last_used_timestamp > 0 else None,
            "last_error": self.last_error_reason or None,
        }


class GeminiKeyPool:
    """Manages the pool of Google Gemini API keys with thread-safety and enterprise policies."""

    def __init__(self):
        self._lock = threading.Lock()
        self._keys_meta: Dict[str, GeminiKeyMetadata] = {}
        self._last_used_key: Optional[str] = None

    def discover_keys(self) -> List[str]:
        """Discovers all keys dynamically from .env, settings, and environment."""
        keys: List[str] = []
        env_paths = [
            os.path.join(os.getcwd(), ".env"),
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"),
        ]
        for p in env_paths:
            if os.path.exists(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if line.startswith("GEMINI_API_KEY=") or line.startswith("GEMINI_API_KEYS="):
                                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                                for part in re.split(r"[\s,;]+", val):
                                    k = part.strip()
                                    if k and k not in keys:
                                        keys.append(k)
                except Exception:
                    pass

        for k in settings.get_gemini_api_keys():
            if k and k not in keys:
                keys.append(k)

        env_val = os.environ.get("GEMINI_API_KEY")
        if env_val:
            for part in re.split(r"[\s,;]+", env_val.strip()):
                k = part.strip()
                if k and k not in keys:
                    keys.append(k)

        # Synchronize metadata objects
        with self._lock:
            for k in keys:
                if k not in self._keys_meta:
                    self._keys_meta[k] = GeminiKeyMetadata(k)

        return keys

    def select_best_keys(
        self,
        max_candidates: int = 2,
        exclude_keys: Optional[Set[str]] = None
    ) -> List[str]:
        """
        Selects the optimal Gemini API keys for an upcoming request:
        1. Preemptively checks RPM (must be < 12 to avoid hitting Google's 15 RPM wall).
        2. Filters out any key in cooldown or in exclude_keys.
        3. Strictly excludes the key that was used in the immediately preceding response.
        4. Sorts candidates by:
           - Lowest current RPM (least loaded)
           - Lowest EWMA latency (fastest responding)
           - Oldest last-used timestamp (longest idle)
        5. If all keys exceed the 12 RPM buffer but are not in cooldown, allows up to 14 RPM before failing.
        6. If all keys are in cooldown, returns [] immediately (0 delay failover).
        """
        all_keys = self.discover_keys()
        if not all_keys:
            return []

        now = time.time()
        excluded = exclude_keys or set()
        with self._lock:
            # Step 1: Find keys strictly eligible under the 12 RPM safety buffer
            eligible = [
                k for k in all_keys
                if k not in excluded and self._keys_meta[k].is_eligible(now, max_rpm=12)
            ]

            # Step 2: Soft fallback: if all keys are at 12 RPM, allow up to 14 RPM if not in cooldown
            if not eligible:
                eligible = [
                    k for k in all_keys
                    if k not in excluded and self._keys_meta[k].is_eligible(now, max_rpm=14)
                ]

            if not eligible:
                logger.warning("All Gemini keys are currently at maximum RPM capacity, on cooldown, or excluded.")
                return []

            # Step 3: Non-repeating invariant: exclude previously used key if alternatives exist
            if len(eligible) > 1 and self._last_used_key in eligible:
                candidates = [k for k in eligible if k != self._last_used_key]
            else:
                candidates = list(eligible)

            # Step 4: Multi-objective sorting: lowest RPM first, lowest latency second, longest idle third
            candidates.sort(
                key=lambda k: (
                    self._keys_meta[k].current_rpm(now),
                    self._keys_meta[k].ewma_latency_sec,
                    self._keys_meta[k].last_used_timestamp,
                )
            )

            return candidates[:max_candidates]

    def record_start(self, key: str) -> None:
        """Records initiation of a request with this key."""
        now = time.time()
        with self._lock:
            if key in self._keys_meta:
                self._keys_meta[key].record_start(now)

    def record_success(self, key: str, latency_sec: float) -> None:
        """Records successful response and sets this key as last used."""
        with self._lock:
            self._last_used_key = key
            if key in self._keys_meta:
                self._keys_meta[key].record_success(latency_sec)

    def record_rate_limit(self, key: str, reason: str = "HTTP 429 Quota Exceeded") -> float:
        """Notifies the pool of an HTTP 429 quota exhaustion."""
        now = time.time()
        with self._lock:
            if key in self._keys_meta:
                backoff = self._keys_meta[key].record_rate_limit(now, reason)
                logger.warning(
                    f"Gemini key [{self._keys_meta[key].masked}] hit quota limit. "
                    f"Placed on exponential cooldown for {backoff:.0f}s."
                )
                return backoff
            return 60.0

    def record_high_demand(self, key: str, reason: str = "HTTP 503 High Demand") -> float:
        """Notifies the pool of an HTTP 503 high demand spike."""
        now = time.time()
        with self._lock:
            if key in self._keys_meta:
                backoff = self._keys_meta[key].record_high_demand(now, reason)
                logger.warning(
                    f"Gemini key [{self._keys_meta[key].masked}] hit high demand (503). "
                    f"Placed on cooldown for {backoff:.0f}s."
                )
                return backoff
            return 20.0

    def record_failure(self, key: str, reason: str = "Request Failed", backoff_sec: float = 25.0) -> float:
        """Notifies the pool of a request failure (e.g. timeout) to isolate key temporarily."""
        now = time.time()
        with self._lock:
            if key in self._keys_meta:
                backoff = self._keys_meta[key].record_failure(now, reason, backoff_sec)
                logger.warning(
                    f"Gemini key [{self._keys_meta[key].masked}] failed ({reason}). "
                    f"Placed on temporary cooldown for {backoff:.0f}s."
                )
                return backoff
            return backoff_sec

    def get_telemetry(self) -> Dict[str, Any]:
        """Provides full real-time telemetry snapshot of the key pool."""
        all_keys = self.discover_keys()
        now = time.time()
        with self._lock:
            meta_list = [self._keys_meta[k] for k in all_keys if k in self._keys_meta]
            healthy_count = sum(1 for m in meta_list if m.is_eligible(now, max_rpm=12))
            cooldown_count = sum(1 for m in meta_list if now < m.cooldown_until)
            total_reqs = sum(m.total_requests for m in meta_list)
            total_succ = sum(m.total_successes for m in meta_list)
            overall_success_pct = round((total_succ / total_reqs * 100), 1) if total_reqs > 0 else 100.0

            return {
                "total_configured_keys": len(all_keys),
                "healthy_keys": healthy_count,
                "cooling_keys": cooldown_count,
                "overall_success_rate": f"{overall_success_pct}%",
                "pool_theoretical_rpm_capacity": len(all_keys) * 15,
                "pool_safe_rpm_capacity": len(all_keys) * 12,
                "last_active_key": f"{self._last_used_key[:8]}...{self._last_used_key[-4:]}" if self._last_used_key else None,
                "keys": [m.to_dict(now) for m in meta_list],
            }


# Global singleton instance
gemini_pool = GeminiKeyPool()

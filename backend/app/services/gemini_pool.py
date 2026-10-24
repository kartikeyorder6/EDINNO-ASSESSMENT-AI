"""
gemini_pool.py - Thread-safe Google Gemini API key pool and rate limiter.

Features:
1. Preemptive sliding-window rate limiting (12 RPM ceiling vs Google's 15 RPM).
2. Latency-aware routing via an exponentially weighted moving average (EWMA).
3. Exponential failure backoff (60s -> 180s -> 3600s) for quota errors.
4. Non-repeating key invariant (avoids reusing the last key when others exist).
5. Hot-reloading of keys from .env (mtime-cached), settings and environment.
6. Real-time telemetry. Keys and upstream error text are always masked/redacted.
"""

from __future__ import annotations

import os
import re
import threading
import time
from collections import deque
from typing import Any, Deque, Dict, List, Optional, Set, Tuple

from app.core.config import settings
from app.core.logging import logger

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

GOOGLE_FREE_TIER_RPM = 15
SAFE_RPM = 12            # preferred ceiling (20% safety margin)
HARD_RPM = 14            # soft fallback ceiling when every key is at SAFE_RPM
RPM_WINDOW_SEC = 60.0
EWMA_BASELINE_SEC = 8.0
EWMA_RECENT_WEIGHT = 0.3
RATE_LIMIT_BACKOFFS_SEC = (60.0, 180.0, 3600.0)   # 1st, 2nd, 3rd+ consecutive 429
HIGH_DEMAND_BASE_SEC = 20.0
HIGH_DEMAND_MAX_SEC = 120.0
DEFAULT_FAILURE_BACKOFF_SEC = 25.0

_KEY_SPLIT_RE = re.compile(r"[\s,;]+")
_KEY_VALID_RE = re.compile(r"^[\x21-\x7e]+$")      # printable ASCII, no whitespace
_ENV_KEY_PREFIXES = ("GEMINI_API_KEY=", "GEMINI_API_KEYS=")

_SECRET_PATTERNS = (
    re.compile(r"(?:AIza[0-9A-Za-z_\-]{20,}|AQ\.[0-9A-Za-z_\-]{30,})"),
    re.compile(r"gsk_[0-9A-Za-z]{20,}"),
    re.compile(r"sk-or-[0-9A-Za-z_\-]{10,}"),
    re.compile(r"(?i)bearer\s+[0-9A-Za-z._\-]+"),
    re.compile(r"(?i)(api[_-]?key|key)=[^&\s\"']+"),
)


# ---------------------------------------------------------------------------
# Secret hygiene helpers (shared with the assessment service)
# ---------------------------------------------------------------------------

def mask_secret(value: Any) -> str:
    """Return a log-safe fingerprint of a secret (never the full value)."""
    text = str(value or "")
    return f"{text[:4]}...{text[-4:]}" if len(text) > 12 else "***"


def redact_secrets(text: Any, limit: int = 200) -> str:
    """Strip anything that looks like an API key/token and truncate for logging."""
    out = str(text or "")
    for pattern in _SECRET_PATTERNS:
        out = pattern.sub("[REDACTED]", out)
    return out[:limit]


# ---------------------------------------------------------------------------
# Per-key health metadata
# ---------------------------------------------------------------------------

class GeminiKeyMetadata:
    """Tracks per-key health, sliding-window request rate and latency metrics.

    Not thread-safe by itself; GeminiKeyPool serialises all access.
    """

    __slots__ = (
        "key", "masked", "request_timestamps", "cooldown_until",
        "consecutive_429_count", "consecutive_503_count", "total_requests",
        "total_successes", "total_failures", "ewma_latency_sec",
        "last_used_timestamp", "last_error_reason",
    )

    def __init__(self, key: str):
        self.key: str = key
        self.masked: str = mask_secret(key)
        self.request_timestamps: Deque[float] = deque()
        self.cooldown_until: float = 0.0
        self.consecutive_429_count: int = 0
        self.consecutive_503_count: int = 0
        self.total_requests: int = 0
        self.total_successes: int = 0
        self.total_failures: int = 0
        self.ewma_latency_sec: float = EWMA_BASELINE_SEC
        self.last_used_timestamp: Optional[float] = None
        self.last_error_reason: str = ""

    def clean_timestamps(self, now: float) -> None:
        """Evict timestamps older than the rolling window."""
        stamps = self.request_timestamps
        while stamps and now - stamps[0] > RPM_WINDOW_SEC:
            stamps.popleft()

    def current_rpm(self, now: float) -> int:
        self.clean_timestamps(now)
        return len(self.request_timestamps)

    def in_cooldown(self, now: float) -> bool:
        return now < self.cooldown_until

    def is_eligible(self, now: float, max_rpm: int = SAFE_RPM) -> bool:
        """True if not cooling down and below the given RPM ceiling."""
        return not self.in_cooldown(now) and self.current_rpm(now) < max_rpm

    def record_start(self, now: float) -> None:
        self.request_timestamps.append(now)
        self.total_requests += 1
        self.last_used_timestamp = now

    def record_success(self, latency_sec: float) -> None:
        self.total_successes += 1
        self.consecutive_429_count = 0
        self.consecutive_503_count = 0
        self.cooldown_until = 0.0
        self.last_error_reason = ""
        self.ewma_latency_sec = round(
            (1 - EWMA_RECENT_WEIGHT) * self.ewma_latency_sec
            + EWMA_RECENT_WEIGHT * max(latency_sec, 0.1),
            2,
        )

    def _fail(self, reason: str) -> None:
        self.total_failures += 1
        self.last_error_reason = redact_secrets(reason, 160)

    def record_rate_limit(self, now: float, reason: str = "HTTP 429 Quota Exceeded") -> float:
        """Exponential backoff on consecutive 429s (3rd+ means daily quota: 1 hour)."""
        self.consecutive_429_count += 1
        self._fail(reason)
        idx = min(self.consecutive_429_count, len(RATE_LIMIT_BACKOFFS_SEC)) - 1
        backoff = RATE_LIMIT_BACKOFFS_SEC[idx]
        self.cooldown_until = now + backoff
        return backoff

    def record_high_demand(self, now: float, reason: str = "HTTP 503 High Demand") -> float:
        """Backoff for temporary server-side demand spikes."""
        self.consecutive_503_count += 1
        self._fail(reason)
        backoff = min(
            HIGH_DEMAND_BASE_SEC * (2 ** (self.consecutive_503_count - 1)),
            HIGH_DEMAND_MAX_SEC,
        )
        self.cooldown_until = now + backoff
        return backoff

    def record_failure(
        self,
        now: float,
        reason: str = "Request Failed",
        backoff_sec: float = DEFAULT_FAILURE_BACKOFF_SEC,
    ) -> float:
        """Cooldown for timeouts, connection drops and other failures."""
        self._fail(reason)
        self.cooldown_until = max(self.cooldown_until, now + backoff_sec)
        return backoff_sec

    def to_dict(self, now: float) -> Dict[str, Any]:
        rpm = self.current_rpm(now)
        cooling = self.in_cooldown(now)
        remaining = max(0.0, round(self.cooldown_until - now, 1)) if cooling else 0.0

        if cooling:
            status = f"COOLDOWN ({remaining}s)"
        elif rpm >= SAFE_RPM:
            status = "MAX_RPM_BUFFER"
        else:
            status = "HEALTHY"

        success_pct = (
            round(self.total_successes / self.total_requests * 100, 1)
            if self.total_requests > 0 else 100.0
        )
        return {
            "key_id": self.masked,
            "status": status,
            "rpm_usage": f"{rpm}/{GOOGLE_FREE_TIER_RPM} RPM",
            "active_cooldown_sec": remaining,
            "avg_latency_sec": f"{self.ewma_latency_sec:.2f}s",
            "total_requests": self.total_requests,
            "total_successes": self.total_successes,
            "success_rate": f"{success_pct}%",
            "last_used_sec_ago": (
                round(now - self.last_used_timestamp, 1)
                if self.last_used_timestamp is not None else None
            ),
            "last_error": self.last_error_reason or None,
        }


# ---------------------------------------------------------------------------
# Pool
# ---------------------------------------------------------------------------

class GeminiKeyPool:
    """Thread-safe pool of Gemini API keys with rate limiting and failover."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._keys_meta: Dict[str, GeminiKeyMetadata] = {}
        self._last_used_key: Optional[str] = None
        # path -> ((mtime_ns, size), parsed keys); avoids re-reading .env per request
        self._env_cache: Dict[str, Tuple[Tuple[int, int], List[str]]] = {}
        self._settings_error_logged = False

    # -- key discovery ------------------------------------------------------

    @staticmethod
    def _extract_keys(raw: str) -> List[str]:
        keys: List[str] = []
        for part in _KEY_SPLIT_RE.split(str(raw or "").strip().strip('"').strip("'")):
            candidate = part.strip().strip('"').strip("'")
            if candidate and _KEY_VALID_RE.match(candidate):
                keys.append(candidate)
        return keys

    @staticmethod
    def _env_paths() -> List[str]:
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        paths = [os.path.join(os.getcwd(), ".env"), os.path.join(project_root, ".env")]
        return list(dict.fromkeys(paths))

    def _read_env_keys(self, path: str) -> List[str]:
        try:
            st = os.stat(path)
        except OSError:
            with self._lock:
                self._env_cache.pop(path, None)
            return []

        signature = (st.st_mtime_ns, st.st_size)
        with self._lock:
            cached = self._env_cache.get(path)
            if cached and cached[0] == signature:
                return cached[1]

        keys: List[str] = []
        try:
            with open(path, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line.startswith("export "):
                        line = line[7:].lstrip()
                    if line.startswith("#"):
                        continue
                    if "=" in line:
                        prefix, val = line.split("=", 1)
                        if prefix.strip() in ("GEMINI_API_KEY", "GEMINI_API_KEYS"):
                            keys.extend(self._extract_keys(val))
        except (OSError, UnicodeDecodeError) as exc:
            logger.warning("Could not read env file for Gemini keys (%s).", type(exc).__name__)
            return []

        with self._lock:
            self._env_cache[path] = (signature, keys)
        return keys

    def discover_keys(self) -> List[str]:
        """Discover all keys from .env files, settings and the environment (deduplicated)."""
        ordered: Dict[str, None] = {}

        for path in self._env_paths():
            for k in self._read_env_keys(path):
                ordered.setdefault(k)

        try:
            for k in settings.get_gemini_api_keys() or []:
                ordered.setdefault(str(k).strip()) if k and _KEY_VALID_RE.match(str(k).strip()) else None
        except Exception as exc:  # settings must never break key discovery
            if not self._settings_error_logged:
                logger.warning("settings.get_gemini_api_keys() failed (%s).", type(exc).__name__)
                self._settings_error_logged = True

        for k in self._extract_keys(os.environ.get("GEMINI_API_KEY", "")):
            ordered.setdefault(k)

        keys = list(ordered)
        key_set = set(keys)
        with self._lock:
            for k in keys:
                self._keys_meta.setdefault(k, GeminiKeyMetadata(k))
            for stale in [k for k in self._keys_meta if k not in key_set]:
                del self._keys_meta[stale]    # drop rotated/removed keys from memory
        return keys

    def _meta(self, key: str) -> GeminiKeyMetadata:
        """Caller must hold self._lock."""
        meta = self._keys_meta.get(key)
        if meta is None:
            meta = self._keys_meta[key] = GeminiKeyMetadata(key)
        return meta

    # -- selection ----------------------------------------------------------

    def select_best_keys(
        self,
        max_candidates: int = 2,
        exclude_keys: Optional[Set[str]] = None,
    ) -> List[str]:
        """
        Pick the best keys for the next request:
        1. Eligible = not cooling down, not excluded, below SAFE_RPM (soft fallback: HARD_RPM).
        2. Avoid the key used by the previous successful request when alternatives exist.
        3. Sort by lowest RPM, lowest EWMA latency, longest idle.
        Returns [] immediately when nothing is eligible (zero-delay failover).
        """
        all_keys = self.discover_keys()
        if not all_keys:
            return []

        excluded = exclude_keys or set()
        now = time.time()

        with self._lock:
            pool = [k for k in all_keys if k not in excluded]
            eligible = [k for k in pool if self._meta(k).is_eligible(now, SAFE_RPM)]
            if not eligible:
                eligible = [k for k in pool if self._meta(k).is_eligible(now, HARD_RPM)]
            if not eligible:
                logger.warning("All Gemini keys are at max RPM capacity, on cooldown, or excluded.")
                return []

            if len(eligible) > 1 and self._last_used_key in eligible:
                eligible = [k for k in eligible if k != self._last_used_key]

            eligible.sort(key=lambda k: (
                self._meta(k).current_rpm(now),
                self._meta(k).ewma_latency_sec,
                self._meta(k).last_used_timestamp or 0.0,
            ))
            return eligible[:max(1, max_candidates)]

    # -- outcome recording --------------------------------------------------
    # Unknown keys (e.g. a caller-supplied key) are ignored so they never enter the pool.

    def record_start(self, key: str, now: Optional[float] = None) -> None:
        ts = time.time() if now is None else now
        with self._lock:
            if key in self._keys_meta:
                self._keys_meta[key].record_start(ts)

    def record_success(self, key: str, latency_sec: float) -> None:
        with self._lock:
            if key in self._keys_meta:
                self._last_used_key = key
                self._keys_meta[key].record_success(latency_sec)

    def record_rate_limit(self, key: str, reason: str = "HTTP 429 Quota Exceeded", now: Optional[float] = None) -> float:
        ts = time.time() if now is None else now
        with self._lock:
            meta = self._keys_meta.get(key)
            if meta is None:
                return RATE_LIMIT_BACKOFFS_SEC[0]
            backoff = meta.record_rate_limit(ts, reason)
            logger.warning("Gemini key [%s] hit quota limit. Cooldown %.0fs.", meta.masked, backoff)
            return backoff

    def record_high_demand(self, key: str, reason: str = "HTTP 503 High Demand", now: Optional[float] = None) -> float:
        ts = time.time() if now is None else now
        with self._lock:
            meta = self._keys_meta.get(key)
            if meta is None:
                return HIGH_DEMAND_BASE_SEC
            backoff = meta.record_high_demand(ts, reason)
            logger.warning("Gemini key [%s] hit high demand (503). Cooldown %.0fs.", meta.masked, backoff)
            return backoff

    def record_failure(
        self,
        key: str,
        reason: str = "Request Failed",
        backoff_sec: float = DEFAULT_FAILURE_BACKOFF_SEC,
        now: Optional[float] = None,
    ) -> float:
        ts = time.time() if now is None else now
        with self._lock:
            meta = self._keys_meta.get(key)
            if meta is None:
                return backoff_sec
            backoff = meta.record_failure(ts, reason, backoff_sec)
            logger.warning(
                "Gemini key [%s] failed (%s). Cooldown %.0fs.",
                meta.masked, redact_secrets(reason, 80), backoff,
            )
            return backoff

    # -- telemetry ----------------------------------------------------------

    def get_telemetry(self) -> Dict[str, Any]:
        all_keys = self.discover_keys()
        now = time.time()
        with self._lock:
            metas = [self._keys_meta[k] for k in all_keys if k in self._keys_meta]
            healthy = sum(1 for m in metas if m.is_eligible(now, SAFE_RPM))
            cooling = sum(1 for m in metas if m.in_cooldown(now))
            total_reqs = sum(m.total_requests for m in metas)
            total_ok = sum(m.total_successes for m in metas)
            success_pct = round(total_ok / total_reqs * 100, 1) if total_reqs else 100.0
            return {
                "total_configured_keys": len(all_keys),
                "healthy_keys": healthy,
                "cooling_keys": cooling,
                "overall_success_rate": f"{success_pct}%",
                "pool_theoretical_rpm_capacity": len(all_keys) * GOOGLE_FREE_TIER_RPM,
                "pool_safe_rpm_capacity": len(all_keys) * SAFE_RPM,
                "last_active_key": mask_secret(self._last_used_key) if self._last_used_key else None,
                "keys": [m.to_dict(now) for m in metas],
            }


# Global singleton instance
gemini_pool = GeminiKeyPool()
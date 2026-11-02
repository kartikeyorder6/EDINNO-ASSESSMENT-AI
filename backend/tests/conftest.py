import pytest


@pytest.fixture(autouse=True)
def prevent_slow_network_cascade_in_unit_tests(monkeypatch, request):
    """
    REA CI Tests Optimization:
    Prevent unit and contract test suites from cascading into 60-second live network timeouts
    when external cloud APIs (Gemini/Groq/OpenRouter) throttle or hit free-tier quotas.
    Direct live provider integration tests in test_llm_providers.py make direct requests.post
    calls and remain independent.
    """
    if "live_ai" in request.keywords:
        return

    # Fast deterministic fallback in unit tests
    monkeypatch.setattr("app.services.ai_generator._PROVIDERS", ())

    # Ensure google_drive_service tests use deterministic fast in-memory mock when not explicitly live
    if "live_drive" not in request.keywords:
        from app.services.google_drive_service import google_drive_service
        monkeypatch.setattr(google_drive_service, "_service", None)
        monkeypatch.setattr(google_drive_service, "_workspace_root_id", "edinno_workspace_root")

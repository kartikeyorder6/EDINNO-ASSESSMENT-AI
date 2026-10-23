import pytest
import re
import json
import requests
from app.core.config import settings


def clean_and_parse_json(raw: str):
    text = raw.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if m:
        text = m.group(1).strip()
    s = text.find("{")
    e = text.rfind("}")
    if s != -1 and e != -1:
        text = text[s:e+1]
    return json.loads(text)


def test_gemini_3_6_flash():
    gemini_key = settings.gemini_api_keys[0] if settings.gemini_api_keys else settings.GEMINI_API_KEY
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={gemini_key}"
    res = requests.post(url, json={
        "contents": [{"parts": [{"text": "Return JSON {\"status\": \"ok\", \"provider\": \"gemini\"}"}]}],
        "generationConfig": {"response_mime_type": "application/json"}
    }, timeout=30)
    assert res.status_code in [200, 429, 503]
    if res.status_code == 200:
        data = clean_and_parse_json(res.json()["candidates"][0]["content"]["parts"][0]["text"])
        assert data["status"] == "ok"


def test_groq():
    url = "https://api.groq.com/openai/v1/chat/completions"
    res = requests.post(url, headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"}, json={
        "model": settings.GROQ_MODEL,
        "messages": [{"role": "user", "content": "Return JSON {\"status\": \"ok\", \"provider\": \"groq\"}"}],
        "response_format": {"type": "json_object"}
    }, timeout=30)
    assert res.status_code in [200, 429]
    if res.status_code == 200:
        data = clean_and_parse_json(res.json()["choices"][0]["message"]["content"])
        assert data["status"] == "ok"


def test_openrouter():
    url = "https://openrouter.ai/api/v1/chat/completions"
    res = requests.post(url, headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"}, json={
        "model": settings.OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": "Return JSON {\"status\": \"ok\", \"provider\": \"openrouter\"}"}],
    }, timeout=30)
    assert res.status_code in [200, 429]
    if res.status_code == 200:
        data = clean_and_parse_json(res.json()["choices"][0]["message"]["content"])
        assert data["status"] == "ok"

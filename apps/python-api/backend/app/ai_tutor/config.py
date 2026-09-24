"""Runtime configuration for the AI Tutor engine.

The provider key lives in the backend environment only (never in the React
client). `.env` files next to the API and at the repo root are loaded on start
so a key dropped into `apps/python-api/.env` takes effect without exporting
variables by hand.
"""
from __future__ import annotations

import os
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[3]
REPO_ROOT = APP_ROOT.parent.parent
ENV_FILES = (APP_ROOT / '.env', REPO_ROOT / '.env')

PROVIDER_DEFAULTS = {
    'openai': {'base_url': 'https://api.openai.com/v1', 'model': 'gpt-4o-mini', 'keys': ('OPENAI_API_KEY',)},
    'deepseek': {'base_url': 'https://api.deepseek.com/v1', 'model': 'deepseek-chat', 'keys': ('DEEPSEEK_API_KEY',)},
    'openrouter': {'base_url': 'https://openrouter.ai/api/v1', 'model': 'openai/gpt-4o-mini', 'keys': ('OPENROUTER_API_KEY',)},
    'groq': {'base_url': 'https://api.groq.com/openai/v1', 'model': 'llama-3.3-70b-versatile', 'keys': ('GROQ_API_KEY',)},
    'mistral': {'base_url': 'https://api.mistral.ai/v1', 'model': 'mistral-large-latest', 'keys': ('MISTRAL_API_KEY',)},
    'together': {'base_url': 'https://api.together.xyz/v1', 'model': 'meta-llama/Llama-3.3-70B-Instruct-Turbo', 'keys': ('TOGETHER_API_KEY',)},
    'xai': {'base_url': 'https://api.x.ai/v1', 'model': 'grok-2-latest', 'keys': ('XAI_API_KEY',)},
    # Local runtimes answer without a key: the engine only needs the base URL.
    'ollama': {'base_url': 'http://127.0.0.1:11434/v1', 'model': 'llama3.1', 'keys': (), 'keyless': True},
    'lmstudio': {'base_url': 'http://127.0.0.1:1234/v1', 'model': 'local-model', 'keys': (), 'keyless': True},
    'custom': {'base_url': 'http://127.0.0.1:8000/v1', 'model': 'local-model', 'keys': (), 'keyless': True},
}


def parse_env_file(path: Path) -> dict[str, str]:
    """Minimal `.env` reader: KEY=VALUE lines, `#` comments, optional quotes."""
    values: dict[str, str] = {}
    try:
        raw = path.read_text(encoding='utf-8')
    except OSError:
        return values
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        if line.lower().startswith('export '):
            line = line[7:].strip()
        key, _, value = line.partition('=')
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value
    return values


def dotenv_disabled(environ=None) -> bool:
    """True when `STUDYHUB_NO_DOTENV=1` — used by the test suite to stay offline."""
    environ = os.environ if environ is None else environ
    return (environ.get('STUDYHUB_NO_DOTENV') or '').strip().lower() not in ('', '0', 'false', 'no')


def load_env(paths=ENV_FILES, *, environ=None, override: bool = False) -> dict[str, str]:
    """Load the first `.env` found; real environment variables always win.

    Handing explicit `paths` always reads them; the default lookup is skipped
    when `STUDYHUB_NO_DOTENV` is set so tests never pick up a developer's real
    provider key and start calling a paid model.
    """
    environ = os.environ if environ is None else environ
    if paths is ENV_FILES and dotenv_disabled(environ):
        return {}
    loaded: dict[str, str] = {}
    for path in paths:
        values = parse_env_file(Path(path))
        if not values:
            continue
        for key, value in values.items():
            if override or not environ.get(key):
                environ[key] = value
                loaded[key] = value
        break
    return loaded


def explicit_settings(environ=None) -> dict:
    """Settings taken from STUDYHUB_AI_* variables, provider name included."""
    environ = os.environ if environ is None else environ
    provider = (environ.get('STUDYHUB_AI_PROVIDER') or '').strip().lower()
    api_key = (environ.get('STUDYHUB_AI_API_KEY') or '').strip()
    base_url = (environ.get('STUDYHUB_AI_BASE_URL') or '').strip()
    model = (environ.get('STUDYHUB_AI_MODEL') or '').strip()
    return {'provider': provider, 'api_key': api_key, 'base_url': base_url, 'model': model}


def _first_key(spec: dict, environ) -> str:
    for name in spec.get('keys', ()):
        value = (environ.get(name) or '').strip()
        if value:
            return value
    return ''


def detect_provider(environ=None) -> tuple[str, str]:
    """Provider name plus key found in the environment (explicit name first)."""
    environ = os.environ if environ is None else environ
    explicit = explicit_settings(environ)
    if explicit['provider'] and explicit['provider'] not in ('local', 'none', 'off'):
        spec = PROVIDER_DEFAULTS.get(explicit['provider'], {})
        key = explicit['api_key'] or _first_key(spec, environ)
        return explicit['provider'], key
    for name, spec in PROVIDER_DEFAULTS.items():
        key = _first_key(spec, environ)
        if key:
            return name, key
    if explicit['api_key']:
        return 'custom', explicit['api_key']
    return 'local', ''


def provider_settings(environ=None) -> dict | None:
    """Resolved provider settings, or None when the tutor must run offline."""
    environ = os.environ if environ is None else environ
    explicit = explicit_settings(environ)
    name, api_key = detect_provider(environ)
    if name == 'local':
        return None
    spec = dict(PROVIDER_DEFAULTS.get(name, {}))
    base_url = explicit['base_url'] or spec.get('base_url') or ''
    model = explicit['model'] or spec.get('model') or 'gpt-4o-mini'
    if not base_url:
        return None
    if not api_key and not spec.get('keyless'):
        return None
    return {'provider': name, 'api_key': api_key, 'base_url': base_url, 'model': model}


def engine_status(environ=None) -> dict:
    """Client-safe description of the active engine: never exposes the key."""
    settings = provider_settings(environ)
    if not settings:
        return {'engine': 'local', 'provider': None, 'model': None,
                'label': 'Nova offline (bám theo tài liệu của bạn)',
                'hint': 'Đặt API key vào apps/python-api/.env rồi chạy lại backend để Nova dùng mô hình AI.'}
    return {'engine': 'provider', 'provider': settings['provider'], 'model': settings['model'],
            'label': f"Nova AI · {settings['provider']} · {settings['model']}",
            'hint': ''}

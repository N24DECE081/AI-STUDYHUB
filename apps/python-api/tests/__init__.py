"""Test bootstrap: the suite must never touch the developer's real provider key.

Importing this package (unittest discovery does it before any test module) sets
`STUDYHUB_NO_DOTENV` so `.env` is not loaded, and removes provider variables that
may be exported in the shell. Tests that need a provider set their own values
explicitly (see `ProviderWiringTests` in `test_ai_tutor_answers.py`), which still
works: only the `.env` lookup is disabled.
"""
import os

os.environ['STUDYHUB_NO_DOTENV'] = '1'

for _name in (
    'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY',
    'MISTRAL_API_KEY', 'TOGETHER_API_KEY', 'XAI_API_KEY', 'ANTHROPIC_API_KEY',
    'STUDYHUB_AI_PROVIDER', 'STUDYHUB_AI_API_KEY', 'STUDYHUB_AI_BASE_URL', 'STUDYHUB_AI_MODEL',
):
    os.environ.pop(_name, None)

"""Bounded, auditable tools used by Nova's agentic reasoning layer."""
from __future__ import annotations

import ast
import json
import operator
import re
import time
import urllib.parse
import urllib.request

from . import config

_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
        ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod, ast.Pow: operator.pow, ast.USub: operator.neg,
        ast.UAdd: operator.pos}


def _evaluate(node):
    if isinstance(node, ast.Expression):
        return _evaluate(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        left, right = _evaluate(node.left), _evaluate(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > 12:
            raise ValueError('exponent too large')
        return _OPS[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_evaluate(node.operand))
    raise ValueError('unsupported expression')


def safe_calculate(expression: str):
    expression = str(expression or '').strip()[:200]
    if not re.fullmatch(r'[\d\s+\-*/().%]+', expression):
        raise ValueError('not a safe arithmetic expression')
    return _evaluate(ast.parse(expression, mode='eval'))


def web_search(query: str, retries: int = 3) -> list[dict]:
    """Read-only search through the public Vietnamese Wikipedia API."""
    params = urllib.parse.urlencode({'action': 'query', 'list': 'search', 'srsearch': query[:200],
                                     'utf8': 1, 'format': 'json', 'srlimit': 3})
    request = urllib.request.Request(
        f'https://vi.wikipedia.org/w/api.php?{params}',
        headers={'User-Agent': 'AI-StudyHub/1.0 (educational tutor)'},
    )
    last_error = None
    for attempt in range(max(1, min(3, retries))):
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                payload = json.loads(response.read().decode('utf-8'))
            results = []
            for item in (payload.get('query') or {}).get('search') or []:
                title = str(item.get('title') or '')
                snippet = re.sub(r'<[^>]+>', '', str(item.get('snippet') or ''))
                results.append({'title': title, 'snippet': snippet,
                                'url': f'https://vi.wikipedia.org/wiki/{urllib.parse.quote(title.replace(" ", "_"))}'})
            return results
        except Exception as error:
            last_error = error
            if attempt < retries - 1:
                time.sleep(0.1 * (attempt + 1))
    raise RuntimeError(f'web_search failed after {retries} attempts: {last_error}')


def run(question: str, context: str) -> tuple[str, list[dict], list[dict]]:
    """Plan and execute only explicitly requested, read-only tools."""
    settings = config.yaml_settings('agents')
    chat = (settings.get('capabilities') or {}).get('chat') or {}
    tools = chat.get('tools') or {}
    try:
        max_calls = max(1, min(10, int(chat.get('max_tool_calls') or 10)))
    except (TypeError, ValueError):
        max_calls = 10
    calls = 0
    trace, sources = [], []
    lowered = str(question or '').lower()
    expression = re.sub(r'[^\d+\-*/().%]', '', question or '')
    if (tools.get('exec') or {}).get('enabled', False) and any(token in lowered for token in ('tính ', 'calculate ')) and expression:
        if calls >= max_calls:
            trace.append({'tool': 'exec', 'status': 'skipped', 'reason': 'tool_call_budget_exhausted'})
        else:
            calls += 1
            try:
                value = safe_calculate(expression)
                context = f'{context}\n\nKết quả công cụ tính toán: {expression} = {value}'.strip()
                trace.append({'tool': 'exec', 'status': 'ok', 'attempts': 1})
            except (ValueError, SyntaxError, ZeroDivisionError, OverflowError) as error:
                trace.append({'tool': 'exec', 'status': 'error', 'error': str(error)[:160]})
    wants_web = any(token in lowered for token in ('tìm trên web', 'tra cứu web', 'tìm internet', 'search web'))
    if wants_web and (tools.get('web_search') or {}).get('enabled', False):
        if calls >= max_calls:
            trace.append({'tool': 'web_search', 'status': 'skipped', 'reason': 'tool_call_budget_exhausted'})
        else:
            calls += 1
            query = re.sub(r'(?i)tìm trên web|tra cứu web|tìm internet|search web', '', question).strip() or question
            try:
                retries=int((tools.get('web_search') or {}).get('max_retries') or 3)
                results = web_search(query,retries=max(1,min(3,retries)))
                if results:
                    blocks = [f"{item['title']}: {item['snippet']} ({item['url']})" for item in results]
                    context = f'{context}\n\nKết quả web:\n' + '\n'.join(blocks)
                    sources.extend({'title': item['title'], 'url': item['url'], 'type': 'web'} for item in results)
                trace.append({'tool': 'web_search', 'status': 'ok', 'attempts': 1, 'results': len(results)})
            except RuntimeError as error:
                trace.append({'tool': 'web_search', 'status': 'error', 'attempts': max(1,min(3,retries)), 'error': str(error)[:160]})
    if context and (tools.get('rag') or {}).get('enabled', True):
        if calls < max_calls:
            trace.insert(0, {'tool': 'rag', 'status': 'ok', 'attempts': 1})
        else:
            trace.insert(0, {'tool': 'rag', 'status': 'skipped', 'reason': 'tool_call_budget_exhausted'})
    return context, sources, trace

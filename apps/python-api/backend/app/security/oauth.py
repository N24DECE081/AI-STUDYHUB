"""OAuth authorization-code helpers; provider secrets stay on the backend."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request


PROVIDERS = {
    "google": {
        "client_id": "STUDYHUB_GOOGLE_CLIENT_ID",
        "client_secret": "STUDYHUB_GOOGLE_CLIENT_SECRET",
        "redirect_uri": "STUDYHUB_GOOGLE_REDIRECT_URI",
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
    },
}


class OAuthError(RuntimeError):
    pass


def provider_config(provider, environ=None):
    environ = os.environ if environ is None else environ
    spec = PROVIDERS.get(provider)
    if not spec:
        raise OAuthError("Nhà cung cấp đăng nhập không hợp lệ")
    config = {key: (environ.get(spec[key]) or "").strip()
              for key in ("client_id", "client_secret", "redirect_uri")}
    if not all(config.values()):
        raise OAuthError("Đăng nhập Google chưa được cấu hình")
    return {**config, "authorize_url": spec["authorize_url"], "token_url": spec["token_url"]}


def provider_status(environ=None):
    environ = os.environ if environ is None else environ
    return {name: {"configured": all((environ.get(spec[key]) or "").strip()
                                      for key in ("client_id", "client_secret", "redirect_uri"))}
            for name, spec in PROVIDERS.items()}


def authorization_url(provider, state, environ=None):
    config = provider_config(provider, environ)
    params = {
        "client_id": config["client_id"],
        "redirect_uri": config["redirect_uri"],
        "response_type": "code",
        "state": state,
        "scope": "openid email profile",
        "prompt": "select_account",
    }
    return f'{config["authorize_url"]}?{urllib.parse.urlencode(params)}'


def _json_request(url, *, data=None, headers=None):
    request = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise OAuthError("Không thể xác thực với Google") from exc
    if not isinstance(payload, dict) or payload.get("error"):
        raise OAuthError("Google từ chối yêu cầu đăng nhập")
    return payload


def exchange_profile(provider, code, environ=None):
    config = provider_config(provider, environ)
    token = _json_request(
        config["token_url"],
        data=urllib.parse.urlencode({
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "redirect_uri": config["redirect_uri"],
            "code": code,
            "grant_type": "authorization_code",
        }).encode("ascii"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    profile = _json_request(
        "https://openidconnect.googleapis.com/v1/userinfo",
        headers={"Authorization": f'Bearer {token.get("access_token", "")}'},
    )
    if profile.get("email_verified") not in (True, "true"):
        raise OAuthError("Tài khoản Google chưa xác minh email")
    email = str(profile.get("email") or "").strip().lower()
    provider_user_id = str(profile.get("sub") or "").strip()
    if not email or not provider_user_id:
        raise OAuthError("Google không trả về email tài khoản")
    return {
        "provider_user_id": provider_user_id,
        "email": email,
        "name": str(profile.get("name") or email.split("@", 1)[0]).strip(),
        "avatar_url": str(profile.get("picture") or "").strip(),
    }

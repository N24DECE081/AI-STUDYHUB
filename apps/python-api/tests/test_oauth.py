import unittest
from unittest.mock import patch

from backend.app.security.oauth import authorization_url, exchange_profile, provider_status


class OAuthProviderTests(unittest.TestCase):
    def setUp(self):
        self.environment = {
            "STUDYHUB_GOOGLE_CLIENT_ID": "google-id",
            "STUDYHUB_GOOGLE_CLIENT_SECRET": "google-secret",
            "STUDYHUB_GOOGLE_REDIRECT_URI": "https://api.example/auth/google/callback",
            "STUDYHUB_FACEBOOK_CLIENT_ID": "facebook-id",
            "STUDYHUB_FACEBOOK_CLIENT_SECRET": "facebook-secret",
            "STUDYHUB_FACEBOOK_REDIRECT_URI": "https://api.example/auth/facebook/callback",
        }

    def test_provider_status_reports_configuration_without_values(self):
        status = provider_status(self.environment)
        self.assertEqual(status, {
            "google": {"configured": True},
            "facebook": {"configured": True},
        })
        self.assertNotIn("secret", str(status).lower())

    def test_authorization_urls_have_provider_specific_scopes(self):
        google = authorization_url("google", "state-token", self.environment)
        facebook = authorization_url("facebook", "state-token", self.environment)
        self.assertIn("openid+email+profile", google)
        self.assertIn("email%2Cpublic_profile", facebook)
        self.assertIn("state=state-token", google)
        self.assertIn("state=state-token", facebook)

    @patch("backend.app.security.oauth._json_request")
    def test_facebook_profile_is_normalized(self, request):
        request.side_effect = [
            {"access_token": "provider-token"},
            {"id": "fb-123", "email": "Student@Example.com", "name": "Student One",
             "picture": {"data": {"url": "https://images.example/avatar.jpg"}}},
        ]
        profile = exchange_profile("facebook", "authorization-code", self.environment)
        self.assertEqual(profile["provider_user_id"], "fb-123")
        self.assertEqual(profile["email"], "student@example.com")
        self.assertEqual(profile["avatar_url"], "https://images.example/avatar.jpg")


if __name__ == "__main__":
    unittest.main()

import assert from "node:assert/strict";
import test from "node:test";
import { parseFocusMediaUrl } from "./focusMedia.js";

test("accepts supported music links without trusting arbitrary hosts", () => {
  assert.equal(parseFocusMediaUrl("https://youtu.be/M7lc1UVf-VE")?.provider, "YouTube");
  assert.equal(parseFocusMediaUrl("https://music.youtube.com/watch?v=M7lc1UVf-VE")?.src, "https://www.youtube.com/embed/M7lc1UVf-VE?playsinline=1");
  assert.equal(parseFocusMediaUrl("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=demo")?.provider, "Spotify");
  assert.equal(parseFocusMediaUrl("https://youtube.com.evil.example/watch?v=M7lc1UVf-VE"), null);
  assert.equal(parseFocusMediaUrl("javascript:alert(1)"), null);
});

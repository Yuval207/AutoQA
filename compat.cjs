// Node.js 22+/25+ compatibility polyfill for legacy npm packages (jwa, jsonwebtoken, buffer-equal-constant-time)
try {
  const buffer = require('buffer');
  if (buffer && !buffer.SlowBuffer) {
    buffer.SlowBuffer = buffer.Buffer;
  }
} catch (e) {}


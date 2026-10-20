# AutoQA Security Model & Guidelines

AutoQA runs arbitrary user repositories and tests web applications. Security is enforced at every layer of the architecture:

---

## 1. Zip Slip & Path Traversal Mitigation
When uncompressing user-uploaded `.zip` repositories, every entry is sanitized:
```java
Path destination = targetDirectory.resolve(entry.getName()).normalize();
if (!destination.startsWith(targetDirectory)) {
    throw new SecurityException("Zip Slip entry attempted traversal: " + entry.getName());
}
```
Similarly, the artifact storage controller strictly validates requested filenames to prevent directory traversal (`..` or absolute paths).

---

## 2. Process Sandbox & Resource Isolation
- Application under test is spawned in a separate child process.
- Execution timeouts prevent infinite loops and runaway test runs.
- Process tree cleanup handles graceful termination (SIGTERM) followed by forced shutdown (SIGKILL) if processes do not exit within 2 seconds.

---

## 3. Authentication & API Protection
- All public endpoints require JWT bearer tokens signed with HMAC-SHA256 (`HS256` or `HS512`).
- Passwords are encrypted using Spring Security's BCryptPasswordEncoder with a secure work factor.
- Worker endpoints (`/api/worker/**`) are isolated and bound to internal application networking.
- Cross-Origin Resource Sharing (CORS) is restricted to configured frontend origins.

---

## 4. Playwright Browser Isolation
- Each test scenario runs in a newly created, isolated browser context.
- Cookies, cache, and local storage do not leak between scenarios.
- Sandboxing arguments (`--no-sandbox`, `--disable-setuid-sandbox`) are constrained to headless container runners.

---

## 5. Vulnerability Reporting
If you identify a security defect, please report it privately to `security@autoqa.local`.

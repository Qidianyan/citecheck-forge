# Web Companion: Deployment Notes

The web companion (`web/`) is a static site: `index.html` (landing) and `playground.html` (in-browser deterministic verifier). It requires no backend, no API keys, and makes zero external API calls. The verifier core and the 33-statute corpus are bundled as ES modules.

## Local Run (Any Machine)

```bash
node web/build.mjs   # -> web/dist/ (pure live-engine build, no /mock/ routes)
node web/serve.mjs   # -> http://127.0.0.1:8787 (loopback only, HTTP 404 on /mock/)
```

## Self-Hosted Static Container (Loopback Only)

- `deploy/nginx.conf` serves `web/dist/` as static files, returns `404` on `/mock/`, and proxies `/api/` to an optional advisory container (disabled by default).
- `deploy/deploy-linux.sh` deploys the static bundle to a loopback-only `nginx:1.27-alpine` container (`127.0.0.1:5414 -> 80`) with backup & rollback (`deploy/rollback-linux.sh`).

## Optional Advisory Endpoint (Disabled by Default)

- `web/server/server.mjs` is an isolated optional Node 22 advisory endpoint bound to an internal container network with read-only root filesystem, `cap-drop ALL`, and `128 MB` memory limit.
- It is **OFF by default** (`ADVISORY_ENABLED=0`, no API key configured). Enabling it requires explicit operator configuration in a local `chmod 600` environment file excluded from version control.
- Rate limits: `10` requests per IP per hour, global daily cap `200`, `8 KB` body limit, `20 s` upstream timeout. Request bodies, IPs, and keys are never logged.

"""
VibeSDK API — direct HTTP access, no SDK required.

One-line import:
    from gateway.api import api

Examples:
    from gateway.api import api

    api.list_apps()
    api.create_app("Build a todo app")
    api.get_app("app-id-here")
    api.delete_app("app-id-here")
    api.get_files("app-id-here")       # app details + files
    api.git_clone_token("app-id-here") # get URL to git clone all files
    api.set_visibility("app-id-here", "public")
    api.toggle_star("app-id-here")
    api.list_public_apps()
    api.list_recent_apps()
    api.list_favorites()

Configuration — set these env vars (or pass directly to VibeSDK()):
    export VIBESDK_API_KEY=vibe_xxxxxxxxxxxx
    export VIBESDK_BASE_URL=https://build.cloudflare.dev   # optional
"""

import json
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

BASE_URL = os.environ.get("VIBESDK_BASE_URL", "https://build.cloudflare.dev").rstrip("/")
API_KEY  = os.environ.get("VIBESDK_API_KEY", "")

# ── token cache ──────────────────────────────────────────────────────────────
_token: str | None = None
_token_exp: float  = 0          # unix timestamp (seconds)


def _get_token(api_key: str = "", base_url: str = "") -> str:
    global _token, _token_exp
    key = api_key or API_KEY
    url = base_url or BASE_URL

    if not key:
        raise RuntimeError(
            "VIBESDK_API_KEY is not set.\n"
            "Run:  export VIBESDK_API_KEY=vibe_xxxxxxxxxxxx"
        )

    if _token and _token_exp - 30 > time.time():
        return _token

    req = urllib.request.Request(
        f"{url}/api/auth/exchange-api-key",
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        data=b"{}",
    )
    try:
        with urllib.request.urlopen(req) as r:
            body = json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = json.loads(e.read())
        raise RuntimeError(body.get("error", {}).get("message", str(e))) from e

    if not body.get("success"):
        raise RuntimeError(body.get("error", {}).get("message", "auth failed"))

    _token = body["data"]["accessToken"]
    _token_exp = datetime.fromisoformat(
        body["data"]["expiresAt"].replace("Z", "+00:00")
    ).timestamp()
    return _token


# ── raw HTTP helpers ─────────────────────────────────────────────────────────

def _req(method: str, path: str, body=None, *, api_key="", base_url="") -> dict:
    token = _get_token(api_key, base_url)
    url   = (base_url or BASE_URL) + path
    data  = json.dumps(body).encode() if body is not None else None
    req   = urllib.request.Request(
        url, method=method.upper(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=data,
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} {path}: {e.read().decode()[:400]}") from e


def _stream(method: str, path: str, body=None, *, api_key="", base_url=""):
    """Returns list of parsed NDJSON objects (for streaming endpoints like /api/agent)."""
    token = _get_token(api_key, base_url)
    url   = (base_url or BASE_URL) + path
    data  = json.dumps(body).encode() if body is not None else None
    req   = urllib.request.Request(
        url, method=method.upper(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=data,
    )
    results = []
    try:
        with urllib.request.urlopen(req) as r:
            for line in r:
                line = line.strip()
                if line:
                    results.append(json.loads(line))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} {path}: {e.read().decode()[:400]}") from e
    return results


# ── API class ────────────────────────────────────────────────────────────────

class VibeSDK:
    """
    Direct HTTP client for the VibeSDK API.
    No SDK package required — uses only Python stdlib.
    """

    def __init__(self, api_key: str = "", base_url: str = ""):
        self._key = api_key or API_KEY
        self._url = (base_url or BASE_URL).rstrip("/")

    def _g(self, path):           return _req("GET",    path, api_key=self._key, base_url=self._url)
    def _p(self, path, body=None):return _req("POST",   path, body, api_key=self._key, base_url=self._url)
    def _pu(self, path, body=None):return _req("PUT",   path, body, api_key=self._key, base_url=self._url)
    def _d(self, path):           return _req("DELETE", path, api_key=self._key, base_url=self._url)

    # ── Auth ─────────────────────────────────────────────────────────────────

    def token(self) -> str:
        """Return a valid JWT access token (useful for raw curl calls)."""
        return _get_token(self._key, self._url)

    # ── Create / Build ───────────────────────────────────────────────────────

    def create_app(
        self,
        prompt: str,
        *,
        project_type: str = "app",           # "app" | "component" | "api"
        behavior_type: str = "phasic",       # "phasic" | "agentic"
        language: str | None = None,
        frameworks: list | None = None,
        template: str | None = None,
        credentials: dict | None = None,
    ) -> list:
        """
        Start building a new app. Returns list of NDJSON events.
        The first event contains: agentId, websocketUrl, behaviorType, projectType.

        POST /api/agent
        """
        body = {
            "query": prompt,
            "projectType": project_type,
            "behaviorType": behavior_type,
        }
        if language:    body["language"]         = language
        if frameworks:  body["frameworks"]        = frameworks
        if template:    body["selectedTemplate"]  = template
        if credentials: body["credentials"]       = credentials

        return _stream("POST", "/api/agent", body, api_key=self._key, base_url=self._url)

    def connect(self, agent_id: str) -> dict:
        """
        Connect to an existing agent (get websocketUrl).

        GET /api/agent/:agentId/connect
        """
        return self._g(f"/api/agent/{agent_id}/connect")

    def ws_ticket(self, agent_id: str) -> dict:
        """
        Get a short-lived WebSocket ticket (~15s) for an agent.

        POST /api/ws-ticket
        """
        return self._p("/api/ws-ticket", {"resourceType": "agent", "resourceId": agent_id})

    # ── Apps ─────────────────────────────────────────────────────────────────

    def list_apps(self) -> dict:
        """
        List all apps owned by the authenticated user.

        GET /api/apps
        """
        return self._g("/api/apps")

    def list_recent_apps(self) -> dict:
        """
        List the 10 most recent apps.

        GET /api/apps/recent
        """
        return self._g("/api/apps/recent")

    def list_favorites(self) -> dict:
        """
        List favorite apps.

        GET /api/apps/favorites
        """
        return self._g("/api/apps/favorites")

    def list_public_apps(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        sort: str = "recent",
        order: str = "desc",
        framework: str | None = None,
        search: str | None = None,
    ) -> dict:
        """
        List public apps with optional filtering.

        GET /api/apps/public
        """
        qs = f"?limit={limit}&offset={offset}&sort={sort}&order={order}"
        if framework: qs += f"&framework={framework}"
        if search:    qs += f"&search={search}"
        return self._g(f"/api/apps/public{qs}")

    def get_app(self, app_id: str) -> dict:
        """
        Get full details for an app including generated files.

        GET /api/apps/:id
        """
        return self._g(f"/api/apps/{app_id}")

    def get_files(self, app_id: str) -> dict:
        """
        Alias for get_app() — response includes the generated files.

        GET /api/apps/:id
        """
        return self.get_app(app_id)

    def delete_app(self, app_id: str) -> dict:
        """
        Delete an app (owner only).

        DELETE /api/apps/:id
        """
        return self._d(f"/api/apps/{app_id}")

    def set_visibility(self, app_id: str, visibility: str) -> dict:
        """
        Set app visibility: "public" | "private" | "unlisted"

        PUT /api/apps/:id/visibility
        """
        return self._pu(f"/api/apps/{app_id}/visibility", {"visibility": visibility})

    def toggle_star(self, app_id: str) -> dict:
        """
        Toggle star/bookmark on an app.

        POST /api/apps/:id/star
        """
        return self._p(f"/api/apps/{app_id}/star")

    def toggle_favorite(self, app_id: str) -> dict:
        """
        Toggle favorite on an app.

        POST /api/apps/:id/favorite
        """
        return self._p(f"/api/apps/{app_id}/favorite")

    def git_clone_token(self, app_id: str) -> dict:
        """
        Get a git clone token + URL to download all project files.

        POST /api/apps/:id/git/token
        Returns: { token, expiresIn, expiresAt, cloneUrl }
        Then run: git clone <cloneUrl>
        """
        return self._p(f"/api/apps/{app_id}/git/token")

    def preview(self, agent_id: str) -> dict:
        """
        Deploy a preview for an app.

        GET /api/agent/:agentId/preview
        """
        return self._g(f"/api/agent/{agent_id}/preview")


# ── default singleton ─────────────────────────────────────────────────────────
api = VibeSDK()


# ── CLI ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys

    def usage():
        print("""
Usage: python3 gateway/api.py <command> [args]

Commands:
  token                          Print your access token
  list                           List your apps
  recent                         List recent apps
  favorites                      List favorite apps
  public [search]                List public apps
  get      <app_id>              Get app details + files
  create   <prompt>              Create a new app
  delete   <app_id>              Delete an app
  star     <app_id>              Toggle star on an app
  favorite <app_id>              Toggle favorite on an app
  visibility <app_id> <public|private|unlisted>
  clone    <app_id>              Get git clone URL for all files
  preview  <app_id>              Deploy a preview
""")

    args = sys.argv[1:]
    if not args:
        usage()
        sys.exit(0)

    cmd = args[0]

    try:
        if cmd == "token":
            print(api.token())

        elif cmd == "list":
            print(json.dumps(api.list_apps(), indent=2))

        elif cmd == "recent":
            print(json.dumps(api.list_recent_apps(), indent=2))

        elif cmd == "favorites":
            print(json.dumps(api.list_favorites(), indent=2))

        elif cmd == "public":
            search = args[1] if len(args) > 1 else None
            print(json.dumps(api.list_public_apps(search=search), indent=2))

        elif cmd == "get":
            print(json.dumps(api.get_app(args[1]), indent=2))

        elif cmd == "create":
            prompt = " ".join(args[1:])
            events = api.create_app(prompt)
            print(json.dumps(events, indent=2))

        elif cmd == "delete":
            print(json.dumps(api.delete_app(args[1]), indent=2))

        elif cmd == "star":
            print(json.dumps(api.toggle_star(args[1]), indent=2))

        elif cmd == "favorite":
            print(json.dumps(api.toggle_favorite(args[1]), indent=2))

        elif cmd == "visibility":
            print(json.dumps(api.set_visibility(args[1], args[2]), indent=2))

        elif cmd == "clone":
            result = api.git_clone_token(args[1])
            print(json.dumps(result, indent=2))
            if result.get("success") and result.get("data", {}).get("cloneUrl"):
                print(f"\nRun:  git clone {result['data']['cloneUrl']}")

        elif cmd == "preview":
            print(json.dumps(api.preview(args[1]), indent=2))

        else:
            usage()

    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

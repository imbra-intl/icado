#!/usr/bin/env bash
# VibeSDK API — call any endpoint from your Mac without the SDK.
#
# Setup (one time):
#   export VIBESDK_API_KEY=vibe_xxxxxxxxxxxxx
#
# Usage:
#   source gateway/vibesdk.sh          # loads vibe() helper into your shell
#   vibe GET /api/apps
#   vibe GET /api/apps/recent
#   vibe POST /api/apps/APP_ID/star
#   vibe POST /api/agent '{"query":"Build a todo app","projectType":"app","behaviorType":"phasic"}'
#
# Or call it directly:
#   bash gateway/vibesdk.sh GET /api/apps

VIBESDK_BASE_URL="${VIBESDK_BASE_URL:-https://imbra.site}"

_vibesdk_get_token() {
    if [[ -z "$VIBESDK_API_KEY" ]]; then
        echo "Error: VIBESDK_API_KEY is not set." >&2
        return 1
    fi

    # Cache token in a temp file (valid ~1h, we expire 30s early)
    local cache_file="/tmp/.vibesdk_token"
    local now
    now=$(date +%s)

    if [[ -f "$cache_file" ]]; then
        local cached_token cached_exp
        cached_token=$(awk 'NR==1' "$cache_file")
        cached_exp=$(awk 'NR==2' "$cache_file")
        if [[ -n "$cached_token" && "$cached_exp" -gt $((now + 30)) ]]; then
            echo "$cached_token"
            return 0
        fi
    fi

    local response
    response=$(curl -sf -X POST "${VIBESDK_BASE_URL}/api/auth/exchange-api-key" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${VIBESDK_API_KEY}" \
        -d '{}')

    if [[ $? -ne 0 || -z "$response" ]]; then
        echo "Error: Failed to exchange API key for token." >&2
        return 1
    fi

    local token exp_str exp_ts
    token=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['accessToken'])" 2>/dev/null)
    exp_str=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['expiresAt'])" 2>/dev/null)
    exp_ts=$(python3 -c "from datetime import datetime; print(int(datetime.fromisoformat('${exp_str}'.replace('Z','+00:00')).timestamp()))" 2>/dev/null)

    if [[ -z "$token" ]]; then
        echo "Error: Could not parse token from response: $response" >&2
        return 1
    fi

    printf '%s\n%s\n' "$token" "$exp_ts" > "$cache_file"
    echo "$token"
}

vibe() {
    local method="${1:?Usage: vibe METHOD /path [body]}"
    local path="${2:?Usage: vibe METHOD /path [body]}"
    local body="$3"

    local token
    token=$(_vibesdk_get_token) || return 1

    local curl_args=(-sf -X "$method"
        -H "Authorization: Bearer $token"
        -H "Content-Type: application/json"
    )

    if [[ -n "$body" ]]; then
        curl_args+=(-d "$body")
    fi

    curl "${curl_args[@]}" "${VIBESDK_BASE_URL}${path}" | python3 -m json.tool 2>/dev/null || \
    curl "${curl_args[@]}" "${VIBESDK_BASE_URL}${path}"
}

# If called directly (not sourced), run the command from args
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    vibe "$@"
fi

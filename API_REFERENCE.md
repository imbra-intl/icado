# 🚀 VibeSDK Direct API Reference (Production)

You can now access your VibeSDK production API directly using your **API Key**. You no longer need to exchange it for an access token.

---

## 🔐 1. Authentication

Simply include your API Key in the `X-API-Key` header or as a `Bearer` token.

*   **Header Option A**: `X-API-Key: YOUR_API_KEY`
*   **Header Option B**: `Authorization: Bearer YOUR_API_KEY`

---

## 🏗️ 2. Create a New App (Simplified)

This single endpoint creates the project **AND** starts code generation in the background automatically. Use this if you don't want to handle WebSockets.

*   **Method**: `POST`
*   **URL**: `https://YOUR_DOMAIN/api/agent/build`

#### **cURL Example**
```bash
curl -X POST https://YOUR_DOMAIN/api/agent/build \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Create a simple landing page",
    "projectType": "app"
  }'
```

---

## 🏗️ 3. Create a New App (Streaming)

#### **cURL Example**
```bash
curl -X POST https://YOUR_DOMAIN/api/agent \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Create a simple landing page",
    "projectType": "app",
    "language": "typescript"
  }'
```

#### **Python Example**
```python
import requests

url = "https://your-domain.com/api/agent"
headers = {
    "X-API-Key": "your-api-key-here",
    "Content-Type": "application/json"
}
payload = {
    "query": "Create a simple landing page",
    "projectType": "app"
}

response = requests.post(url, headers=headers, json=payload)
print(response.json())
```

---

## 📡 3. Generate Code (WebSocket)

After creating an app, you'll receive an `agentId`. To trigger the actual code generation:

1.  **Get a Ticket**: `POST /api/ws-ticket` using your API Key.
2.  **Connect**: `wss://YOUR_DOMAIN/api/agent/{agentId}/ws?ticket={ticket}`.
3.  **Send**: `{"type": "generate_all"}`.

### **Get Ticket (curl)**
```bash
curl -X POST https://YOUR_DOMAIN/api/ws-ticket \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"resourceType": "agent", "resourceId": "YOUR_AGENT_ID"}'
```

---

## 📂 4. App Management

| Action | Method | Endpoint |
| :--- | :--- | :--- |
| **List My Apps** | `GET` | `/api/apps` |
| **Get App Details** | `GET` | `/api/apps/{id}` |
| **Delete App** | `DELETE` | `/api/apps/{id}` |
| **Get Preview URL** | `GET` | `/api/agent/{id}/preview` |

---

## 💡 Important: Deployment
I have implemented these changes in your code. To make them active in production, you must run:
`bun run deploy`

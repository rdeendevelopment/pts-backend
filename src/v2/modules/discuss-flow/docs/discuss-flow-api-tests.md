# DiscussFlow API Tests

Base: `{{baseUrl}}/api/v2/discuss-flow`

Auth: `Authorization: Bearer {{accessToken}}`

Module: `discuss_flow` must be **active** in module registry.

Permissions: `discuss_flow.view` / `discuss_flow.manage`

---

## 1. Create workspace

```http
POST /api/v2/discuss-flow/workspaces
Content-Type: application/json

{
  "name": "Product Discovery",
  "description": "Requirements and decisions workspace",
  "visibility": "team"
}
```

## 2. List workspaces (search)

```http
GET /api/v2/discuss-flow/workspaces?q=product
```

## 3. Create topic

```http
POST /api/v2/discuss-flow/topics
Content-Type: application/json

{
  "workspace_id": "{{workspaceId}}",
  "title": "SSO Requirements",
  "description": "Enterprise SSO rollout discussion",
  "priority": "high",
  "category": "product",
  "tags": ["auth", "sso"]
}
```

## 4. Add message

```http
POST /api/v2/discuss-flow/topics/{{topicId}}/messages

{
  "content": "We need SAML + OIDC support for enterprise clients."
}
```

## 5. Add requirement

```http
POST /api/v2/discuss-flow/topics/{{topicId}}/requirements

{
  "title": "Support SAML 2.0",
  "description": "Must integrate with Okta and Azure AD",
  "priority": "high"
}
```

## 6. Add question

```http
POST /api/v2/discuss-flow/topics/{{topicId}}/questions

{
  "question": "Do we need SCIM provisioning in v1?"
}
```

## 7. Add decision

```http
POST /api/v2/discuss-flow/topics/{{topicId}}/decisions

{
  "title": "Launch OIDC first",
  "context": "Faster delivery for pilot customers",
  "impact": "SAML deferred to phase 2"
}
```

## 8. Timeline

```http
GET /api/v2/discuss-flow/topics/{{topicId}}/timeline
```

Expected events: `topic_created`, `message_created`, `requirement_created`, `question_created`, `decision_created`

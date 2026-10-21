# API keys

API keys give another application machine-to-machine access to the Taskmaster API, without signing in as a person. Use them for an ERP or maintenance system that creates or completes tasks, a script, a no-code workflow (n8n, Zapier, Power Automate) or a monitoring check.

## Create a key

1. As a super administrator, open **Settings → API Keys** and create a key.
2. Give it a name and pick its scopes. Grant only what the integration needs.
3. Copy the key, which starts with `sk_`. It is shown once and cannot be retrieved later: Taskmaster stores only its SHA-256 hash.

From the same screen you can **rotate** a key (new secret, same scopes) or **revoke** it. Revocation takes effect immediately. Each key records when it was last used.

## Call the API

Every request needs two headers:

```http
X-API-KEY: sk_…
X-Site-Id: 1
```

`X-Site-Id` is required. A key works on one site per request and cannot reach the tasks of another site.

```bash
curl -H "X-API-KEY: $TASKMASTER_KEY" -H "X-Site-Id: 1" \
  https://taskmaster.example.com/api/tasks
```

## Scopes

| Scope | Allows |
| --- | --- |
| `task:read` | Read tasks |
| `task:create` | Create tasks |
| `task:update` | Edit tasks and their occurrence overrides |
| `task:delete` | Delete, restore and permanently delete tasks |
| `schedule:read`, `schedule:create`, `schedule:update`, `schedule:delete` | Manage schedules |
| `user:read`, `user:write` | Users |
| `settings:read`, `settings:write` | Settings |
| `backup:read`, `backup:write` | Backups |
| `export:read` | Exports |
| `site:read`, `site:write`, `site:assign` | Sites |
| `api_keys:read`, `api_keys:write` | API keys |

A key is accepted by the endpoints of tasks (`/api/tasks`), schedules (`/api/schedules`), task execution (`/api/tasks/:id/execution/…`) and integrations (`/api/integrations`). On those, it can call any route that declares a required permission, as long as its scopes include it. Routes that only list allowed roles, for example the task board or `POST /api/tasks/:id/status`, refuse API keys: use the webhook below to complete a task.

## Incoming webhook

`POST /api/integrations/webhooks/incoming` is a single endpoint for integration tools. The key needs all three scopes `task:create`, `task:update` and `task:delete`.

```json
{
  "source": "n8n",
  "action": "COMPLETE_TASK",
  "payload": { "taskId": 42, "instanceDate": "2026-10-21", "comment": "Checked by the BMS" }
}
```

| `action` | Required `payload` fields | Optional |
| --- | --- | --- |
| `COMPLETE_TASK` | `taskId`, `instanceDate` | `comment` (default: `Completed via <source>`) |
| `CREATE_TASK` | `name`, `periodicity`, `startDate` | `description`, `priority` (default `MEDIUM`), `project` (default: the source), `category` (default `Webhook`) |
| `DELETE_TASK` | `taskId` | |

`COMPLETE_TASK` marks the occurrence of that date as validated. The task must belong to the site given in `X-Site-Id`.

## Good practice

- One key per integration, so you can revoke one without breaking the others.
- Store the key in the integration's secret store, never in source code.
- Rotate a key when someone who knew it leaves, or when it may have leaked.

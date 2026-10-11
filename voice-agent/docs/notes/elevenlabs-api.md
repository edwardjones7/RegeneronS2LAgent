# ElevenLabs Agents (ConvAI) HTTP API: notes for the S2L backend

Researched 2026-10-10 from the official docs at elevenlabs.io/docs (API reference plus guides) and the official `elevenlabs-python` SDK source. Anything not confirmed in those sources is marked **UNCONFIRMED**.

- Base URL: `https://api.elevenlabs.io`. Regional hosts also exist: `api.us.elevenlabs.io`, `api.eu.residency.elevenlabs.io`, `api.in.residency…` and `api.sg.residency…`.
- Auth header: `xi-api-key: <ELEVENLABS_API_KEY>`.
- All bodies are `Content-Type: application/json`.
- Every endpoint returns validation errors as `422 {"detail":[{"loc":[...],"msg":"...","type":"..."}]}`.

---

## 1. Agents

### Create: `POST /v1/convai/agents/create`
Only `conversation_config` is required. The response is `200 {"agent_id": "agent_..."}`.

```json
{
  "name": "Regeneron S2L Agent",
  "tags": ["s2l"],
  "conversation_config": {
    "agent": {
      "first_message": "Hi {{first_name}}, this is ... calling about your request.",
      "language": "en",
      "dynamic_variables": {
        "dynamic_variable_placeholders": { "first_name": "there", "lead_id": "test-lead" }
      },
      "prompt": {
        "prompt": "You are ... The lead's name is {{first_name}}.",
        "llm": "claude-sonnet-4-5",
        "temperature": 0.3,
        "tool_ids": ["tool_abc123"],
        "built_in_tools": {
          "end_call": { "type": "system", "name": "end_call", "description": "", "params": { "system_tool_type": "end_call" } },
          "voicemail_detection": { "type": "system", "name": "voicemail_detection", "params": { "system_tool_type": "voicemail_detection", "voicemail_message": "Hi {{first_name}}, sorry I missed you..." } }
        }
      }
    },
    "tts": { "voice_id": "<voice_id>", "model_id": "eleven_flash_v2_5" },
    "turn": { "turn_timeout": 7, "silence_end_call_timeout": -1, "turn_eagerness": "normal" },
    "conversation": { "max_duration_seconds": 600 }
  },
  "platform_settings": {
    "data_collection": {
      "appointment_booked": { "type": "boolean", "description": "True if the lead agreed to a appointment" },
      "preferred_callback_time": { "type": "string", "description": "Callback time the lead gave, ISO-8601 if possible" }
    },
    "evaluation": {
      "criteria": [
        { "id": "qualified", "name": "Lead qualified", "type": "prompt",
          "conversation_goal_prompt": "Did the agent confirm the lead's interest and next step?" }
      ]
    },
    "overrides": {
      "conversation_config_override": {
        "agent": { "first_message": true, "language": false, "prompt": { "prompt": true } },
        "tts": { "voice_id": false }
      }
    },
    "workspace_overrides": {
      "webhooks": { "post_call_webhook_id": "<webhook_id>", "events": ["transcript", "call_initiation_failure"] }
    }
  }
}
```

### Update: `PATCH /v1/convai/agents/{agent_id}`
- Optional query parameter: `branch_id`. (`enable_versioning_if_not_enabled` is deprecated and ignored.)
- Body fields are all optional: `conversation_config`, `platform_settings`, `workflow`, `name`, `tags`, `version_description`, `procedures`. It takes the same nested shape as create, as a partial update.
- The response is the full agent object, with these fields:
  - `agent_id`, `name`
  - `conversation_config`, `platform_settings`, `workflow`, `procedures`
  - `metadata`, `access_info`, `tags`
  - `phone_numbers`, `whatsapp_accounts`
  - `version_id`, `branch_id`, `main_branch_id`
  - `default_hold_audio_url`
- Partial PATCH is assumed to deep-merge nested objects. **UNCONFIRMED**: to be safe, send complete sub-objects such as `built_in_tools` and `data_collection`.

### Field reference
| Field | Notes |
|---|---|
| `agent.first_message` | Empty means the agent waits for the user to speak. On outbound Twilio calls the agent always speaks first, so set this. Dynamic variables are allowed. |
| `agent.language` | ISO code, default `"en"`. Used for ASR and TTS. |
| `agent.prompt.prompt` | The system prompt. Dynamic variables are allowed. |
| `agent.prompt.llm` | Enum. See the Claude values below. The docs state no default. |
| `agent.prompt.temperature` | Default `0`. `null` omits the parameter from the LLM request. |
| `agent.prompt.tool_ids` | **The current way to attach tools.** Holds IDs from `POST /v1/convai/tools`. |
| `agent.prompt.tools` | **Deprecated** in favor of `tool_ids`. Do not use inline tools. |
| `agent.prompt.built_in_tools` | System tools. Keys: `end_call`, `transfer_to_number`, `transfer_to_agent`, `language_detection`, `skip_turn`, `play_keypad_touch_tone`, `voicemail_detection`. See section 3. |
| `tts.model_id` | `eleven_turbo_v2`, `eleven_turbo_v2_5`, `eleven_flash_v2`, `eleven_flash_v2_5`, `eleven_multilingual_v2`, `eleven_v3_conversational`, `eleven_v4`, `eleven_v4_turbo`. The default shown is `eleven_v4_turbo`. `optimize_streaming_latency` is deprecated and does nothing. |
| `turn` | `turn_timeout` (seconds, default 7), `silence_end_call_timeout` (-1 means off), `turn_eagerness` (`patient`, `normal` or `eager`), `turn_model` (`turn_v2` or `turn_v3`), `speculative_turn` (bool), `spelling_patience` (`auto` or `off`). |
| `conversation.max_duration_seconds` | Default 600. |
| `platform_settings.data_collection` | Map of `id` to an `AnalysisProperty`: `{type: boolean, string, integer or number, description, enum?}`. `description` is mutually exclusive with `dynamic_variable`, `constant_value`, `is_system_provided` and `is_omitted`. |
| `platform_settings.evaluation.criteria[]` | `{id, name, conversation_goal_prompt, type: "prompt"}`. |
| `platform_settings.analysis_items` | A newer unified structure. When it is null, the legacy `evaluation` and `data_collection` fields are used. Using the legacy fields is fine. |
| `platform_settings.overrides` | Must be explicitly enabled per field before `conversation_config_override` can be sent at call time. Otherwise the call errors. Other flags: `custom_llm_extra_body` (bool), `enable_conversation_initiation_client_data_from_webhook` (bool). |
| `platform_settings.workspace_overrides.webhooks` | Per-agent post-call webhook: `{post_call_webhook_id, events[], transcript_format: json or opentelemetry, exclude_transcript}`. `send_audio` is deprecated in favor of `events`. |

**Claude values for `prompt.llm`** (verbatim from the create-agent reference): `claude-sonnet-4-5`, `claude-opus-4-7`, `claude-opus-4-8`, `claude-opus-5`, `claude-opus-5-5`, `claude-sonnet-4-6`, `claude-sonnet-5`, `claude-sonnet-5-5`, `claude-sonnet-4`, `claude-haiku-4-5`, `claude-3-7-sonnet`, `claude-3-5-sonnet`, `claude-3-5-sonnet-v1`, `claude-3-haiku`, and the pinned variants `claude-sonnet-4@20250514`, `claude-sonnet-4-5@20250929`, `claude-haiku-4-5@20251001`, `claude-3-7-sonnet@20250219`, `claude-3-5-sonnet@20240620`, `claude-3-5-sonnet-v2@20241022`, `claude-3-haiku@20240307`.

### Dynamic variables
- **Syntax:** write `{{var_name}}` in `prompt.prompt`, `first_message`, `voicemail_message`, tool parameters, and tool headers.
- **Values:** strings, numbers or booleans.
- **Placeholders:** set defaults at `conversation_config.agent.dynamic_variables.dynamic_variable_placeholders`. The docs describe them as test defaults and do not say they are required. **UNCONFIRMED**: whether a call fails if a referenced variable is neither placeholdered nor passed. Safest practice is to always pass every variable or set placeholders.
- **Runtime values:** pass them in `conversation_initiation_client_data.dynamic_variables` on the outbound call. You do not need to enable overrides for dynamic variables. Overrides are only for `conversation_config_override`.
- **System variables** (no setup needed):
  - `system__conversation_id`, `system__call_sid` (Twilio), `system__caller_id`, `system__called_number`
  - `system__agent_id`, `system__current_agent_id`
  - `system__call_duration_secs`, `system__time_utc`, `system__time`, `system__timezone`
  - `system__agent_turns`, `system__conversation_history`, `system__is_text_only`
  - The `system__` prefix is reserved for these.
- **Secret variables:** variables prefixed `secret__` are only usable in tool headers and are never sent to the LLM. They come back as `<REDACTED>` in webhooks and the conversations API.

---

## 2. Tools (server/webhook)

### Create: `POST /v1/convai/tools`
The body is `{ "tool_config": {...}, "response_mocks": [...]? }`. The response returns `id`, which you put in the agent's `prompt.tool_ids`.

Related endpoints: `GET /v1/convai/tools`, `GET` and `PATCH` and `DELETE /v1/convai/tools/{tool_id}` (standard CRUD; only create was read in detail).

```json
{
  "tool_config": {
    "type": "webhook",
    "name": "book_appointment",
    "description": "Book the lead's consultation once they confirm a time.",
    "response_timeout_secs": 20,
    "api_schema": {
      "url": "https://api.example.com/tools/leads/{lead_id}/book",
      "method": "POST",
      "path_params_schema": {
        "lead_id": { "type": "string", "dynamic_variable": "lead_id" }
      },
      "request_headers": {
        "X-Tool-Secret": { "secret_id": "<secret_id from POST /v1/convai/secrets>" },
        "X-Conversation-Id": { "variable_name": "system__conversation_id" }
      },
      "content_type": "application/json",
      "request_body_schema": {
        "type": "object",
        "description": "Booking request",
        "properties": {
          "lead_id":        { "type": "string", "dynamic_variable": "lead_id" },
          "conversation_id":{ "type": "string", "dynamic_variable": "system__conversation_id" },
          "slot_iso":       { "type": "string", "description": "Chosen appointment start time, ISO-8601" },
          "notes":          { "type": "string", "description": "Anything the lead asked us to note" }
        },
        "required": ["lead_id", "slot_iso"]
      }
    }
  }
}
```

Response (200):
```json
{ "id": "tool_...", "tool_config": { "...": "echo" },
  "access_info": { "is_creator": true, "creator_name": "...", "creator_email": "...", "role": "admin" },
  "usage_stats": { "avg_latency_secs": 0.0, "total_calls": 0 }, "response_mocks": null }
```

### `tool_config` fields for `type: "webhook"`
- **Required:** `type`, `name`, `description`, `api_schema`.
- **`response_timeout_secs`:** default 20. For webhooks the allowed range is 5 to 300.
- **Optional:**
  - `execution_mode`, `interruption_mode`, `pre_tool_speech`, `tool_error_handling_mode`, `tool_call_sound`
  - `dynamic_variables`, `assignments` (writes values from the tool response into dynamic variables using dot paths, for example `response.users.0.email`)
  - `follow_redirects`, `follow_redirects_allowed_domains`
- **`api_schema`:**
  - `url` (required). Use `{param}` placeholders for path parameters.
  - `method`: `GET`, `POST`, `PUT`, `PATCH` or `DELETE`. Default `GET`.
  - `path_params_schema`, `query_params_schema` (`{properties, required?}`) and `request_body_schema`.
  - `request_headers`, `response_body_schema`, `response_filter`.
  - `content_type`: `application/json` or `application/x-www-form-urlencoded`.
  - `auth_connection`, `auth_resolved_params`.

### How a parameter gets its value
Each parameter (`LiteralJsonSchemaProperty`) has a `type` (`string`, `integer`, `number` or `boolean`) plus **exactly one** of the following:
- `description`: the LLM fills the value.
- `dynamic_variable: "lead_id"`: injected from a dynamic variable, so the LLM never sees or supplies it. **This is how to pass `lead_id`.**
- `constant_value`: a fixed value.
- `is_system_provided`: the system fills the value at runtime.
- `is_omitted`: the parameter is left out of the request.

Other notes:
- `enum` and `allowed_values` (`{dynamic_variable}`) can constrain an LLM-supplied value. `allowed_values_dynamic_variable` is deprecated.
- There is **no `value_type` field** in the API. "Value type" is only the dashboard label for this choice.
- The `type` enum values above come from the SDK. The docs page does not list them, and the SDK source shows a fifth union member, a list of strings. Treat the exact strings as **UNCONFIRMED** in docs.

### Header values
Per the SDK type `WebhookToolApiSchemaConfigInputRequestHeadersValue`, a header value can be any of:
- a plain `"string"`
- `{"secret_id": "..."}` (a workspace secret)
- `{"variable_name": "..."}` (a dynamic variable)
- `{"env_var_label": "..."}`

The REST docs page does not expand this union, so the exact JSON is confirmed only from the official SDK types. **UNCONFIRMED** in the REST docs: whether a plain string or a secret is stored in clear text.

**Recommended:** store the shared secret with `POST /v1/convai/secrets`, which takes `{"type":"new","name":"s2l_tool_secret","value":"..."}` and returns `{"type":"stored","secret_id":"...","name":"..."}`. Then reference it as `{"secret_id": ...}`.

---

## 3. System tools
- **Where they go:** attach them through `conversation_config.agent.prompt.built_in_tools.<name>`, **not** through `tool_ids`.
- **Entry shape:** `{ "type": "system", "name": "<name>", "description": "", "params": { "system_tool_type": "<name>", ... } }`.
- **Optional fields on the entry:** `pre_tool_speech`, `interruption_mode`.
- **Defaults differ by creation method:** agents created in the dashboard get `end_call` by default, but agents created through the API or SDK do **not**. Add it explicitly.

| Tool | `params` (beyond `system_tool_type`) |
|---|---|
| `end_call` | none |
| `voicemail_detection` | `voicemail_message` (string, optional; supports `{{vars}}`). If set, the message is left on voicemail; otherwise the call ends. |
| `language_detection` | `only_at_conversation_start` (bool, default false) |
| `skip_turn` | `wait_timeout_secs` (double, default -1) |
| `transfer_to_number` | `transfers[]` (required), `enable_client_message` (bool, default true) |

Shape of a `transfer_to_number` entry:
```json
"transfer_to_number": {
  "type": "system", "name": "transfer_to_number", "description": "",
  "params": {
    "system_tool_type": "transfer_to_number",
    "transfers": [
      { "transfer_destination": { "type": "phone", "phone_number": "+15551234567" },
        "condition": "When the lead asks to speak with a human",
        "transfer_type": "conference" }
    ],
    "enable_client_message": true
  }
}
```

More on `transfer_to_number`:
- `transfer_destination.type` is one of:
  - `phone` or `phone_dynamic_variable`, which use `phone_number`
  - `sip_uri` or `sip_uri_dynamic_variable`, which use `sip_uri`
- For the dynamic variants, the value is presumably a `{{var}}` name. **UNCONFIRMED**: the exact form.
- `transfer_type` is `conference` (the default), `blind` or `sip_refer`.
- Optional fields: `post_dial_digits`, `custom_sip_headers`, `uui`.
- The top-level `phone_number` on a transfer is deprecated in favor of `transfer_destination`.

**Twilio-side voicemail/AMD (alternative):** the outbound-call body accepts `telephony_call_config.twilio_machine_detection.mode` (`enable` or `detect_message_end`). The workspace webhook events also include `answering_machine_detection`.

---

## 4. Phone numbers (Twilio import)

### Import: `POST /v1/convai/phone-numbers`
```json
{
  "provider": "twilio",
  "phone_number": "+15550001111",
  "label": "S2L outbound",
  "sid": "SK... or AC...",
  "token": "<API Key Secret or Auth Token>",
  "account_auth_token": "<Twilio Auth Token; required when sid is an SK API key>",
  "agent_id": "agent_...",
  "enable_sms": false
}
```
- The response is `200 {"phone_number_id": "phnum_..."}`.
- Other optional fields: `region_config {region_id: us1, ie1 or au1, token, edge_location}`. `supports_inbound` and `supports_outbound` are deprecated.
- The import fails if the number does not exist in that Twilio account.

### Assign or change the agent: `PATCH /v1/convai/phone-numbers/{phone_number_id}`
- The body is `{"agent_id": "agent_..."}`. Optional fields: `label`, `environment`, `branch_id`.
- The response includes `{provider, label, phone_number, phone_number_id, assigned_agent: {agent_id, agent_name} | null}`.
- You can also pass `agent_id` at import time.
- Only numbers that can receive inbound calls can be assigned. Verified caller IDs are outbound-only and cannot be assigned.
- **Outbound calls do not need an assigned agent,** because `agent_id` is passed per call.

Related endpoints: `GET /v1/convai/phone-numbers` and `GET` and `DELETE /v1/convai/phone-numbers/{id}` (standard; not read in detail).

---

## 5. Outbound call: `POST /v1/convai/twilio/outbound-call`
```json
{
  "agent_id": "agent_...",
  "agent_phone_number_id": "phnum_...",
  "to_number": "+15557654321",
  "conversation_initiation_client_data": {
    "dynamic_variables": { "first_name": "Dana", "lead_id": "L-123" },
    "conversation_config_override": {
      "agent": { "first_message": "Hi Dana, ...", "prompt": { "prompt": "..." } }
    },
    "user_id": "L-123"
  },
  "telephony_call_config": {
    "ringing_timeout_secs": 60,
    "twilio_machine_detection": { "mode": "enable" }
  },
  "call_recording_enabled": false
}
```

Response (200):
```json
{ "success": true, "message": "...", "conversation_id": "conv_...", "callSid": "CA..." }
```
- `conversation_id` and `callSid` are nullable. Note the camelCase in `callSid`.
- Check `success` before trusting `conversation_id`. **UNCONFIRMED**: whether a dial failure ever returns `success: false` with HTTP 200, or always returns a non-2xx status.

### `conversation_initiation_client_data` fields
All fields are optional:
- `dynamic_variables` (map)
- `conversation_config_override`, which may contain:
  - `agent{first_message, language, max_conversation_duration_message, prompt{prompt, llm, tool_ids, native_mcp_server_ids, knowledge_base}}`
  - `tts{voice_id, model_id, stability, speed, similarity_boost, ...}`
  - `asr{keywords}`
  - `turn{soft_timeout_config}`
  - `conversation{text_only, max_duration_seconds}`
- `custom_llm_extra_body`, `user_id`, `source_info{source, version}`
- `branch_id`, `environment`, `starting_workflow_node_id`, `procedure_ids`

Each override field must be enabled in `platform_settings.overrides` first.

### `telephony_call_config` fields
- `ringing_timeout_secs` (default 60)
- `twilio_call_recording_enabled` (default false)
- `twilio_machine_detection{mode}`

**Audio format:** the native integration is expected to handle the Twilio μ-law 8 kHz format. **UNCONFIRMED**: the older custom-Twilio guide says to set agent input and output to μ-law 8000 Hz, and the native-integration page does not mention it.

---

## 6. Post-call webhooks

### Configure via API (no dashboard needed)
1. **Create the workspace webhook** with `POST /v1/workspace/webhooks`:
   ```json
   { "settings": { "auth_type": "hmac", "name": "s2l-post-call", "webhook_url": "https://api.example.com/webhooks/elevenlabs", "request_headers": { "X-Env": "prod" } } }
   ```
   It returns `{"webhook_id": "...", "webhook_secret": "..."}`. **Store `webhook_secret`; this is the HMAC secret.** The field is nullable. **UNCONFIRMED**: whether it is returned only once.
2. **Attach it workspace-wide** with `PATCH /v1/convai/settings`:
   ```json
   { "webhooks": { "post_call_webhook_id": "<webhook_id>", "events": ["transcript", "call_initiation_failure"], "transcript_format": "json", "exclude_transcript": false } }
   ```
   - `events` can be any of `transcript`, `audio`, `call_initiation_failure`, `answering_machine_detection`, `unredacted_transcript`, `unredacted_audio`.
   - `send_audio` is deprecated.
3. **Or attach it per agent** with `platform_settings.workspace_overrides.webhooks`, which has the same shape.

### Event types (top-level `type`)
- `post_call_transcription`
- `post_call_audio`
- `call_initiation_failure`

The envelope is `{ "type": "...", "event_timestamp": <unix secs>, "data": {...} }`.

### `post_call_transcription` `data`
```json
{
  "agent_id": "...", "agent_name": "...", "conversation_id": "...", "status": "done",
  "user_id": "...", "branch_id": null, "version_id": "...", "environment": null,
  "transcript": [
    { "role": "agent", "message": "Hey there Dana...", "time_in_call_secs": 0,
      "tool_calls": null, "tool_results": null, "feedback": null,
      "interrupted": false, "conversation_turn_metrics": null }
  ],
  "metadata": {
    "start_time_unix_secs": 1739537297, "call_duration_secs": 22, "cost": 296,
    "termination_reason": "", "authorization_method": "...",
    "phone_call": { "type": "twilio", "direction": "outbound", "agent_number": "+1...", "external_number": "+1...",
                    "phone_number_id": "...", "call_sid": "CA...", "stream_sid": "...", "call_result": "answered" }
  },
  "analysis": {
    "call_successful": "success",
    "transcript_summary": "...",
    "data_collection_results": {
      "appointment_booked": { "data_collection_id": "appointment_booked", "value": true, "rationale": "...", "json_schema": {} }
    },
    "evaluation_criteria_results": {
      "qualified": { "criteria_id": "qualified", "result": "success", "rationale": "..." }
    }
  },
  "conversation_initiation_client_data": { "dynamic_variables": { "first_name": "Dana", "lead_id": "L-123", "system__call_sid": "CA..." } },
  "has_audio": true, "has_user_audio": true, "has_response_audio": true
}
```

Field notes:
- **Transcript items:** `role` (`user` or `agent`) and `time_in_call_secs` are required. `message` can be null on tool-only turns.
- **`metadata.phone_call` and `call_result`:** the shape comes from the GET-conversation schema; the webhook example page omits `phone_call`.
  - `call_result` is one of `answered`, `voicemail`, `busy`, `no_answer`, `failed`.
  - **UNCONFIRMED**: that `phone_call` is always present in webhooks.
- **`analysis.call_successful`:** `success`, `failure` or `unknown`.

### `post_call_audio` `data`
- Contains `{agent_id, conversation_id, full_audio}`. `full_audio` is a base64 MP3.
- Delivered chunked, with a 5-minute timeout. Retries resend the full audio, so dedupe on `conversation_id`.

### `call_initiation_failure` `data`
```json
{ "agent_id": "...", "conversation_id": "...", "failure_reason": "busy",
  "metadata": { "type": "twilio", "body": { "CallStatus": "busy", "SipResponseCode": "487", "...": "Twilio StatusCallback fields" } } }
```
- `failure_reason` is one of `busy`, `no-answer`, `unknown`. Note the hyphen here versus the underscore in `call_result`.
- A Twilio `failed` status is not listed; it presumably maps to `unknown`. **UNCONFIRMED**.
- With a `sip` metadata type, `body` has `from_number`, `to_number`, `sip_status_code`, `error_reason`, `call_sid`, `sip_status`, `twirp_code`.
- **No failure webhook is sent when the call reaches voicemail or an IVR,** because the call was initiated. That outcome arrives as a normal transcription with `call_result: "voicemail"`.

### Signature verification
The header is `ElevenLabs-Signature` and its format is `t=<unix_seconds>,v0=<hex>`. The algorithm comes from the official SDK's `construct_event`:
```python
import hmac, hashlib, time, json

def verify(raw_body: str, sig_header: str, secret: str) -> dict:
    parts = dict(p.split("=", 1) for p in sig_header.split(","))
    ts, sig = parts["t"], "v0=" + parts["v0"]
    if int(ts) * 1000 < int(time.time() * 1000) - 30 * 60 * 1000:   # 30-min tolerance
        raise ValueError("stale")
    mac = hmac.new(secret.encode(), f"{ts}.{raw_body}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest("v0=" + mac, sig):
        raise ValueError("bad signature")
    return json.loads(raw_body)
```
- The signed string is `f"{timestamp}.{raw_body}"`, using HMAC-SHA256 hex with the `webhook_secret`. Verify against the **raw** body bytes.
- The SDK checks only the lower bound of the timestamp (older than 30 minutes is rejected).
- The docs recommend `client.webhooks.construct_event(rawBody=..., sig_header=..., secret=...)`, which returns a dict and raises `BadRequestError` on failure.

### Delivery behavior
- Return HTTP 200 to acknowledge a delivery.
- Failed deliveries are retried.
- The webhook is auto-disabled after 10 or more consecutive failures if the last success was more than 7 days ago, or never happened.
- ElevenLabs publishes static egress IPs, so IP allowlisting is optional.

---

## 7. Conversation details and audio

### `GET /v1/convai/conversations/{conversation_id}`
- Optional query parameter: `format=json|opentelemetry`.
- The response has the same shape as the webhook `data` above.
- **Required fields:** `agent_id`, `conversation_id`, `status`, `transcript`, `metadata`, `has_audio`, `has_user_audio`, `has_response_audio`, `has_auxiliary_audio`.
- **`status`:** `initiated`, `in-progress`, `processing`, `done` or `failed`. Analysis is final at `done`, so poll until `done` or `failed` as a webhook fallback.
- **`metadata`:** includes `start_time_unix_secs`, `call_duration_secs`, `cost_fiat`, `termination_reason` and `phone_call{type: twilio, ...}`.
- **`analysis`:** contains `call_successful`, `transcript_summary`, `data_collection_results`, `evaluation_criteria_results`, `call_summary_title` and more.

### `GET /v1/convai/conversations/{conversation_id}/audio`
- Returns the conversation audio.
- The content type is not stated in the reference. It is expected to be `audio/mpeg` binary. **UNCONFIRMED**: treat the body as bytes and check `Content-Type`.
- Check `has_audio` first.

---

## 8. Python SDK (`elevenlabs` package)
- Client: `from elevenlabs.client import ElevenLabs; client = ElevenLabs(api_key=...)`. There is also `AsyncElevenLabs`.
- Confirmed in the docs:
  - `client.conversational_ai.agents.update(agent_id=..., platform_settings={...})`
  - `client.webhooks.construct_event(rawBody=..., sig_header=..., secret=...)`
  - Agent create with `built_in_tools` dicts.
- **UNCONFIRMED** method names (seen in third-party mirrors and SDK conventions, not in the official reference pages read):
  - `client.conversational_ai.twilio.outbound_call(agent_id=..., agent_phone_number_id=..., to_number=..., conversation_initiation_client_data=...)`
  - `client.conversational_ai.agents.create(...)`, `client.conversational_ai.tools.create(...)`
  - `client.conversational_ai.phone_numbers.create(...)` / `.update(...)`
  - `client.conversational_ai.conversations.get(...)` / `.audio.get(...)`
- The SDK is Fern-generated, so its parameter names mirror the JSON fields. For a FastAPI backend, plain `httpx` against the shapes above is equally viable. Use the SDK only for `construct_event`, or inline the 10-line verifier above.

---

## Sources
- https://elevenlabs.io/docs/api-reference/agents/create
- https://elevenlabs.io/docs/api-reference/agents/update
- https://elevenlabs.io/docs/api-reference/tools/create
- https://elevenlabs.io/docs/api-reference/workspace/secrets/create
- https://elevenlabs.io/docs/api-reference/phone-numbers/create
- https://elevenlabs.io/docs/api-reference/phone-numbers/update
- https://elevenlabs.io/docs/api-reference/twilio/outbound-call
- https://elevenlabs.io/docs/api-reference/conversations/get
- https://elevenlabs.io/docs/api-reference/conversations/get-audio
- https://elevenlabs.io/docs/api-reference/webhooks/create
- https://elevenlabs.io/docs/api-reference/workspace/update (PATCH /v1/convai/settings)
- https://elevenlabs.io/docs/agents-platform/workflows/post-call-webhooks
- https://elevenlabs.io/docs/agents-platform/customization/personalization/dynamic-variables
- https://elevenlabs.io/docs/agents-platform/customization/personalization/overrides
- https://elevenlabs.io/docs/agents-platform/customization/tools/server-tools
- https://elevenlabs.io/docs/agents-platform/customization/tools/system-tools/end-call
- https://elevenlabs.io/docs/agents-platform/customization/tools/system-tools/transfer-to-human
- https://elevenlabs.io/docs/agents-platform/customization/tools/system-tools/voicemail-detection
- https://elevenlabs.io/docs/agents-platform/phone-numbers/twilio-integration/native-integration
- https://github.com/elevenlabs/elevenlabs-python/blob/main/src/elevenlabs/webhooks_custom.py (HMAC algorithm)
- https://github.com/elevenlabs/elevenlabs-python/blob/main/src/elevenlabs/types/webhook_tool_api_schema_config_input_request_headers_value.py
- https://github.com/elevenlabs/elevenlabs-python/blob/main/src/elevenlabs/types/conv_ai_secret_locator.py
- https://github.com/elevenlabs/elevenlabs-python/blob/main/src/elevenlabs/types/agent_config_override_config.py

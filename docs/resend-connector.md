# Resend

- `custom.resend` connects Muse to Resend through its REST API at `https://api.resend.com`.

- It authenticates with the registered `api_key` credential sent as a Bearer header and calls only `api.resend.com`.

- Helpers live in `~/workspace/custom-connectors/custom.resend/bin/`. `send_email.py` renders one HTML template from `~/workspace/ringkas-email/templates/` and sends it with `POST /emails`.

## Connect

- The connection was registered with `credentials.request_api_access` and these details. Reuse them to reconnect.

```json
{
  "provider": "resend",
  "auth_scheme": "api_key",
  "placement": "bearer_header",
  "api_hosts": ["api.resend.com"]
}
```

- Before the first change in a conversation, prove access with a harmless read:

```text
python3 - <<'EOF'
import json, sys, urllib.request
sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response
req = urllib.request.Request("https://api.resend.com/domains", headers={
    "User-Agent": "Ringkas/1.0 (+https://ringkas.by-rj.com)",
    "Accept": "application/json",
})
add_surrogate_to_request(req, "custom.resend", allowed_hosts=["api.resend.com"])
with urllib.request.urlopen(req, timeout=30) as r:
    print(json.dumps(read_json_response(r), indent=2))
EOF
```

## Credentials

- The registered connection holds the credential. Helpers import `/opt/muse/skills/custom-connector-setup/bin/dynamic_credentials.py`, which returns an `hsurr:` surrogate and places it where the provider reads the key. Muse swaps in the real credential only on an approved request to a registered host.

- Never put a key, token, password or cookie in this doc, a helper, a command argument, an environment variable or a log. Never ask the user to paste one in chat.

- Keep redirects disabled on authenticated requests.

- On a 401 or 403, check the request first. Confirm that the helper attached the credential, that the host is registered and that the placement and scopes match.

- Only when a request that carried the credential is still rejected, call `credentials.request_api_access` with the details above and `"reconnect": true`.

## List domains

- This read lists the sending domains on the account and each domain status. Use it to check whether a domain is verified before sending from it.

```text
GET https://api.resend.com/domains
```

- Verified on 2026-11-15. The call returned two domains. `ringkas.by-rj.com`, created 2026-11-15, has status `verified` with sending enabled, and all three of its records are verified: the DKIM TXT record and both SPF CNAME records. `by-rj.com`, created 2026-04-07, has status `pending`: its DKIM and SPF records are still pending and only its inbound MX record is verified. Send Ringkas mail from `ringkas.by-rj.com`, for example `halo@ringkas.by-rj.com`, not from `by-rj.com`, until the root domain records are verified too.

- Always send a `User-Agent` header on Resend calls. The first verification attempt with the Python default user agent came back `403 error code: 1010`, and the same call with a `User-Agent` header succeeded with `200`.

## Send an email

- This write sends one transactional email. Use it for Ringkas order and parent report mail only, with the HTML templates in `~/workspace/ringkas-email/templates/`.

```text
python3 ~/workspace/custom-connectors/custom.resend/bin/send_email.py \
  --to pembeli@example.com \
  --from "Ringkas <halo@by-rj.com>" \
  --subject "Pembayaran lunas" \
  --template ~/workspace/ringkas-email/templates/03-pesanan-lunas.html \
  --vars '{"nama":"Ricky","order_id":"RM-...","email":"pembeli@example.com"}'
```

- The helper refuses to send when any `{{placeholder}}` in the template has no value, so a half filled template never goes out.

- Resend returns `{"id": "..."}` for a sent email. Keep that id next to the Ringkas `order_id` so a send can be traced and never repeated blindly.

- Sending is verified. Test email sent 2026-11-15 from `halo@ringkas.by-rj.com` to `rickyjanuari@gmail.com` with the paid order template and real order data (RM-MWGL0D5U8008, Rp29.331). Resend returned id `01a1dd41-08c4-7a4b-8ff0-d9a13b47fda1` and a later read showed `last_event: delivered`.

## Recover from errors

- `401` means the key is wrong, revoked or missing from the request. Check that the helper attached the surrogate and that the host is registered before reconnecting.

- `403` with error code `1010` means the request was refused before authentication. Send a `User-Agent` header and try again.

- `403` with `You can only send testing emails to your own email address` means the sending domain is not verified. Send from `onboarding@resend.dev` to the Resend account address only, or verify the domain first.

- `429 daily_quota_exceeded` means the free plan daily cap of 100 emails is hit. Wait until midnight UTC and send the most urgent mail first, such as order paid mail before the weekly parent report.

- After a failed or timed-out change, check the current state with a read before trying again, because the first request may have completed.

## Limits

- The free plan allows 3,000 emails a month and at most 100 a day, with 3 domains and 30 days of log retention.

- Each To, CC or BCC recipient counts as one email against the quota.

- Without a verified domain, mail can only go from `onboarding@resend.dev` to the Resend account address.

- This connector does not manage DNS records, broadcasts or audiences. Domain verification happens in the Resend dashboard and the user DNS provider.

## Related skills

- Use `muse.skill_search` to find other skills and `muse.connector_search` to find other connectors.

"""Error monitoring with Sentry. Off unless SENTRY_DSN is set, so local runs and tests send nothing.

What gets reported: unhandled exceptions (the API's 500s, a crashed sync) and
any log record at ERROR level or above. 4xx responses are the user's mistake,
not ours, and are not reported.
"""

import logging
from typing import Any, cast

import sentry_sdk
from sentry_sdk.types import Event, Hint

from app.core.config import Settings

log = logging.getLogger("firstpr.monitoring")

# Never sent, even if a future change starts attaching them: session cookies,
# and the OAuth code/state that GitHub puts in the callback's query string.
_SECRET_HEADERS = {"cookie", "authorization", "set-cookie"}


def scrub(event: dict[str, Any], _hint: dict[str, Any] | None = None) -> dict[str, Any]:
    # Local variables in stack frames hold raw cookie headers and, in sign-in code,
    # the decrypted GitHub token. They're switched off below; this is the backstop.
    for exc in (event.get("exception") or {}).get("values") or []:
        for frame in (exc.get("stacktrace") or {}).get("frames") or []:
            frame.pop("vars", None)
    request = event.get("request") or {}
    request.pop("cookies", None)
    headers = request.get("headers")
    if isinstance(headers, dict):
        request["headers"] = {k: v for k, v in headers.items() if k.lower() not in _SECRET_HEADERS}
    if "/auth/" in str(request.get("url", "")):
        request.pop("query_string", None)
    return event


def _before_send(event: Event, _hint: Hint) -> Event:
    return cast(Event, scrub(cast(dict[str, Any], event)))


def init_sentry(settings: Settings, component: str, transport: Any = None) -> bool:
    """Start Sentry for one process ("api", "sync", "recheck"). Returns whether it's on.

    `transport` is for tests: it receives events instead of sentry.io.
    """
    if not settings.sentry_dsn:
        return False
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        data_collection={
            "user_info": False,  # no IPs or user details
            "stack_frame_variables": False,  # see scrub()
            "http_bodies": [],
            "database_query_data": False,  # SQL parameters can hold search text or tokens
        },
        before_send=_before_send,
        transport=transport,
    )
    sentry_sdk.set_tag("component", component)
    log.info("Sentry enabled", extra={"environment": settings.sentry_environment})
    return True

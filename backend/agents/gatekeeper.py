from datetime import datetime, timezone
import ipaddress
import socket
from urllib.parse import urlparse
import uuid

from schemas import ActionType, ApprovalRecord, GatekeeperDecision

PENDING_APPROVALS: dict[str, ApprovalRecord] = {}

RESTRICTED_HOSTNAMES = {"localhost", "localhost.localdomain"}


def _is_non_public_ip(ip_str: str) -> bool:
    try:
        ip_obj = ipaddress.ip_address(ip_str)
        return (
            ip_obj.is_private
            or ip_obj.is_loopback
            or ip_obj.is_link_local
            or ip_obj.is_reserved
            or ip_obj.is_multicast
            or ip_obj.is_unspecified
        )
    except ValueError:
        return True


def validate_public_url(url: str) -> tuple[bool, str]:
    if not url or not url.strip():
        return False, "URL is empty."

    try:
        parsed = urlparse(url.strip())
    except Exception:
        return False, "Malformed URL."

    if parsed.scheme not in ("http", "https"):
        return False, f"Unsupported URL scheme '{parsed.scheme}'. Only HTTP/HTTPS allowed."

    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        return False, "URL is missing a hostname."

    if hostname in RESTRICTED_HOSTNAMES or hostname.endswith(".local"):
        return False, f"Restricted local hostname '{hostname}' is not permitted."

    try:
        ipaddress.ip_address(hostname)
        if _is_non_public_ip(hostname):
            return False, f"Non-public IP address '{hostname}' is blocked."
        return True, "Public IP validated."
    except ValueError:
        pass

    try:
        infos = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
        for info in infos:
            addr = info[4][0]
            if _is_non_public_ip(addr):
                return False, f"Hostname '{hostname}' resolves to non-public IP '{addr}'."
    except socket.gaierror:
        # Allow Scout Swarm HTTPX to report network/DNS failure cleanly if offline.
        return True, "Public URL syntax validated."

    return True, "Public URL validated."


def evaluate_action(
    action_type: ActionType,
    target_url: str = "",
    content: str = "",
) -> tuple[GatekeeperDecision, str]:
    if action_type == "READ_PUBLIC_SOURCE":
        ok, reason = validate_public_url(target_url)
        return ("PERMIT", reason) if ok else ("DENY", reason)

    if action_type == "DOM_CLIP":
        if not content.strip():
            return "DENY", "Clip content cannot be empty."
        return "PERMIT", "Clip content validated."

    if action_type in ("FORM_SUBMIT", "CHECKOUT_CLICK", "EXTERNAL_POST"):
        return (
            "REQUIRE_APPROVAL",
            f"Action '{action_type}' mutates external state and requires explicit user approval.",
        )

    return "DENY", f"Unknown action type '{action_type}'."


def create_approval_request(
    action_type: ActionType,
    target_url: str,
    summary: str,
    payload_preview: str,
) -> ApprovalRecord:
    decision, reason = evaluate_action(action_type, target_url=target_url)
    gate_id = f"gate_{uuid.uuid4().hex[:8]}"
    record = ApprovalRecord(
        gate_id=gate_id,
        action_type=action_type,
        decision=decision,
        status="PENDING_APPROVAL" if decision == "REQUIRE_APPROVAL" else "BLOCKED",
        target_url=target_url,
        summary=summary,
        payload_preview=payload_preview,
        reason=reason,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    PENDING_APPROVALS[gate_id] = record
    return record


def decide_approval(gate_id: str, approved: bool) -> ApprovalRecord:
    record = PENDING_APPROVALS.get(gate_id)
    if not record:
        raise KeyError(f"Approval record '{gate_id}' not found.")

    record.status = "APPROVED" if approved else "BLOCKED"
    record.decided_at = datetime.now(timezone.utc).isoformat()
    return record

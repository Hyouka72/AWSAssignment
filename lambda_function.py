"""
lambda_function.py demo

Single Lambda function that handles ALL blood donor CRUD operations.
Deploy this one file behind an API Gateway proxy integration (ANY method
on /donors and /donors/{donorId}, or a {proxy+} catch-all) and it routes
internally based on HTTP method + path.

Environment variables:
    DONORS_TABLE_NAME  - name of the DynamoDB table (default: "Donors")

No external dependencies beyond boto3, which is already included in the
standard AWS Lambda Python runtime - nothing to package or install.
"""
import json
import os
import uuid
import decimal
import base64
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr

TABLE_NAME = "Donors"

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE",
}

REQUIRED_DONOR_FIELDS = ["name", "bloodGroup", "phone", "age", "gender"]
VALID_BLOOD_GROUPS = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}
UPDATABLE_FIELDS = [
    "name", "bloodGroup", "age", "gender", "phone",
    "email", "address", "city", "lastDonationDate",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class DecimalEncoder(json.JSONEncoder):
    """DynamoDB returns numbers as Decimal; make them JSON serialisable."""

    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super().default(obj)


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def parse_body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    return json.loads(raw)


def validate_donor(payload, partial=False):
    """Returns a list of validation error strings (empty if valid)."""
    errors = []
    fields = REQUIRED_DONOR_FIELDS if not partial else [
        f for f in REQUIRED_DONOR_FIELDS if f in payload
    ]
    for field in fields:
        if not payload.get(field) and payload.get(field) != 0:
            errors.append(f"'{field}' is required")

    if "bloodGroup" in payload and payload["bloodGroup"] not in VALID_BLOOD_GROUPS:
        errors.append(f"'bloodGroup' must be one of {sorted(VALID_BLOOD_GROUPS)}")

    if "age" in payload:
        try:
            age = int(payload["age"])
            if age < 18 or age > 65:
                errors.append("'age' must be between 18 and 65")
        except (TypeError, ValueError):
            errors.append("'age' must be a number")

    return errors


def get_donor_id(event):
    path_params = event.get("pathParameters") or {}
    return path_params.get("donorId")


# ---------------------------------------------------------------------------
# CRUD operations
# ---------------------------------------------------------------------------

def create_donor(event):
    try:
        payload = parse_body(event)
    except Exception:
        return response(400, {"message": "Request body must be valid JSON"})

    errors = validate_donor(payload)
    if errors:
        return response(400, {"message": "Validation failed", "errors": errors})

    now = datetime.now(timezone.utc).isoformat()
    donor_id = payload.get("donorId")

    item = {
        "donorId": donor_id,
        "name": payload["name"],
        "bloodGroup": payload["bloodGroup"],
        "age": int(payload["age"]),
        "gender": payload["gender"],
        "phone": payload["phone"],
        "email": payload.get("email", ""),
        "address": payload.get("address", ""),
        "city": payload.get("city", ""),
        "lastDonationDate": payload.get("lastDonationDate", ""),
        "createdAt": now,
        "updatedAt": now,
    }

    table.put_item(Item=item)
    return response(201, {"message": "Donor created", "donor": item})


def list_donors(event):
    params = event.get("queryStringParameters") or {}
    blood_group = params.get("bloodGroup")
    city = params.get("city")

    scan_kwargs = {}
    filter_expr = None

    if blood_group:
        filter_expr = Attr("bloodGroup").eq(blood_group)
    if city:
        city_expr = Attr("city").eq(city)
        filter_expr = city_expr if filter_expr is None else filter_expr & city_expr

    if filter_expr is not None:
        scan_kwargs["FilterExpression"] = filter_expr

    items = []
    last_evaluated_key = None
    while True:
        if last_evaluated_key:
            scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
        result = table.scan(**scan_kwargs)
        items.extend(result.get("Items", []))
        last_evaluated_key = result.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break

    items.sort(key=lambda d: d.get("createdAt", ""), reverse=True)
    return response(200, {"count": len(items), "donors": items})


def get_donor(event):
    donor_id = get_donor_id(event)
    if not donor_id:
        return response(400, {"message": "donorId is required in the path"})

    donor = table.get_item(Key={"donorId": donor_id}).get("Item")
    if not donor:
        return response(404, {"message": f"Donor '{donor_id}' not found"})

    return response(200, {"donor": donor})


def update_donor(event):
    donor_id = get_donor_id(event)
    if not donor_id:
        return response(400, {"message": "donorId is required in the path"})

    existing = table.get_item(Key={"donorId": donor_id}).get("Item")
    if not existing:
        return response(404, {"message": f"Donor '{donor_id}' not found"})

    try:
        payload = parse_body(event)
    except Exception:
        return response(400, {"message": "Request body must be valid JSON"})

    errors = validate_donor(payload, partial=True)
    if errors:
        return response(400, {"message": "Validation failed", "errors": errors})

    update_expr_parts = []
    expr_attr_values = {}
    expr_attr_names = {}

    for field in UPDATABLE_FIELDS:
        if field in payload:
            placeholder = f":{field}"
            name_placeholder = f"#{field}"
            update_expr_parts.append(f"{name_placeholder} = {placeholder}")
            expr_attr_values[placeholder] = (
                int(payload[field]) if field == "age" else payload[field]
            )
            expr_attr_names[name_placeholder] = field

    update_expr_parts.append("#updatedAt = :updatedAt")
    expr_attr_values[":updatedAt"] = datetime.now(timezone.utc).isoformat()
    expr_attr_names["#updatedAt"] = "updatedAt"

    if len(update_expr_parts) == 1:  # only updatedAt was added
        return response(400, {"message": "No updatable fields provided"})

    table.update_item(
        Key={"donorId": donor_id},
        UpdateExpression="SET " + ", ".join(update_expr_parts),
        ExpressionAttributeValues=expr_attr_values,
        ExpressionAttributeNames=expr_attr_names,
    )

    updated = table.get_item(Key={"donorId": donor_id}).get("Item")
    return response(200, {"message": "Donor updated", "donor": updated})


def delete_donor(event):
    donor_id = get_donor_id(event)
    if not donor_id:
        return response(400, {"message": "donorId is required in the path"})

    existing = table.get_item(Key={"donorId": donor_id}).get("Item")
    if not existing:
        return response(404, {"message": f"Donor '{donor_id}' not found"})

    table.delete_item(Key={"donorId": donor_id})
    return response(200, {"message": f"Donor '{donor_id}' deleted"})


# ---------------------------------------------------------------------------
# Router - entry point AWS Lambda calls
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    method = event.get("httpMethod") or (event.get("requestContext", {})
                                          .get("http", {}).get("method"))
    donor_id = get_donor_id(event)

    # CORS preflight
    if method == "OPTIONS":
        return response(200, {})

    try:
        if method == "POST" and not donor_id:
            return create_donor(event)
        if method == "GET" and not donor_id:
            return list_donors(event)
        if method == "GET" and donor_id:
            return get_donor(event)
        if method == "PUT" and donor_id:
            return update_donor(event)
        if method == "DELETE" and donor_id:
            return delete_donor(event)

        return response(404, {"message": f"No route for {method} {event.get('path', '')}"})

    except Exception as exc:  # noqa: BLE001 - top-level safety net
        print(f"Unhandled error: {exc}")
        return response(500, {"message": "Internal server error"})

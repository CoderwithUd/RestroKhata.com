# Restro Backend API Reference

Single source of truth for all APIs and business logic.

## 1) Core Business Flow

### Table -> Order -> Invoice lifecycle
- Table starts as `available` or `reserved`.
- Order create (staff/public) sets table `occupied`.
- Running-order mode:
  - If same table has an open, non-cancelled, non-invoiced order, new items append in same order.
- Invoice create locks order for billing (`billingLocked=true`) and snapshots order totals/items.
- Invoice pay triggers table status recalculation:
  - if pending session exists => `occupied`
  - else `available` (or `reserved` if table was reserved manually)
- Invoice delete (only non-paid) unlocks order and recalculates table status.

### Production hardening rules
- Transaction-backed write flows for order create/update/delete and invoice create/pay/delete.
- Atomic payment update (`status != PAID/VOID` filter).
- New order blocked if table has unpaid invoice (`DRAFT` or `ISSUED`).
- Kitchen can update order status and item kitchen status only (no item payload/customer/table mutation).

## 2) Auth and Tenant Rules

### Auth
- Protected routes require access token (cookie or `Authorization: Bearer`).

### Tenant
- Staff APIs: tenant from JWT membership.
- Public APIs (`/api/public/*`): tenant resolved by:
  - `token` (QR token) OR
  - `tenantSlug` (`x-tenant-slug`, body, query, or subdomain).

### Subscription
- Staff and public flows require active subscription (`TRIAL` or `ACTIVE` and not expired).

## 3) Role Access Matrix

### Orders (`/api/orders`)
- Create: `OWNER`, `MANAGER`, `WAITER`
- List/Get: `OWNER`, `MANAGER`, `WAITER`, `KITCHEN`
- Update: `OWNER`, `MANAGER`, `WAITER`, `KITCHEN`
  - `KITCHEN`: status-only updates
- Delete: `OWNER`, `MANAGER`

### Invoices (`/api/invoices`)
- Read (`GET`): `OWNER`, `MANAGER`, `WAITER`
- Write (`POST`, `PUT`, `pay`, `DELETE`): `OWNER`, `MANAGER`

### Tables (`/api/tables`)
- Create/Update/Delete/QR: `OWNER`, `MANAGER`
- List: `OWNER`, `MANAGER`, `WAITER`, `KITCHEN`

## 4) Status Enums

### Table
- `available`
- `occupied`
- `reserved`

### Order
- `PLACED`
- `IN_PROGRESS`
- `READY`
- `SERVED`
- `CANCELLED`

### Order Item Kitchen Status
- Every order item has:
  - `lineId` (stable per item line)
  - `kitchenStatus` (`PLACED | IN_PROGRESS | READY | SERVED | CANCELLED`)
- Order-level `status` is derived from item-level `kitchenStatus` when items are appended/replaced/item-status-updated.

### Invoice
- `DRAFT`
- `ISSUED`
- `PAID`
- `VOID`

## 5) API Endpoints and Examples

## Health

### GET `/api/health`
Response:
```json
{ "ok": true }
```

## Auth

### POST `/api/auth/register`
```json
{
  "name": "Owner",
  "email": "owner@example.com",
  "password": "StrongPass123"
}
```

### POST `/api/auth/login`
```json
{
  "email": "owner@example.com",
  "password": "StrongPass123",
  "tenantSlug": "my-cafe"
}
```

## Tables

### POST `/api/tables`
```json
{
  "number": 12,
  "name": "Patio 12",
  "capacity": 4,
  "status": "available"
}
```

### GET `/api/tables?isActive=true`

### PUT `/api/tables/:tableId`
```json
{
  "name": "Window 12",
  "status": "reserved"
}
```

### DELETE `/api/tables/:tableId`
- blocked if pending session exists.

### GET `/api/tables/:tableId/qr`

### POST `/api/tables/:tableId/qr-token`
```json
{
  "expiresInHours": 720
}
```

## Public Menu and Guest Orders

### GET `/api/public/menu?token=<TABLE_QR_TOKEN>`

### POST `/api/public/orders`
```json
{
  "token": "TABLE_QR_TOKEN",
  "customerName": "Rahul",
  "customerPhone": "9876543210",
  "items": [
    {
      "itemId": "65f1f2c9c8f7f6a2d3000001",
      "variantId": "65f1f2c9c8f7f6a2d4000001",
      "quantity": 2,
      "optionIds": ["65f1f2c9c8f7f6a2d5000001"]
    }
  ],
  "note": "Less spicy"
}
```

Possible response messages:
- `order created`
- `items appended to active order`

## Orders (Staff)

### POST `/api/orders`
```json
{
  "tableId": "65f1f2c9c8f7f6a2d1011111",
  "items": [
    {
      "itemId": "65f1f2c9c8f7f6a2d3000001",
      "variantId": "65f1f2c9c8f7f6a2d4000001",
      "quantity": 1,
      "optionIds": []
    }
  ],
  "note": "No onion"
}
```

### GET `/api/orders?status=PLACED,IN_PROGRESS&tableId=<tableId>&page=1&limit=20`

### GET `/api/orders/kitchen/items?status=PLACED,IN_PROGRESS&includeDone=false&tableId=<tableId>&limit=200`
- Kitchen-focused queue (item-wise).
- Returns each item line with:
  - `lineId`
  - `kitchenStatus`
  - `addedAt`
  - `ageMinutes`
  - `priorityLabel` / `priorityScore`

### GET `/api/orders/:orderId`

### PUT `/api/orders/:orderId`
Status update example:
```json
{ "status": "IN_PROGRESS" }
```
Item kitchen status update example:
```json
{
  "itemStatusUpdates": [
    { "lineId": "67aa21c9a8e2cf0f5a000111", "status": "IN_PROGRESS" },
    { "lineId": "67aa21c9a8e2cf0f5a000112", "status": "READY" }
  ]
}
```
Item replace example:
```json
{
  "items": [
    {
      "itemId": "65f1f2c9c8f7f6a2d3000002",
      "variantId": "65f1f2c9c8f7f6a2d4000002",
      "quantity": 3,
      "optionIds": []
    }
  ]
}
```

### DELETE `/api/orders/:orderId`
- blocked if invoice exists for the order.

## Invoices

### POST `/api/invoices`
```json
{
  "orderId": "65f1f2c9c8f7f6a2d2000001",
  "discountType": "PERCENTAGE",
  "discountValue": 10,
  "note": "Festival discount"
}
```

### GET `/api/invoices?status=ISSUED,PAID&tableId=<tableId>&page=1&limit=20`

### GET `/api/invoices/:invoiceId`

### PUT `/api/invoices/:invoiceId`
```json
{
  "note": "Updated note",
  "discountType": "FLAT",
  "discountValue": 50
}
```

### POST `/api/invoices/:invoiceId/pay`
```json
{
  "method": "CARD",
  "reference": "TXN-92011",
  "paidAmount": 1250
}
```

### DELETE `/api/invoices/:invoiceId`
- allowed only when status is not `PAID`.

## Expenses

### POST `/api/expenses`
```json
{
  "title": "Milk Purchase",
  "amount": 850,
  "category": "Inventory",
  "expenseDate": "2026-03-19"
}
```

### GET `/api/expenses?page=1&limit=20`

### PUT `/api/expenses/:expenseId`

### DELETE `/api/expenses/:expenseId`

## Reports

### GET `/api/reports/summary?range=today`

### GET `/api/reports/summary?start=2026-03-01&end=2026-03-19`

Report notes:
- Sales metrics are calculated from `PAID` invoices.
- Order/invoice distribution grouped by status.

## 6) Error Patterns

Common responses:
- `400` validation/input errors
- `401` auth token errors
- `402` inactive subscription
- `403` role/membership restrictions
- `404` resource not found
- `409` business conflict (duplicate invoice, invalid transition, billing lock, etc.)
- `500` server errors

## 7) Important Operational Notes

- Order and invoice writes are transaction-backed when deployment supports MongoDB transactions.
- For non-transaction deployments, atomic guards are still applied, but replica set is strongly recommended.
- Keep `tenantId`-scoped indexes intact for performance and isolation.
- `invoice (tenantId, orderId)` uniqueness is enforced at DB level.
- Kitchen realtime refresh event:
  - Socket event: `kitchen.queue.changed`
  - Triggered on order create/append/update/delete and invoice create/pay/delete.

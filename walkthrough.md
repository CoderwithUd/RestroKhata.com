# Restro Backend — Frontend API Reference

## What Changed & Why

| Feature | Problem Solved |
|---------|---------------|
| **QR Session Tokens** | 3 users scan QR → were merged into 1 order. Now each user gets their own order via `sessionToken` |
| **Waiter Multi-Order** | Waiter couldn't create 2 separate orders on same table. Now: `forceNew: true` or `appendToOrderId` |
| **Group Invoice** | 4 orders, 1 bill. New `POST /invoices/group` endpoint |
| **Order `COMPLETED` status** | After invoice paid, order is now `COMPLETED` (not `SERVED`) and table becomes `AVAILABLE` |

---

## QR Flow — `POST /public/orders`

### First Scan (New Order)

**Request:**
```json
{
  "token": "<qr_table_token>",
  "customerName": "Rahul",
  "customerPhone": "9876543210",
  "items": [
    { "itemId": "...", "variantId": "...", "quantity": 2 }
  ]
}
```

**Response:**
```json
{
  "message": "order created",
  "order": {
    "id": "order1Id",
    "sessionToken": "a3f9bc...48ef",  // 🔑 STORE THIS in localStorage
    "source": "QR",
    "status": "PLACED",
    ...
  }
}
```

> **Frontend must store `sessionToken`** (localStorage / sessionStorage) and send it on every subsequent request from this user.

---

### Repeat Scan (Add More Items to Same Order)

**Request:**
```json
{
  "token": "<qr_table_token>",
  "sessionToken": "a3f9bc...48ef",
  "customerName": "Rahul",
  "customerPhone": "9876543210",
  "items": [
    { "itemId": "...", "variantId": "...", "quantity": 1 }
  ]
}
```

**Response:**
```json
{
  "message": "items appended to your order",
  "order": { "id": "order1Id", "sessionToken": "a3f9bc...48ef", ... }
}
```

> Items append **only to User 1's order** — other users at the table are unaffected.

---

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| `sessionToken` not sent | Creates a fresh new order (new session) |
| `sessionToken` sent but order is billed/completed | Creates a new fresh order, **returns a new `sessionToken`** |
| `sessionToken` sent but order was cancelled | Creates a new fresh order, **returns a new `sessionToken`** |
| Table has unpaid invoice (any user) | `409 — cannot create order while table has unpaid invoice` |

---

## Waiter Flow — `POST /orders`

### Default (Auto-append to latest open order — unchanged)
```json
{
  "tableId": "...",
  "items": [...]
}
```

### Create 2nd Independent Order on Same Table
```json
{
  "tableId": "...",
  "forceNew": true,
  "items": [...]
}
```
> Creates a brand-new order even if an open order already exists on the table.

### Append to a Specific Order (by ID)
```json
{
  "tableId": "...",
  "appendToOrderId": "order2Id",
  "items": [...]
}
```
> Items go to `order2Id` specifically — regardless of what other open orders exist on the table. Returns `404` if the order is cancelled/billed/not on this table.

---

## Single Invoice — `POST /invoices` (unchanged)

Bills one specific order. Works exactly as before.

```json
{ "orderId": "order1Id" }
```

---

## Group Invoice — `POST /invoices/group` ⭐ NEW

### Bill ALL open orders on a table (most common)
```json
{
  "tableId": "table5Id"
}
```

### Bill specific orders only (partial group)
```json
{
  "tableId": "table5Id",
  "orderIds": ["order1Id", "order2Id"],
  "discountType": "PERCENTAGE",
  "discountValue": 10,
  "note": "Table 5 group dinner",
  "customerName": "Rahul",
  "customerPhone": "9876543210"
}
```

**Response:**
```json
{
  "message": "group invoice created",
  "invoice": {
    "id": "invoiceId",
    "isGroupInvoice": true,
    "orderId": "order1Id",
    "orderIds": ["order1Id", "order2Id", "order3Id", "order4Id"],
    "table": { "id": "...", "number": 5, "name": "Table 5" },
    "items": [ /* combined items from ALL orders */ ],
    "grandTotal": 1200,
    "totalDue": 1080,
    "discount": { "type": "PERCENTAGE", "value": 10, "amount": 120 },
    ...
  }
}
```

### Pay Group Invoice — `POST /invoices/:invoiceId/pay` (unchanged endpoint)
```json
{
  "method": "UPI",
  "paidAmount": 1080
}
```
> After payment: **all covered orders** → `COMPLETED`, table → `AVAILABLE` automatically.

### Error Cases

| Error | Status |
|-------|--------|
| No open orders found for table | `404` |
| Some orders already have invoices | `409` |
| Any order has unfinished kitchen items | `409` |
| Some specified orderIds not on this table | `409` |
| Another request locked orders while billing | `409` — retry |

---

## Order Status Flow

```
PLACED → IN_PROGRESS → READY → SERVED
                                  ↓ (invoice created & paid)
                              COMPLETED ✅
                                  ↓
                          Table → AVAILABLE ✅
```

| Status | Kitchen shows | Table active |
|--------|--------------|-------------|
| PLACED | ✅ | ✅ |
| IN_PROGRESS | ✅ | ✅ |
| READY | ✅ | ✅ |
| SERVED | hidden (unless includeDone=true) | ✅ |
| COMPLETED | hidden (unless includeDone=true) | ❌ (done) |
| CANCELLED | hidden | ❌ (done) |

---

## Real-World Scenario: 4 People, 1 Table, 1 Bill

1. Person 1 scans → `sessionToken: "aaa"` → Order A
2. Person 2 scans → `sessionToken: "bbb"` → Order B
3. Person 3 scans → `sessionToken: "ccc"` → Order C
4. Person 4 scans → `sessionToken: "ddd"` → Order D
5. Person 1 scans again with `"aaa"` → items added to **Order A only**
6. Kitchen serves all items for all orders
7. Waiter calls `POST /invoices/group` with `tableId` → 1 invoice for A+B+C+D
8. Payment received → `POST /invoices/:id/pay` → all 4 orders `COMPLETED`, table `AVAILABLE`

---

## New Fields Summary

### Order response
| Field | Type | Notes |
|-------|------|-------|
| `source` | `"STAFF"` \| `"QR"` | Who created the order |
| `sessionToken` | string | Only in QR public order response. Store for reuse |
| `status` | includes `"COMPLETED"` | New terminal state after invoice paid |

### Invoice response
| Field | Type | Notes |
|-------|------|-------|
| `isGroupInvoice` | boolean | `true` for group invoices |
| `orderId` | ObjectId \| null | Primary order (first one in group) |
| `orderIds` | ObjectId[] | All orders covered (empty for single invoices) |

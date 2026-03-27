# Restro Backend API Reference

Updated for production QR order, item-correction, and invoice flow.

## 1. Core Lifecycle

1. Manager creates a table and generates one static QR token for that table.
2. Customer scans QR and calls `GET /api/public/menu?token=...`.
3. Customer creates order with `POST /api/public/orders`.
4. Same customer keeps using the returned `sessionToken`.
5. Customer can fetch current order, update quantity, delete own item, cancel own order, request invoice, and create invoice from QR.
6. Waiter can create multiple independent orders on the same table.
7. Waiter or manager can fix wrong items before billing by moving, removing, or cancelling item lines.
8. Invoice can be created only when every item is `SERVED` or `CANCELLED`.
9. Final payment can be done only by `OWNER` or `MANAGER`.

## 2. Role Rules

### Staff routes
- Orders create: `OWNER`, `MANAGER`, `WAITER`
- Orders read: `OWNER`, `MANAGER`, `WAITER`, `KITCHEN`
- Orders generic update: `OWNER`, `MANAGER`, `WAITER`, `KITCHEN`
- Orders delete: `OWNER`, `MANAGER`
- Item correction endpoints: `OWNER`, `MANAGER`, `WAITER`
- Invoice create: `OWNER`, `MANAGER`, `WAITER`
- Invoice pay/update/delete: `OWNER`, `MANAGER`

### Public QR routes
- Public customer can only access order linked to `token + sessionToken`
- Public customer can only edit items whose `kitchenStatus = PLACED`
- Public customer cannot pay invoice

## 3. Status Enums

### Order status
- `PLACED`
- `IN_PROGRESS`
- `READY`
- `SERVED`
- `COMPLETED`
- `CANCELLED`

### Item kitchen status
- `PLACED`
- `IN_PROGRESS`
- `READY`
- `SERVED`
- `CANCELLED`

### Invoice status
- `DRAFT`
- `ISSUED`
- `PAID`
- `VOID`

## 4. Key Business Rules

- A table can have multiple open orders at the same time.
- Staff can create a fresh order on the same table using `forceNew: true`.
- Staff can append items to a specific order using `appendToOrderId`.
- QR customers are isolated by `sessionToken`. One customer cannot modify another customer order on the same table.
- Once invoice is created, order becomes billing-locked and item/order mutation is blocked.
- Wrong item correction is allowed only before kitchen starts work.
- In this backend, editable item means `kitchenStatus = PLACED`.
- `IN_PROGRESS`, `READY`, `SERVED`, `CANCELLED` item lines cannot be moved or deleted.
- Group invoice is available for staff when one table has multiple open orders.
- Public invoice creation is single-order only and tied to that QR session.

## 5. Shared Response Shapes

### Order response
```json
{
  "id": "orderId",
  "tenantId": "tenantId",
  "table": {
    "id": "tableId",
    "number": 5,
    "name": "Table 5"
  },
  "source": "QR",
  "sessionToken": "qr-session-token",
  "customer": {
    "id": "customerId",
    "name": "Rahul",
    "phone": "9876543210"
  },
  "status": "PLACED",
  "note": "",
  "items": [
    {
      "lineId": "lineId1",
      "itemId": "itemId",
      "variantId": "variantId",
      "name": "Paneer Tikka",
      "variantName": "Full",
      "quantity": 2,
      "unitPrice": 220,
      "taxPercentage": 5,
      "options": [],
      "note": "",
      "lineSubTotal": 440,
      "lineTax": 22,
      "lineTotal": 462,
      "kitchenStatus": "PLACED",
      "addedAt": "2026-03-27T10:00:00.000Z"
    }
  ],
  "subTotal": 440,
  "taxTotal": 22,
  "grandTotal": 462,
  "invoiceRequest": {
    "requestedAt": "2026-03-27T10:15:00.000Z",
    "source": "QR",
    "name": "Rahul",
    "phone": "9876543210"
  },
  "createdBy": {
    "userId": null,
    "role": "GUEST",
    "name": "Rahul"
  },
  "updatedBy": {
    "userId": null,
    "role": "GUEST",
    "name": "Rahul"
  },
  "createdAt": "2026-03-27T10:00:00.000Z",
  "updatedAt": "2026-03-27T10:15:00.000Z"
}
```

### Invoice response
```json
{
  "id": "invoiceId",
  "tenantId": "tenantId",
  "isGroupInvoice": false,
  "orderId": "orderId",
  "orderIds": [],
  "table": {
    "id": "tableId",
    "number": 5,
    "name": "Table 5"
  },
  "customer": {
    "id": "customerId",
    "name": "Rahul",
    "phone": "9876543210"
  },
  "status": "ISSUED",
  "note": "",
  "items": [],
  "subTotal": 440,
  "taxTotal": 22,
  "grandTotal": 462,
  "discount": {
    "type": null,
    "value": 0,
    "amount": 0
  },
  "totalDue": 462,
  "balanceDue": 462,
  "payment": null,
  "createdAt": "2026-03-27T10:20:00.000Z",
  "updatedAt": "2026-03-27T10:20:00.000Z"
}
```

## 6. Public QR APIs

Use one static QR token per table.

### GET `/api/public/menu?token=<TABLE_QR_TOKEN>`

Returns tenant, table, and public menu tree.

### POST `/api/public/orders`

Create a new QR order or append to same QR order.

Request for first order:
```json
{
  "token": "TABLE_QR_TOKEN",
  "customerName": "Rahul",
  "customerPhone": "9876543210",
  "note": "",
  "items": [
    { "itemId": "itemId1", "variantId": "variantId1", "quantity": 2 }
  ]
}
```

Request for repeat action on same order:
```json
{
  "token": "TABLE_QR_TOKEN",
  "sessionToken": "qr-session-token",
  "customerName": "Rahul",
  "customerPhone": "9876543210",
  "items": [
    { "itemId": "itemId2", "variantId": "variantId2", "quantity": 1 }
  ]
}
```

Behavior:
- If `sessionToken` is missing, a new independent QR order is created.
- If `sessionToken` matches an open order on same table, items append to that order only.
- If previous session order is `COMPLETED` or `CANCELLED`, backend creates a fresh order and returns a new `sessionToken`.

### GET `/api/public/orders/current?token=<TABLE_QR_TOKEN>&sessionToken=<SESSION_TOKEN>`

Returns current QR order and its invoice if already created.

Response:
```json
{
  "order": {},
  "invoice": null
}
```

### PUT `/api/public/orders/current/items/:lineId`

Update one QR item line.

Request:
```json
{
  "token": "TABLE_QR_TOKEN",
  "sessionToken": "qr-session-token",
  "quantity": 3,
  "note": "less spicy"
}
```

Rules:
- Allowed only when target line status is `PLACED`
- Cannot update after invoice creation

### DELETE `/api/public/orders/current/items/:lineId?token=<TABLE_QR_TOKEN>&sessionToken=<SESSION_TOKEN>`

Delete one QR item line.

Rules:
- Allowed only when target line status is `PLACED`
- Last remaining line cannot be deleted; call order cancel instead

### POST `/api/public/orders/current/cancel`

Cancel the full QR order.

Request:
```json
{
  "token": "TABLE_QR_TOKEN",
  "sessionToken": "qr-session-token"
}
```

Rules:
- Full order cancel works only when all non-cancelled items are still `PLACED`
- If kitchen has started work on any active item, cancel is rejected

### POST `/api/public/orders/current/request-invoice`

Marks order as bill-requested for waiter dashboard/UI.

Request:
```json
{
  "token": "TABLE_QR_TOKEN",
  "sessionToken": "qr-session-token"
}
```

Response:
```json
{
  "message": "invoice requested successfully",
  "order": {}
}
```

### POST `/api/public/orders/current/invoice`

Create a single-order invoice directly from QR session.

Request:
```json
{
  "token": "TABLE_QR_TOKEN",
  "sessionToken": "qr-session-token",
  "note": "Please send bill"
}
```

Rules:
- Allowed only when all items are `SERVED` or `CANCELLED`
- Invoice status becomes `ISSUED`
- Final payment still requires protected staff API

## 7. Staff Order APIs

### POST `/api/orders`

Default behavior:
```json
{
  "tableId": "tableId",
  "items": [
    { "itemId": "itemId1", "variantId": "variantId1", "quantity": 2 }
  ]
}
```

If there is an open non-billed order on same table, backend appends to latest open order.

### Create second independent order on same table
```json
{
  "tableId": "tableId",
  "forceNew": true,
  "items": [
    { "itemId": "itemId1", "variantId": "variantId1", "quantity": 1 }
  ]
}
```

### Append to a specific order
```json
{
  "tableId": "tableId",
  "appendToOrderId": "targetOrderId",
  "items": [
    { "itemId": "itemId2", "variantId": "variantId2", "quantity": 1 }
  ]
}
```

### PUT `/api/orders/:orderId`

Generic order update.

Rules:
- `WAITER` can still update safe order fields and kitchen statuses through existing flow
- Full item-array replacement is now restricted to `OWNER` and `MANAGER`
- Waiter should use dedicated correction APIs for item exchange/remove/cancel

## 8. Staff Item Correction APIs

These are the APIs for real-life wrong-item scenarios before invoice.

### POST `/api/orders/:orderId/items/:lineId/remove`

Remove item line completely or partially.

Request:
```json
{
  "quantity": 1
}
```

Rules:
- If `quantity` omitted, full line quantity is removed
- Allowed only when source line is `PLACED`
- Last remaining item cannot be removed

### POST `/api/orders/:orderId/items/:lineId/cancel`

Soft-cancel one line.

Request body can be empty.

Rules:
- Allowed only when source line is `PLACED`
- Line status becomes `CANCELLED`

### POST `/api/orders/:orderId/items/:lineId/move`

Move wrong item to another open order on same table.

Request:
```json
{
  "targetOrderId": "orderB",
  "quantity": 1
}
```

Rules:
- Source and target orders must both be open and non-billed
- Source and target must belong to the same table
- Source line must be `PLACED`
- Partial quantity move is supported
- If full quantity is moved, line leaves source order
- If partial quantity is moved, source line quantity is reduced and a new line is created in target order

## 9. Invoice APIs

### POST `/api/invoices`

Create single-order invoice from staff side.

Request:
```json
{
  "orderId": "orderId",
  "discountType": "PERCENTAGE",
  "discountValue": 10,
  "note": "VIP discount"
}
```

Rules:
- Allowed for `OWNER`, `MANAGER`, `WAITER`
- All items must be `SERVED` or `CANCELLED`

### POST `/api/invoices/group`

Create one bill for multiple open orders on same table.

Bill all eligible open orders on a table:
```json
{
  "tableId": "tableId"
}
```

Bill selected orders only:
```json
{
  "tableId": "tableId",
  "orderIds": ["orderA", "orderB"],
  "discountType": "FLAT",
  "discountValue": 100,
  "note": "Group dinner"
}
```

Rules:
- Only open non-billed orders are eligible
- Every included order must belong to same table
- Every included item must be `SERVED` or `CANCELLED`

### POST `/api/invoices/:invoiceId/pay`

Final payment endpoint.

Request:
```json
{
  "method": "CASH",
  "reference": "",
  "paidAmount": 462
}
```

Rules:
- Allowed only for `OWNER` or `MANAGER`
- On success invoice becomes `PAID`
- Covered order or orders become `COMPLETED`
- Table status recalculates automatically

### PUT `/api/invoices/:invoiceId`

Owner or manager can update note and discount before payment.

### DELETE `/api/invoices/:invoiceId`

Owner or manager can delete only non-paid invoice.

Behavior:
- Order lock is removed
- Table status recalculates

## 10. Frontend Contract Notes

### Static QR flow
1. Customer scans QR.
2. Frontend calls `GET /api/public/menu?token=...`.
3. Frontend stores `sessionToken` returned by first `POST /api/public/orders`.
4. All future QR order calls must include same `sessionToken`.
5. If backend returns a new `sessionToken`, frontend must replace local stored token.

### Recommended customer UI states
- Cart editable: line status `PLACED`
- Locked by kitchen: line status `IN_PROGRESS`, `READY`, or `SERVED`
- Bill requested: `order.invoiceRequest != null`
- Invoice issued: `invoice.status = ISSUED`
- Paid: `invoice.status = PAID`

### Recommended waiter UI states
- Show each open order separately on same table
- Show `invoiceRequest` badge when customer requests bill
- Use move/remove/cancel correction endpoints before invoice create
- For split billing use single-order invoices
- For one combined bill use group invoice

## 11. Production Edge Cases

- Same table can have Order A and Order B together.
- Waiter can accidentally add item to wrong order.
- Before kitchen starts, waiter can move item from Order B to Order A.
- If wrong item should disappear fully, waiter can remove line.
- If customer placed wrong line from QR and kitchen has not started, customer can delete it.
- If customer wants full order cancellation, all active lines must still be `PLACED`.
- If invoice already exists, order mutation is blocked.
- If unpaid invoice exists on table, fresh new order creation is blocked for that table.

## 12. Common Error Cases

- `400` invalid id, invalid quantity, invalid discount
- `404` table/order/invoice/session line not found
- `409` billing lock, already invoiced, invalid status transition, kitchen-started item correction blocked

Examples:
- `cannot update order after invoice is created`
- `cannot create invoice until all items are served or cancelled`
- `cannot move item once kitchen work has started; only PLACED items are editable`
- `cannot create order while table has unpaid invoice`

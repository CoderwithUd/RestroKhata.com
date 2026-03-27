# QR Order and Invoice Walkthrough

## 1. One Table, One Static QR

1. Manager generates one QR token for table 5.
2. Customer scans QR.
3. Frontend loads menu using `GET /api/public/menu?token=...`.
4. Customer creates order using `POST /api/public/orders`.
5. Backend returns `sessionToken`.
6. Frontend stores that `sessionToken`.

## 2. Same Table, Multiple Customers

### Customer A
```json
{
  "token": "TABLE_QR_TOKEN",
  "customerName": "Aman",
  "customerPhone": "9999999991",
  "items": [
    { "itemId": "burger", "variantId": "regular", "quantity": 1 }
  ]
}
```

Response contains:
```json
{
  "order": {
    "id": "orderA",
    "sessionToken": "sessionA"
  }
}
```

### Customer B
```json
{
  "token": "TABLE_QR_TOKEN",
  "customerName": "Riya",
  "customerPhone": "9999999992",
  "items": [
    { "itemId": "pizza", "variantId": "medium", "quantity": 1 }
  ]
}
```

Response contains:
```json
{
  "order": {
    "id": "orderB",
    "sessionToken": "sessionB"
  }
}
```

Result:
- `orderA` and `orderB` are independent
- both belong to same table
- each customer can only control their own order using their own `sessionToken`

## 3. Customer Adds More Items

Customer A adds another item:
```json
{
  "token": "TABLE_QR_TOKEN",
  "sessionToken": "sessionA",
  "customerName": "Aman",
  "customerPhone": "9999999991",
  "items": [
    { "itemId": "cola", "variantId": "regular", "quantity": 2 }
  ]
}
```

Items append only to `orderA`.

## 4. Customer Self-Service Actions

### Fetch current order
`GET /api/public/orders/current?token=TABLE_QR_TOKEN&sessionToken=sessionA`

### Update quantity for one line
`PUT /api/public/orders/current/items/:lineId`

### Delete wrong item before kitchen starts
`DELETE /api/public/orders/current/items/:lineId?token=TABLE_QR_TOKEN&sessionToken=sessionA`

### Cancel full order before kitchen starts
`POST /api/public/orders/current/cancel`

### Request bill
`POST /api/public/orders/current/request-invoice`

### Create invoice from QR
`POST /api/public/orders/current/invoice`

Important rule:
- Customer can only edit `PLACED` lines
- once kitchen starts, customer-side delete/update/cancel is blocked

## 5. Waiter Multi-Order on Same Table

### Create a fresh second staff order
```json
{
  "tableId": "table5",
  "forceNew": true,
  "items": [
    { "itemId": "soup", "variantId": "half", "quantity": 1 }
  ]
}
```

### Append to a specific order
```json
{
  "tableId": "table5",
  "appendToOrderId": "orderB",
  "items": [
    { "itemId": "naan", "variantId": "plain", "quantity": 2 }
  ]
}
```

## 6. Real-Life Wrong Item Scenario

Table 5 has:
- `orderA`: 5 items
- `orderB`: 1 item

Mistake:
- waiter adds 1 extra item to `orderB`
- actually that item belongs to `orderA`

### Fix by moving item
`POST /api/orders/orderB/items/:lineId/move`

Request:
```json
{
  "targetOrderId": "orderA",
  "quantity": 1
}
```

Rules:
- source line must still be `PLACED`
- source and target must be same table
- both orders must be open and non-billed

### Fix by removing item
`POST /api/orders/orderB/items/:lineId/remove`

### Fix by soft-cancel line
`POST /api/orders/orderB/items/:lineId/cancel`

## 7. Billing Scenarios

### Single invoice
Use `POST /api/invoices`

### Group invoice for whole table
Use `POST /api/invoices/group`

### Customer-generated QR invoice
Use `POST /api/public/orders/current/invoice`

Same rule for every invoice:
- all lines must be `SERVED` or `CANCELLED`

## 8. Payment Rule

Final payment is not public.

Only:
- `OWNER`
- `MANAGER`

can call:
- `POST /api/invoices/:invoiceId/pay`

## 9. Frontend Checklist

- Store `sessionToken` after first QR order create
- Keep one local session per browser/user
- Show separate cards for every order on same table in staff UI
- Disable edit/delete buttons for non-`PLACED` items
- Show bill-request badge when `invoiceRequest` exists
- After invoice creation, lock order editing UI
- After payment, move order to completed state

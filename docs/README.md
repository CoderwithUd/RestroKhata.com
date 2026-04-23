# Restro Backend API Documentation

This document replaces the older scattered docs and is the single source of truth for this backend as of April 1, 2026.

Machine-readable API assets:

- [OpenAPI JSON](./openapi.json)
- [Postman collection](./postman.collection.json)
- [Curl examples](./curl-examples.md)
- Regenerate them with `npm run docs:api`

## 1. Project Summary

This backend powers a restaurant SaaS system with:

- multi-tenant auth
- role-based access
- menu and option management
- table and reservation management
- customer tracking
- staff and QR based order flows
- invoice and payment handling
- expense tracking
- dashboard reports

Base API prefix: `/api`

Health endpoint: `GET /api/health`

Primary roles:

- `OWNER`
- `MANAGER`
- `KITCHEN`
- `WAITER`

Core order statuses:

- `PLACED`
- `IN_PROGRESS`
- `READY`
- `SERVED`
- `COMPLETED`
- `CANCELLED`

Core invoice statuses:

- `DRAFT`
- `ISSUED`
- `PAID`
- `VOID`

Core table statuses:

- `available`
- `occupied`
- `reserved`

Core service modes:

- `DINE_IN`
- `TAKEAWAY`
- `WALK_IN`

Core fulfillment types:

- `KITCHEN`
- `BAR`
- `COUNTER`
- `DIRECT`

## 2. Runtime And Transport Notes

### Authentication transport

Protected APIs accept access token in either:

- `Cookie: accessToken=...`
- `Authorization: Bearer <token>`

Refresh token can be sent through:

- `Cookie: refreshToken=...`
- `x-refresh-token`
- `x-refresh`
- `refresh-token`
- body field `refreshToken`
- `Authorization: Refresh <token>`

### Tenant slug resolution

Some public and login flows resolve tenant slug from:

- header `x-tenant-slug`
- body `tenantSlug`
- query `tenantSlug`
- subdomain

### Subscription gate

Most protected tenant APIs require an active subscription. Only subscription statuses `TRIAL` and `ACTIVE` are considered active, and `endsAt` must still be in the future.

### Public API rate limits

Public routes use express-rate-limit:

- `GET /api/public/menu` and `GET /api/public/orders/current`: 120 req/min
- write-style public order routes: 30 req/min

## 3. Common Conventions

### Object IDs

Most entity ids are MongoDB ObjectIds. Invalid ids usually return `400`.

### Pagination

Where supported:

- `page` must be `>= 1`
- `limit` must be between `1` and `100`
- kitchen queue allows `limit` between `1` and `500`

### Phone and WhatsApp validation

- WhatsApp and customer phone numbers must contain `7` to `15` digits
- system stores normalized form like `+919876543210`

### Typical error response

```json
{
  "message": "human readable error"
}
```

## 4. Core Data Model

### Tenant

Important fields:

- `id`
- `name`
- `slug`
- `status`
- `contactNumber`
- `email`
- `secondaryNumber`
- `ownerName`
- `gstNumber`
- `address`
- `location`

### User

Important fields:

- `id`
- `name`
- `email`
- `whatsappNumber`
- `isActive`

### Membership

Links a user to a tenant with one role.

Important fields:

- `membershipId`
- `userId`
- `tenantId`
- `role`
- `isActive`

### Menu

Hierarchy:

1. category
2. item
3. variant
4. option group
5. option
6. item-option-group mapping

### Table

Important fields:

- `number`
- `name`
- `capacity`
- `isActive`
- `status`
- `reservation`
- `qrPayload`
- `qrCode`

### Customer

Important fields:

- `id`
- `name`
- `phoneRaw`
- `phoneNormalized`
- `visitCount`
- `lastSeenAt`

### Order

Important fields:

- `id`
- `table`
- `source` (`STAFF` or `QR`)
- `sessionToken` for QR orders
- `customer`
- `status`
- `billingLocked`
- `invoiceRequestedAt`
- `items[]`
- `subTotal`
- `taxTotal`
- `grandTotal`

Each order item stores:

- `lineId`
- `itemId`
- `variantId`
- `name`
- `variantName`
- `quantity`
- `unitPrice`
- `options[]`
- `taxPercentage`
- `lineSubTotal`
- `lineTax`
- `lineTotal`
- `kitchenStatus`
- `addedAt`

### Invoice

Important fields:

- `id`
- `isGroupInvoice`
- `orderId`
- `orderIds`
- `table`
- `customer`
- `status`
- `items[]`
- `discount`
- `totalDue`
- `payment`

### Expense

Important fields:

- `id`
- `amount`
- `category`
- `note`
- `expenseDate`

## 5. High Level Data Flows

### Owner onboarding flow

1. `POST /api/auth/register-owner`
2. user, tenant, membership, and trial subscription are created in one transaction
3. access and refresh tokens are issued
4. auth cookies are set

### Staff order flow

1. waiter creates order against a table
2. order either appends to an open order or creates a new one
3. kitchen updates item or order statuses
4. invoice is created after items are served or cancelled
5. payment completes order and releases table

### Public QR order flow

1. table QR or token identifies restaurant and table
2. guest loads public menu
3. guest creates order and receives `sessionToken`
4. same guest uses `sessionToken` to edit only their own order
5. guest requests invoice or creates invoice when service is done

## 6. Authorization Matrix

### Auth

- public: register, login, refresh, logout, staff role listing
- authenticated: `GET/PUT /api/auth/me`

### Tenant and staff

- read profile: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`
- update profile: `OWNER`, `MANAGER`
- staff CRUD: `OWNER`, `MANAGER`

### Menu

- create/update/delete categories and items: `OWNER`, `MANAGER`
- list/read menu: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`
- item and variant availability routes: `KITCHEN`

### Tables

- create/update/delete/QR: `OWNER`, `MANAGER`
- list: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`

### Customers

- read: `OWNER`, `MANAGER`, `WAITER`

### Orders

- create: `OWNER`, `MANAGER`, `WAITER`
- read: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`
- kitchen queue: `OWNER`, `MANAGER`, `KITCHEN`
- delete: `OWNER`, `MANAGER`

### Invoices

- create/list/read: `OWNER`, `MANAGER`, `WAITER`
- update/pay/delete: `OWNER`, `MANAGER`

### Expenses and reports

- `OWNER`, `MANAGER`

## 7. Auth APIs

### `POST /api/auth/register-owner`

Creates owner user, tenant, owner membership, and 3 month trial subscription.

Required body:

```json
{
  "tenantName": "Spice House",
  "ownerName": "Amit",
  "whatsappNumber": "+91 9876543210",
  "email": "owner@example.com",
  "password": "secret123",
  "address": "Raipur, Chhattisgarh"
}
```

Optional body:

- `restaurantSlug` or `tenantSlug`
- `gstNumber`
- `secondaryNumber`
- `location.latitude`
- `location.longitude`

Accepted aliases:

- phone: `number`, `phone`, `mobile`, `contactNumber`
- tenant name: `restaurantName`

Success:

- `201`
- sets auth cookies
- returns `accessToken`, `refreshToken`, `user`, `tenant`, `role`

Handled cases:

- duplicate WhatsApp -> `409`
- duplicate email -> `409`
- bad location payload -> `400`
- address geocoding failure falls back to unresolved address if possible

### `POST /api/auth/login`

Login using WhatsApp or email.

Example:

```json
{
  "email": "waiter@example.com",
  "password": "secret123",
  "role": "WAITER",
  "tenantSlug": "spice-house"
}
```

Rules:

- must send either WhatsApp or email
- `role` is optional but must be valid if sent
- if user belongs to multiple active restaurants and tenant slug is missing, API returns `400` with `options[]`

Cases:

- invalid credentials -> `401`
- no membership -> `403`
- no matching tenant-role combo -> `403`
- inactive subscription -> `402`

### `POST /api/auth/refresh`

Returns new access and refresh tokens and rotates refresh session hash.

Cases:

- missing token -> `401`
- invalid token -> `401`
- expired or revoked session -> `401`
- revoked membership -> `403`
- inactive subscription -> `402`

### `POST /api/auth/logout`

Revokes refresh session if possible and clears auth cookies.

### `GET /api/auth/me`

Returns current `user`, `tenant`, and `role`.

### `PUT /api/auth/me`

Allowed body fields:

- `name`
- `email`
- `whatsappNumber`
- `password`

Cases:

- empty name -> `400`
- invalid email or phone -> `400`
- duplicate email or phone -> `409`
- password shorter than 6 -> `400`

### `GET /api/auth/staff-roles`

Returns available staff roles for UI dropdowns.

## 8. Tenant And Staff APIs

### `GET /api/tenant/profile`

Returns:

- tenant profile
- current user summary
- role
- subscription summary

### `PUT /api/tenant/profile`

Allowed fields:

- `tenantName` or `name`
- `contactNumber`
- `secondaryNumber`
- `email`
- `ownerName`
- `gstNumber`
- `address`
- `location`

Cases:

- invalid contact numbers -> `400`
- invalid email -> `400`
- invalid location or address payload -> `400`
- tenant missing -> `404`

### `GET /api/tenant/staff`

Returns owner plus staff memberships.

### `POST /api/tenant/staff`

Alias: `POST /api/tenant/staff/register`

Required:

- `name`
- `whatsappNumber`
- `password`
- `role`

Optional:

- `email`

Role must be one of:

- `MANAGER`
- `KITCHEN`
- `WAITER`

Cases:

- duplicate WhatsApp or email -> `409`
- invalid role -> `400`

### `PUT /api/tenant/staff/:membershipId`

Allowed fields:

- `name`
- `role`
- `isActive`
- `whatsappNumber`
- `email`
- `password`

Cases:

- invalid role -> `400`
- duplicate email or phone -> `409`
- staff not found -> `404`

### `DELETE /api/tenant/staff/:membershipId`

Soft deactivates staff membership by setting `isActive=false`.

## 9. Menu APIs

### Category endpoints

#### `POST /api/menu/categories`

Body:

```json
{
  "name": "Main Course",
  "parentId": null,
  "sortOrder": 1
}
```

Cases:

- missing name -> `400`
- invalid `sortOrder` -> `400`
- invalid parent category -> `400`
- duplicate category under same parent -> `409`

#### `GET /api/menu/categories`

Query:

- `flat=true` for flat list

Default response is nested tree with `children`.

#### `PUT /api/menu/categories/:categoryId`

Can update:

- `name`
- `parentId`
- `sortOrder`

Special cases:

- cannot parent category to itself
- cannot create circular hierarchy

#### `DELETE /api/menu/categories/:categoryId`

Blocked if category still has:

- child categories
- menu items

### Item endpoints

#### `POST /api/menu/items`

Required:

- `name`
- `categoryId`
- `variants` with at least one variant

Optional:

- `description`
- `image`
- `taxPercentage`
- `sortOrder`
- `optionGroupIds`

Example:

```json
{
  "name": "Paneer Tikka",
  "description": "Starter",
  "categoryId": "664000000000000000000001",
  "taxPercentage": 5,
  "sortOrder": 10,
  "optionGroupIds": ["664000000000000000000010"],
  "variants": [
    { "name": "Half", "price": 160, "sortOrder": 1, "isAvailable": true },
    { "name": "Full", "price": 280, "sortOrder": 2, "isAvailable": true }
  ]
}
```

Variant rules:

- each variant needs `name` and `price`
- duplicate variant names in same request are rejected
- `price >= 0`
- `sortOrder` numeric
- `isAvailable` boolean if supplied

Cases:

- bad category -> `404`
- unknown option group -> `404`
- duplicate item name in same category -> `409`

#### `GET /api/menu/items`

Query:

- `categoryId`
- `isAvailable=true|false`
- `q`
- `page`
- `limit`

Returns detailed item object with category, variants, and option groups.

#### `GET /api/menu/items/:itemId`

Returns one detailed item.

#### `PUT /api/menu/items/:itemId`

Full replacement update. Body is same shape as create item.

Important behavior:

- variants are deleted and recreated
- item-option-group mappings are deleted and recreated

#### `PATCH /api/menu/items/:itemId/availability`

Kitchen route.

Body:

```json
{ "isAvailable": false }
```

#### `PATCH /api/menu/variants/:variantId/availability`

Kitchen route for one variant.

#### `DELETE /api/menu/items/:itemId`

Deletes item, its variants, and option mappings in one transaction.

### Option group endpoints

#### `POST /api/menu/option-groups`

Required:

- `name`

Optional:

- `minSelect`
- `maxSelect`
- `sortOrder`

Rules:

- `minSelect` and `maxSelect` must be integers
- `minSelect <= maxSelect`

#### `GET /api/menu/option-groups`

Returns groups with nested options.

#### `PUT /api/menu/option-groups/:groupId`

Can update:

- `name`
- `minSelect`
- `maxSelect`
- `sortOrder`

#### `DELETE /api/menu/option-groups/:groupId`

Blocked if group is still attached to any menu item.

### Option endpoints

#### `POST /api/menu/option-groups/:groupId/options`

Required:

- `name`

Optional:

- `price`
- `sortOrder`
- `isAvailable`

#### `PUT /api/menu/options/:optionId`

Can update:

- `name`
- `price`
- `sortOrder`
- `isAvailable`

#### `DELETE /api/menu/options/:optionId`

Deletes one option.

### Aggregate menu endpoint

#### `GET /api/menu/menu`

Query:

- `isAvailable=true|false`

Returns nested category tree with attached items.

## 10. Table APIs

### `POST /api/tables`

Required:

- `number`

Optional:

- `name`
- `capacity`
- `isActive`
- `status`
- reservation payload

Simple example:

```json
{
  "number": 5,
  "name": "Window 5",
  "capacity": 4
}
```

Reservation example:

```json
{
  "number": 7,
  "status": "reserved",
  "reservation": {
    "customerName": "Neha",
    "customerPhone": "9876543210",
    "partySize": 3,
    "reservedFor": "2026-04-01T20:00:00.000Z",
    "note": "Birthday",
    "advancePayment": {
      "required": true,
      "amount": 500,
      "paidAmount": 200,
      "method": "UPI",
      "reference": "TXN123"
    }
  }
}
```

Reservation rules:

- `customerName` and `customerPhone` required together
- `partySize` must be integer `>= 1`
- `reservedFor` must be valid date
- advance payment amount rules are enforced

Response includes generated QR URL and QR image.

### `GET /api/tables`

Query:

- `isActive=true|false`

Returns all tables sorted by number.

### `PUT /api/tables/:tableId`

Can update:

- `number`
- `name`
- `capacity`
- `isActive`
- `status`
- `reservation`

Important cases:

- cannot set table to `available` if pending session exists
- cannot deactivate table with pending session
- setting status to `available` clears reservation

### `DELETE /api/tables/:tableId`

Blocked if table has active order session.

Conflict response includes linked open orders and unpaid invoices:

```json
{
  "message": "cannot delete table with active orders",
  "orders": [{ "orderId": "...", "status": "PLACED" }],
  "invoices": [{ "invoiceId": "...", "orderId": "...", "status": "ISSUED" }]
}
```

### `GET /api/tables/:tableId/qr`

Query:

- `baseUrl`
- `format=dataUrl|svg`

Generates fresh QR pointing to public menu with `tenantSlug` and `tableId`.

### `POST /api/tables/:tableId/qr-token`

Creates token-based QR.

Optional body or query:

- `expiresInHours`
- `expiresAt`
- `baseUrl`
- `format`

Use token QR when you do not want to expose direct tenant and table ids in client URL.

### Reservation advance APIs

These endpoints manage reservation money that remains as a liability until it is consumed, refunded, or forfeited.

#### `POST /api/tables/:tableId/reservation/advance`

Required:

- `amount`

Optional:

- `method`
- `reference`
- `note`

Behavior:

- adds advance against an active reservation
- rejects amounts `<= 0`
- cannot collect more than the remaining required advance when `required=true`
- creates a payment ledger entry of type `RESERVATION_ADVANCE_RECEIVED`

#### `POST /api/tables/:tableId/reservation/refund`

Required:

- `amount` or omit it to refund the full current liability balance

Optional:

- `method`
- `reference`
- `note`
- `releaseReservation=true|false`

Behavior:

- creates a payment ledger entry of type `RESERVATION_ADVANCE_REFUND`
- if `releaseReservation=true`, the reservation is closed only when liability balance reaches `0`
- amount cannot exceed current liability balance

#### `POST /api/tables/:tableId/reservation/no-show`

Required:

- `action` with value `refund` or `forfeit`

Optional:

- `amount` or omit it to settle the full remaining liability balance
- `method`
- `reference`
- `note`

Behavior:

- marks reservation inactive
- sets table back to `available`
- creates a payment ledger entry of type `RESERVATION_ADVANCE_REFUND` or `RESERVATION_ADVANCE_FORFEIT`
- amount must exactly equal the current liability balance

## 11. Customer APIs

### `GET /api/customers`

Query:

- `q`
- `page`
- `limit`

Searches by:

- `name`
- `phoneRaw`
- `phoneNormalized`

Returns pagination metadata.

### `GET /api/customers/:customerId`

Returns one customer.

## 12. Order APIs

### Order response shape

Every order response returns:

- `id`
- `table`
- `source`
- `customer`
- `status`
- `note`
- `items[]`
- `subTotal`
- `taxTotal`
- `grandTotal`
- `invoiceRequest`
- `createdBy`
- `updatedBy`
- timestamps

### `POST /api/orders`

Required:

- `tableId`
- `items[]`

Optional:

- `note`
- `forceNew`
- `appendToOrderId`
- `customerId`
- `customerName`
- `customerPhone`

Example:

```json
{
  "tableId": "664000000000000000000050",
  "customerName": "Rohit",
  "customerPhone": "9876543210",
  "items": [
    {
      "itemId": "664000000000000000000101",
      "variantId": "664000000000000000000102",
      "quantity": 2,
      "optionIds": ["664000000000000000000201"],
      "note": "Less spicy"
    }
  ]
}
```

Item build rules:

- `itemId` valid and available
- `variantId` valid and belongs to item
- `optionIds` must belong to option groups attached to item
- unavailable options, items, or variants are rejected
- option group `minSelect` and `maxSelect` are enforced

Three create cases:

1. `appendToOrderId` present: append specifically to that order.
2. `forceNew=false` or omitted: append to latest open order for same table if one exists and is not billed.
3. `forceNew=true` or no open order: create new order.

Important cases:

- unpaid invoice already exists on table -> `409`
- target order missing or already billed -> `404`
- customerId plus customerName and customerPhone together -> `400`

### `GET /api/orders`

Query:

- `tableId`
- `status=PLACED,READY`
- `page`
- `limit`

Kitchen users without explicit status filter automatically see only active statuses.

### `GET /api/orders/kitchen/items`

Kitchen queue endpoint.

Query:

- `tableId`
- `status`
- `includeDone=true|false`
- `limit`

Behavior:

- owner or manager can request done statuses with `includeDone=true`
- kitchen cannot request `SERVED`, `COMPLETED`, `CANCELLED` via filter unless includeDone is enabled and role allows it
- queue items are prioritized by age and kitchen status

Returned queue item includes:

- `orderId`
- `lineId`
- `table`
- `customer`
- `orderStatus`
- `item.kitchenStatus`
- `item.ageMinutes`
- `item.priorityLabel`

### `GET /api/orders/:orderId`

Returns one order.

### `PUT /api/orders/:orderId`

This is the most flexible update endpoint.

Allowed update groups:

- move order to another table with `tableId`
- update note
- update customer info
- replace full items array
- update full order status
- update selected line statuses through `itemStatusUpdates`

Important mutual exclusion rules:

- cannot send `items` and `status` together
- cannot send `itemStatusUpdates` and `status` together
- cannot send `itemStatusUpdates` and `items` together

Kitchen role restriction:

- kitchen cannot update `tableId`, `note`, `customerName`, `customerPhone`, or full `items`
- kitchen can update status transitions only

Status transition graph:

- `PLACED -> IN_PROGRESS or CANCELLED`
- `IN_PROGRESS -> READY or CANCELLED`
- `READY -> SERVED`
- `SERVED -> COMPLETED`
- `COMPLETED -> no further transition`
- `CANCELLED -> no further transition`

Example for item status updates:

```json
{
  "itemStatusUpdates": [
    { "lineId": "67f0...", "status": "IN_PROGRESS" },
    { "lineId": "67f1...", "status": "READY" }
  ]
}
```

Important side effect:

- if editable invoices already exist for this order, backend deletes those invoices and unlocks orders before allowing mutation
- paid or void invoices block mutation with `409`

### `POST /api/orders/:orderId/items/:lineId/remove`

Removes full item or reduces quantity.

Optional body:

```json
{ "quantity": 1 }
```

Rules:

- quantity must be integer `>= 1`
- quantity cannot exceed current quantity
- cannot remove item in `CANCELLED` or `COMPLETED` state
- cannot remove last remaining item; cancel order instead

### `POST /api/orders/:orderId/items/:lineId/cancel`

Cancels one line item and zeros out its money values.

### `POST /api/orders/:orderId/items/:lineId/move`

Moves one line item or partial quantity.

Body requires one of:

- `targetOrderId`
- `targetTableId`

Optional:

- `quantity`

Behavior:

- can move to another existing order
- or move to another table, creating target order if needed
- cannot move from or to closed orders
- cannot move last remaining item; cancel order instead

### `DELETE /api/orders/:orderId`

Deletes order only if:

- order exists
- order is not billing locked
- no invoice exists for that order

## 13. Invoice APIs

### Invoice response shape

Includes:

- `id`
- `isGroupInvoice`
- `orderId`
- `orderIds`
- `table`
- `customer`
- `status`
- `items`
- `subTotal`
- `taxTotal`
- `grandTotal`
- `discount`
- `totalDue`
- `balanceDue`
- `payment`

### `POST /api/invoices`

Creates invoice for one order.

Required:

- `orderId`

Optional:

- `note`
- `customerId`
- `customerName`
- `customerPhone`
- `discountType`
- `discountValue`

Discount rules:

- `discountType` must be `PERCENTAGE` or `FLAT`
- percentage must be `0..100`
- discount amount cannot exceed order grand total

Invoice creation preconditions:

- order must exist
- order must not be cancelled
- no unfinished kitchen item can remain
- no invoice should already exist for that order

Side effect:

- order is billing locked
- invoice request fields are cleared

### `POST /api/invoices/group`

Creates one invoice for multiple open orders of the same table.

Required:

- `tableId`

Optional:

- `orderIds[]`
- `note`
- customer fields
- discount fields

Behavior:

- if `orderIds` omitted, backend takes all eligible open orders for that table
- all target orders must be not cancelled, not completed, not already billed
- all kitchen items across all orders must be `SERVED` or `CANCELLED`

### `GET /api/invoices`

Query:

- `orderId`
- `tableId`
- `status`
- `page`
- `limit`

### `GET /api/invoices/:invoiceId`

Returns one invoice.

### `PUT /api/invoices/:invoiceId`

Can update:

- `note`
- `discountType`
- `discountValue`

Cases:

- paid or void invoice discount update blocked with `409`
- no updates provided -> `400`

### `POST /api/invoices/:invoiceId/pay`

Marks invoice paid and completes covered orders.

Optional body:

```json
{
  "paidAmount": 850,
  "method": "UPI",
  "reference": "UPI-REF-123"
}
```

Rules:

- if `paidAmount` omitted, backend uses `totalDue`
- `paidAmount` must exactly match `totalDue`
- paid invoice cannot be paid again
- void invoice cannot be paid

Side effects:

- invoice status -> `PAID`
- payment object saved
- all covered orders -> `COMPLETED`
- orders unlocked
- table status re-synced

### `DELETE /api/invoices/:invoiceId`

Deletes invoice only if it is not paid.

Side effects:

- related orders are unlocked
- table status re-synced

### `GET /api/invoices/:invoiceId/payments`

Returns payment history entries linked to one invoice.

Response:

- `items[]` with payment ledger records
- `total`

Use this endpoint when the frontend needs a payment timeline or audit trail for a bill.

## 14. Payment APIs

### `GET /api/payments`

Query:

- `invoiceId`
- `tableId`
- `orderId`
- `customerId`
- `type`
- `page`
- `limit`

Returns:

- `items[]`
- `pagination`

Use this endpoint for global cashflow, payment audit, or reconciliation screens.

## 15. Expense APIs

### `POST /api/expenses`

Required:

- `amount`

Optional:

- `category`
- `note`
- `expenseDate`

### `GET /api/expenses`

Query:

- `from`
- `to`
- `page`
- `limit`

### `PUT /api/expenses/:expenseId`

Can update:

- `amount`
- `category`
- `note`
- `expenseDate`

### `DELETE /api/expenses/:expenseId`

Deletes one expense.

## 16. Report APIs

### `GET /api/reports/summary`

Returns:

- timezone
- last 7 day range
- current month aggregate
- overall totals for the last 7 days
- `days[]` with orders, invoices, paid invoices, sales, expenses, profit

Time zone used: `Asia/Kolkata`

### `GET /api/reports/monthly`

Returns monthly data from tenant creation month to current month:

- `months[]`
- `totals`
- range metadata

## 17. Public QR APIs

Public APIs work without staff login. They resolve restaurant by `tenantSlug` or by QR `token`.

### `GET /api/public/menu`

Supported query styles:

1. token flow

```http
GET /api/public/menu?token=abc123
```

2. direct tenant flow

```http
GET /api/public/menu?tenantSlug=spice-house&tableId=664...
```

or

```http
GET /api/public/menu?tenantSlug=spice-house&tableNumber=7
```

Returns:

- tenant summary
- optional table summary
- nested categories with only available items, variants, active option groups, and available options

### `POST /api/public/orders`

Creates or appends to guest's own order.

Required:

- tenant and table context via `token` or `tenantSlug + tableId/tableNumber`
- `customerName`
- `customerPhone`
- `items[]`

Optional:

- `note`
- `sessionToken`

Example:

```json
{
  "token": "qr_token_here",
  "customerName": "Guest One",
  "customerPhone": "9876543210",
  "items": [
    {
      "itemId": "664000000000000000000101",
      "variantId": "664000000000000000000102",
      "quantity": 1,
      "optionIds": []
    }
  ]
}
```

Important behavior:

- if `sessionToken` matches an existing open QR order for same table, items append to that order only
- otherwise backend creates a fresh `sessionToken`
- one guest does not automatically merge into another guest's QR order
- unpaid issued or draft invoice on table blocks new public order creation

Success response returns `order.sessionToken`.

### `GET /api/public/orders/current`

Required:

- `token` or tenant-table context
- `sessionToken`

Returns:

- current order
- linked invoice if exists

### `PUT /api/public/orders/current/items/:lineId`

Guest can edit only `PLACED` items.

Required:

- `sessionToken`
- `quantity`

Optional:

- `note`

Cases:

- non-placed line cannot be edited -> `409`
- if editable invoice exists, backend clears it before mutation
- paid or void invoice blocks with `409`

### `DELETE /api/public/orders/current/items/:lineId`

Deletes one line only if it is still `PLACED`.

Important case:

- last item cannot be deleted; client must cancel order instead

### `POST /api/public/orders/current/cancel`

Cancels guest's whole order only if all active items are still `PLACED`.

Side effects:

- all lines -> `CANCELLED`
- totals zeroed
- order status -> `CANCELLED`
- table status re-synced

### `POST /api/public/orders/current/request-invoice`

Marks order as invoice requested.

Saved fields:

- request timestamp
- source `QR`
- guest name and phone
- session token

### `POST /api/public/orders/current/invoice`

Creates invoice for current guest order.

Rules:

- same single-order invoice rules apply
- all items must already be `SERVED` or `CANCELLED`

## 18. Edge Cases Developers Should Know

### Invoice locking behavior

- creating invoice locks order or orders with `billingLocked=true`
- mutating order later will auto-delete editable invoice drafts or issued invoices if invoice is not paid or void
- paid and void invoices block order mutation

### Order totals behavior

- cancelled line items are zeroed out
- order totals are recalculated from billable items only

### Public order edit restriction

- guest can edit only `PLACED` items
- once kitchen work starts, guest cannot change that line

### Table availability behavior

- table status is not purely manual
- order creation, cancellation, payment, deletion, and moves can trigger sync logic

### Customer auto-upsert behavior

- many staff and public flows auto-create or update customer records by normalized phone number
- visit count can increment during order creation depending on flow

### Login ambiguity behavior

- same user can have multiple memberships
- always pass `tenantSlug` if the user works in multiple restaurants

## 19. Recommended Frontend Integration Notes

- always preserve `sessionToken` for public QR flows
- always preserve `lineId` for item-level order editing
- treat `message` as display-friendly text but build logic from status codes and payload fields
- on `409` during order or invoice actions, refetch latest order or invoice state
- for multi-tenant staff login, send `tenantSlug` explicitly

## 20. Example End-to-End Scenario

### Staff dining scenario

1. waiter logs in with `tenantSlug`
2. waiter fetches menu and tables
3. waiter creates order for table 4
4. kitchen reads `/api/orders/kitchen/items`
5. kitchen updates line statuses from `PLACED -> IN_PROGRESS -> READY -> SERVED`
6. waiter creates invoice
7. manager applies discount if needed
8. manager pays invoice
9. covered orders become `COMPLETED`
10. table becomes available again

### QR dining scenario

1. customer scans QR
2. app loads `/api/public/menu`
3. customer submits order and receives `sessionToken`
4. customer adds more items using same `sessionToken`
5. customer checks `/api/public/orders/current`
6. customer requests invoice
7. staff or public invoice flow creates invoice after service is complete

## 21. Quick Endpoint Index

### Health

- `GET /api/health`

### Auth

- `POST /api/auth/register-owner`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PUT /api/auth/me`
- `GET /api/auth/staff-roles`

### Tenant

- `GET /api/tenant/profile`
- `PUT /api/tenant/profile`
- `GET /api/tenant/staff`
- `POST /api/tenant/staff`
- `POST /api/tenant/staff/register`
- `PUT /api/tenant/staff/:membershipId`
- `DELETE /api/tenant/staff/:membershipId`

### Menu

- `POST /api/menu/categories`
- `GET /api/menu/categories`
- `PUT /api/menu/categories/:categoryId`
- `DELETE /api/menu/categories/:categoryId`
- `POST /api/menu/items`
- `GET /api/menu/items`
- `GET /api/menu/items/:itemId`
- `PUT /api/menu/items/:itemId`
- `PATCH /api/menu/items/:itemId/availability`
- `PATCH /api/menu/variants/:variantId/availability`
- `DELETE /api/menu/items/:itemId`
- `POST /api/menu/option-groups`
- `GET /api/menu/option-groups`
- `PUT /api/menu/option-groups/:groupId`
- `DELETE /api/menu/option-groups/:groupId`
- `POST /api/menu/option-groups/:groupId/options`
- `PUT /api/menu/options/:optionId`
- `DELETE /api/menu/options/:optionId`
- `GET /api/menu/menu`

### Tables

- `POST /api/tables`
- `GET /api/tables`
- `GET /api/tables/:tableId/qr`
- `POST /api/tables/:tableId/qr-token`
- `POST /api/tables/:tableId/reservation/advance`
- `POST /api/tables/:tableId/reservation/refund`
- `POST /api/tables/:tableId/reservation/no-show`
- `PUT /api/tables/:tableId`
- `DELETE /api/tables/:tableId`

### Customers

- `GET /api/customers`
- `GET /api/customers/:customerId`

### Orders

- `POST /api/orders`
- `GET /api/orders`
- `GET /api/orders/kitchen/items`
- `GET /api/orders/:orderId`
- `PUT /api/orders/:orderId`
- `POST /api/orders/:orderId/items/:lineId/move`
- `POST /api/orders/:orderId/items/:lineId/remove`
- `POST /api/orders/:orderId/items/:lineId/cancel`
- `DELETE /api/orders/:orderId`

### Invoices

- `POST /api/invoices`
- `POST /api/invoices/group`
- `GET /api/invoices`
- `GET /api/invoices/:invoiceId/payments`
- `GET /api/invoices/:invoiceId`
- `PUT /api/invoices/:invoiceId`
- `POST /api/invoices/:invoiceId/pay`
- `DELETE /api/invoices/:invoiceId`

### Payments

- `GET /api/payments`

### Expenses

- `POST /api/expenses`
- `GET /api/expenses`
- `PUT /api/expenses/:expenseId`
- `DELETE /api/expenses/:expenseId`

### Reports

- `GET /api/reports/summary`
- `GET /api/reports/monthly`

### Public

- `GET /api/public/menu`
- `POST /api/public/orders`
- `GET /api/public/orders/current`
- `PUT /api/public/orders/current/items/:lineId`
- `DELETE /api/public/orders/current/items/:lineId`
- `POST /api/public/orders/current/cancel`
- `POST /api/public/orders/current/request-invoice`
- `POST /api/public/orders/current/invoice`

## 22. Fulfillment Routing, Counter Takeaway, And Walk-In Billing

This section matters for cafes, QSR counters, dessert shops, juice bars, and mixed-format restaurants where not every sale starts from a table.

### Why this exists

Different menu items need different operational treatment:

- food usually goes to kitchen
- bottled water or packaged items may not need a queue
- coffee or shakes may belong to counter
- beer, mocktails, and soft drinks may belong to bar
- takeaway orders need a token and queue even when no table exists
- direct counter billing should not create fake tables

The backend now supports this with `fulfillmentType` and `serviceMode`.

### When to use each mode

Use `serviceMode=DINE_IN` when staff is serving a real table.

Use `serviceMode=TAKEAWAY` when the customer orders at counter, needs preparation, and should receive a token number. This is the right flow for packing orders, pickup, and queue-based preparation without a table.

Use `serviceMode=WALK_IN` only at invoice level for quick direct billing where there is no order lifecycle. This is best for direct sale items such as prepacked drinks or ready items that do not need kitchen workflow.

### Menu item behavior

Every menu item now has `fulfillmentType`:

- `KITCHEN`
- `BAR`
- `COUNTER`
- `DIRECT`

Rules:

- `DIRECT` items skip all queues and are auto-marked `SERVED`
- `KITCHEN`, `BAR`, and `COUNTER` stay in queue until staff updates status
- order and invoice lines store a snapshot of `fulfillmentType`, so changing a menu item later does not rewrite old orders

Example menu item payload:

```json
{
  "categoryId": "67f4d4f4b3f0e1a201234567",
  "name": "Cold Coffee",
  "description": "Counter prepared beverage",
  "taxPercentage": 5,
  "fulfillmentType": "COUNTER",
  "sortOrder": 10,
  "variants": [
    { "name": "Regular", "price": 120 }
  ],
  "optionGroupIds": []
}
```

### Takeaway counter order flow

Use this when the customer comes to counter and orders for packing.

Request:

```http
POST /api/orders
```

```json
{
  "serviceMode": "TAKEAWAY",
  "customerName": "Rohit",
  "customerPhone": "9876543210",
  "note": "Less spicy, pack separately",
  "items": [
    {
      "itemId": "67f4d9a8b3f0e1a201234999",
      "variantId": "67f4d9b1b3f0e1a201234998",
      "quantity": 2,
      "optionIds": []
    }
  ]
}
```

Response highlights:

- `serviceMode` returns as `TAKEAWAY`
- `tokenNumber` is generated atomically per tenant
- `table` is `null`
- queued items appear in kitchen/bar/counter queues

Important backend rules:

- takeaway orders are not auto-merged with unrelated open orders
- if frontend wants to add more items to the same takeaway order, use `appendToOrderId`
- direct-only takeaway orders are rejected; frontend should create a walk-in invoice instead
- invoice can be created only after all queued items are `SERVED` or `CANCELLED`

### Walk-in direct billing flow

Use this when there is no order lifecycle and no preparation queue is needed.

Request:

```http
POST /api/invoices
```

```json
{
  "customerName": "Walk In",
  "items": [
    {
      "itemId": "67f4d9a8b3f0e1a201234111",
      "variantId": "67f4d9b1b3f0e1a201234112",
      "quantity": 1,
      "optionIds": []
    }
  ]
}
```

Rules:

- walk-in invoice supports non-queued items only
- `KITCHEN` items are rejected in direct walk-in billing
- invoice response returns `serviceMode=WALK_IN`
- `table` is `null`

### Queue API

Use:

```http
GET /api/orders/kitchen/items
```

Supported filters:

- `fulfillmentType=KITCHEN`
- `fulfillmentType=BAR`
- `fulfillmentType=COUNTER`
- `status=PLACED,IN_PROGRESS,READY`
- `groupByFulfillment=true`
- `includeDone=true` for owner or manager

Response contains:

- flat `items`
- grouped `queues`

Each queue item includes:

- `serviceMode`
- `tokenNumber`
- `table` or `null`
- item fulfillment and kitchen status

This lets frontend build separate tabs or columns:

- Kitchen
- Bar
- Counter

### Frontend screen guidance

For easy UI, use four operational screens.

#### 1. Dine-In POS

Use for waiter and table service.

Main inputs:

- table selector
- customer optional
- menu grid
- running order summary

Actions:

- create or append order
- move item to another table
- cancel item
- request invoice

#### 2. Counter Takeaway POS

Use for cashier or counter operator.

Main inputs:

- customer name and phone optional
- menu grid
- takeaway cart
- notes for packing

After submit:

- show generated `tokenNumber`
- show current item statuses
- allow append by using `appendToOrderId`
- allow invoice only after all queued items are done

Recommended UI states:

- `Queued`
- `In Progress`
- `Ready`
- `Served / Packed`
- `Billed`

#### 3. Fulfillment Dashboard

Use for kitchen, bar, and counter staff.

Recommended layout:

- top filter by `fulfillmentType`
- columns or tabs per fulfillment queue
- cards showing token number first for takeaway
- table number first for dine-in
- item age and priority

Sorting recommendation:

- highest priority first
- oldest pending item first

#### 4. Walk-In Billing Screen

Use for direct sales with no prep queue.

Recommended use cases:

- bottled water
- packaged ice cream
- bakery counter stock
- ready canned drinks

UI should:

- not ask for table
- not create takeaway order
- go straight to invoice
- optionally ask customer phone for CRM linkage

### Immutable billing rules

Once invoice status becomes `PAID`:

- invoice update is blocked
- covered order is treated as finalized
- frontend should switch to read-only view

### Practical frontend decision tree

If order is for a table, use `POST /api/orders` with `serviceMode=DINE_IN`.

If order is for packing and needs preparation queue, use `POST /api/orders` with `serviceMode=TAKEAWAY`.

If sale is instant and needs no queue, use `POST /api/invoices` with direct `items`.

If menu item is `DIRECT`, frontend should not wait for queue completion.

If menu item is `KITCHEN`, `BAR`, or `COUNTER`, frontend should drive staff through queue statuses before billing.

## 23. Migration For Old Orders And Invoices

If your database already contains old documents created before `serviceMode` was added, run the backfill once.

Scripts:

- `npm run migrate:service-mode:dry`
- `npm run migrate:service-mode`

Inference rules:

- order with `tableId` => `DINE_IN`
- order without `tableId` => `TAKEAWAY`
- invoice with `tableId` => `DINE_IN`
- invoice without `tableId` but linked to order or orderIds => `TAKEAWAY`
- invoice without `tableId` and without linked orders => `WALK_IN`

Recommended rollout:

1. Run dry run in staging.
2. Verify counts in output.
3. Run real migration in production during low traffic.
4. Restart API instances if your deployment uses long-lived cached schema metadata.

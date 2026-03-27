# API Refrense

## 1. Order Item Correction Scope

Order item correction ab sirf same order ya same table tak limited nahi maana jayega.

Supported correction cases:

- Same order ke andar item quantity reduce karna
- Same table ke doosre order me item exchange karna
- Doosre table me item exchange karna via `targetTableId`
- Wrong item ko full remove karna
- Wrong item ko cancel mark karna

Core routes:

- `POST /api/orders/:orderId/items/:lineId/remove`
- `POST /api/orders/:orderId/items/:lineId/cancel`
- `POST /api/orders/:orderId/items/:lineId/move`

## 2. Remove vs Cancel vs Move

### Remove

Route:

- `POST /api/orders/:orderId/items/:lineId/remove`

Behavior:

- Full line remove kar sakta hai
- Partial qty reduce kar sakta hai
- Agar quantity request di gayi ho to source line ki qty utni reduce hoti hai
- Agar full qty remove hui to line order se nikal jati hai

Request example:

```json
{
  "quantity": 1
}
```

### Cancel

Route:

- `POST /api/orders/:orderId/items/:lineId/cancel`

Behavior:

- Item line order me record ke roop me rehti hai
- Status `CANCELLED` ho jata hai
- Cancelled line bill aggregate me active amount me include nahi hoti
- Kitchen / waiter / billing timeline me cancelled item ka audit trail milta hai

### Move

Route:

- `POST /api/orders/:orderId/items/:lineId/move`

Behavior:

- Item ko doosre order me exchange karna
- Same table ya doosre table dono me move ho sakta hai
- Agar `targetOrderId` diya gaya hai to usi order me item jayega
- Agar `targetTableId` diya gaya hai aur matching open order mila to usme item jayega
- Agar `targetTableId` diya gaya aur koi open order nahi mila to naya order create ho sakta hai

Request example:

```json
{
  "targetOrderId": "optional-order-id",
  "targetTableId": "optional-table-id",
  "quantity": 1
}
```

Response expectation:

- `sourceOrder`
- `targetOrder`
- `createdTargetOrder` optional

## 3. Status Rules For Correction

Correction ab selected item ke current status ke saath evaluate hota hai.

Important statuses:

- `PLACED`
- `IN_PROGRESS`
- `READY`
- `SERVED`
- `CANCELLED`

Rules:

- `PLACED` item par remove / reduce / cancel / move allowed hai
- `IN_PROGRESS` item par cancel ya move business approval flow ke saath allow ho sakta hai
- `READY` item par correction allow ho sakta hai agar billing ya service se pehle user dispute raise kare
- `SERVED` item par bhi correction allow ho sakta hai jab invoice preview / issued invoice stage me dispute resolve karna ho
- `CANCELLED` item active flow me wapas push nahi hota

Frontend requirement:

- Har selected item ke paas current status show hona chahiye
- Same selected item row me `Exchange`, `Reduce/Remove`, `Cancel Item` options visible hone chahiye
- Qty selector selected item ke paas hi dikhe

## 4. Correction In Order Screen

Order screen me har item row ke saath ye options visible hone chahiye:

- Status badge
- Qty selector
- `Exchange`
- `Reduce/Remove`
- `Cancel Item`

Applicable screens:

- Manager order list
- Waiter live board
- Selected item side panel
- Order preview card

## 5. Correction In Invoice Preview

Invoice preview stage me bhi correction allowed maana jayega.

Meaning:

- Invoice create se pehle preview modal me item move ho sakta hai
- Item qty reduce ho sakta hai
- Item remove ho sakta hai
- Item cancel ho sakta hai

Required UI:

- Preview row ke saath item status dikhna chahiye
- Selected item ke paas `Exchange`, `Reduce/Remove`, `Cancel Item` action hona chahiye
- Cross-order aur cross-table move target select ho sake

## 6. Correction After Invoice Created

Invoice `ISSUED` hone ke baad bhi unpaid state me correction allow ho sakta hai.

Rules:

- Unpaid invoice correction ke waqt old invoice invalidate / unlink / auto delete ho sakta hai
- Order latest totals ke saath update hoga
- Fresh preview ya fresh invoice regenerate kiya ja sakta hai
- `PAID` invoice ke baad correction allowed nahi hai

Affected routes:

- `PUT /api/orders/:orderId`
- `POST /api/orders/:orderId/items/:lineId/remove`
- `POST /api/orders/:orderId/items/:lineId/cancel`
- `POST /api/orders/:orderId/items/:lineId/move`

## 7. Invoice Delete Recovery

Agar unpaid invoice delete hota hai to order phir se active editable flow me aayega.

Meaning:

- Order billing lock remove ho jayega
- Order item phir se move ho sakta hai
- Order item phir se remove ho sakta hai
- Order item phir se cancel ho sakta hai
- Waiter / manager phir selected item panel se correction kar sakte hain

Expected post-delete state:

- order visible in order workspace
- item correction actions visible again
- invoice preview dobara open kiya ja sakta hai

## 8. Public QR Current Order

Routes:

- `GET /api/public/orders/current`
- `PUT /api/public/orders/current/items/:lineId`
- `DELETE /api/public/orders/current/items/:lineId`
- `POST /api/public/orders/current/cancel`
- `POST /api/public/orders/current/request-invoice`
- `POST /api/public/orders/current/invoice`

Notes:

- Current order latest `sessionToken` ke basis par resolve hota hai
- Public user ko apna current order aur item status dekhna chahiye
- Public current order me item delete / qty reduce jab tak business rule allow kare tab tak available hona chahiye
- Public invoice create tab allow hoga jab backend validation pass kare

## 9. Full Document Update

Har order mutation ke baad latest order payload persist aur return hona chahiye:

- `items`
- `status`
- `subTotal`
- `taxTotal`
- `grandTotal`
- `invoiceRequest`
- `updatedBy`
- `updatedAt`

Move ke baad additional response:

- `sourceOrder`
- `targetOrder`
- `tableChange` optional

## 10. Realtime Refresh Event

Socket events:

- `api_refresh`
- `api.refresh`

Common payload shape:

```json
{
  "at": "2026-03-27T00:00:00.000Z",
  "scope": "order",
  "action": "updated",
  "orderId": "...",
  "tableId": "...",
  "targetTableId": "optional-table-id"
}
```

Emit after:

- order create
- order update
- item reduce
- item remove
- item cancel
- item move
- invoice create
- invoice delete
- invoice regenerate

## 11. Frontend Checklist

- Selected item ke paas current `status` dikhna chahiye
- Selected item ke paas `Exchange`, `Reduce/Remove`, `Cancel Item` visible hona chahiye
- Order screen, waiter screen, invoice preview, selected item side panel sab me same correction options hone chahiye
- Invoice delete ke baad order correction actions wapas visible hone chahiye
- Cross-table exchange ke liye `targetTableId` select option dena chahiye

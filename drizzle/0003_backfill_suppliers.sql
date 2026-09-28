-- Gives the stock recorded before supplier tracking a supplier, so stock_movement.supplier_id can
-- become NOT NULL in the next migration. Nothing is invented: suppliers are made from the names
-- already typed on receipts, with the phone left empty for someone to fill in (the screens flag
-- it). Stock with no receipt to name a supplier goes to "Unrecorded supplier".

-- 1. A supplier for every name that was typed as the supplier of a receipt.
INSERT INTO `supplier` (`org_id`, `name`, `phone`)
SELECT DISTINCT d.`org_id`, TRIM(d.`party`), ''
FROM `stock_document` d
WHERE d.`type` = 'receipt' AND d.`party` IS NOT NULL AND TRIM(d.`party`) <> '';
--> statement-breakpoint

-- 2. A fallback, only for businesses that have stock-tracked items or movements to attach.
INSERT INTO `supplier` (`org_id`, `name`, `phone`, `note`)
SELECT o.`id`, 'Unrecorded supplier', '', 'Stock recorded before suppliers were tracked'
FROM `organization` o
WHERE EXISTS (SELECT 1 FROM `item` i WHERE i.`org_id` = o.`id` AND i.`stock_tracked` = 1)
   OR EXISTS (SELECT 1 FROM `stock_movement` m WHERE m.`org_id` = o.`id`);
--> statement-breakpoint

-- 3. Receipts: the supplier named on them, else the fallback.
UPDATE `stock_document` d
JOIN `supplier` s ON s.`org_id` = d.`org_id` AND s.`name` = TRIM(d.`party`)
SET d.`supplier_id` = s.`id`, d.`party` = NULL
WHERE d.`type` = 'receipt';
--> statement-breakpoint
UPDATE `stock_document` d
JOIN `supplier` s ON s.`org_id` = d.`org_id` AND s.`name` = 'Unrecorded supplier'
SET d.`supplier_id` = s.`id`
WHERE d.`type` = 'receipt' AND d.`supplier_id` IS NULL;
--> statement-breakpoint

-- 4. Lots and serial units: the supplier of the receipt that first brought them in.
UPDATE `lot` l SET l.`supplier_id` = (
	SELECT d.`supplier_id` FROM `stock_movement` m JOIN `stock_document` d ON d.`id` = m.`document_id`
	WHERE m.`lot_id` = l.`id` AND m.`kind` = 'receipt' ORDER BY m.`id` LIMIT 1
);
--> statement-breakpoint
UPDATE `serial_unit` u SET u.`supplier_id` = (
	SELECT d.`supplier_id` FROM `stock_movement` m JOIN `stock_document` d ON d.`id` = m.`document_id`
	WHERE m.`serial_unit_id` = u.`id` AND m.`kind` = 'receipt' ORDER BY m.`id` LIMIT 1
);
--> statement-breakpoint

-- 5. Items: whoever delivered them last, else the fallback (stock-tracked items only).
UPDATE `item` i SET i.`supplier_id` = (
	SELECT d.`supplier_id` FROM `stock_movement` m JOIN `stock_document` d ON d.`id` = m.`document_id`
	WHERE m.`item_id` = i.`id` AND m.`kind` = 'receipt' ORDER BY m.`id` DESC LIMIT 1
);
--> statement-breakpoint
UPDATE `item` i
JOIN `supplier` s ON s.`org_id` = i.`org_id` AND s.`name` = 'Unrecorded supplier'
SET i.`supplier_id` = s.`id`
WHERE i.`supplier_id` IS NULL AND i.`stock_tracked` = 1;
--> statement-breakpoint

-- 6. Movements: the receipt's supplier coming in; going out, the unit's, the lot's, or the item's.
UPDATE `stock_movement` m JOIN `stock_document` d ON d.`id` = m.`document_id`
SET m.`supplier_id` = d.`supplier_id`
WHERE d.`type` = 'receipt';
--> statement-breakpoint
UPDATE `stock_movement` m
JOIN `item` i ON i.`id` = m.`item_id`
LEFT JOIN `lot` l ON l.`id` = m.`lot_id`
LEFT JOIN `serial_unit` u ON u.`id` = m.`serial_unit_id`
SET m.`supplier_id` = COALESCE(u.`supplier_id`, l.`supplier_id`, i.`supplier_id`)
WHERE m.`supplier_id` IS NULL;
--> statement-breakpoint

-- 7. Payments for receipts belong to the receipt's supplier.
UPDATE `transactions` t JOIN `stock_document` d ON d.`transaction_id` = t.`id`
SET t.`supplier_id` = d.`supplier_id`
WHERE d.`type` = 'receipt';
--> statement-breakpoint

-- 8. The fallback where nothing ended up using it.
DELETE s FROM `supplier` s
WHERE s.`name` = 'Unrecorded supplier'
  AND NOT EXISTS (SELECT 1 FROM `item` i WHERE i.`supplier_id` = s.`id`)
  AND NOT EXISTS (SELECT 1 FROM `stock_document` d WHERE d.`supplier_id` = s.`id`)
  AND NOT EXISTS (SELECT 1 FROM `stock_movement` m WHERE m.`supplier_id` = s.`id`);

import { getTableName, sql, type Column, type Table } from 'drizzle-orm';

/**
 * A column always written with its table name: `` `supplier`.`id` ``.
 *
 * For correlated subqueries in a select list. Drizzle leaves columns unqualified in the select
 * list of a query without joins, so `(SELECT … WHERE ${movement.supplierId} = ${supplier.id})`
 * becomes `` WHERE `supplier_id` = `id` `` — and inside the subquery `id` is the subquery's own
 * table. Every supplier total came out as zero that way. Use this for the outer reference.
 */
export function qualified(table: Table, column: Column) {
	return sql`${sql.identifier(getTableName(table))}.${sql.identifier(column.name)}`;
}

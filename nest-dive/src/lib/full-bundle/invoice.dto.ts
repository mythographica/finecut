/**
 * CreateInvoiceDto — the wire's validation schema (class-validator).
 *
 * Field-level validity only: title is a string, price / quantity / total are
 * ints. The DOMAIN invariant (price × quantity must equal total) is
 * deliberately NOT checked here — it belongs to the mnemonica type's
 * constructor, so that the failure surfaces inside construction, where the
 * full bundle can show it.
 *
 * NOTE: the DTO is intentionally FLAT. Under local file:-symlink development
 * each linked package carries its own class-transformer copy, and @Type
 * metadata for nested DTOs is stored per-copy — nested validation then
 * silently degrades. Real npm consumers get one deduped copy and are
 * unaffected; flat DTOs work in both topologies (class-validator's storage
 * is globalThis-shared).
 */
import { IsInt, IsString } from 'class-validator';

export class CreateInvoiceDto {
	@IsString()
	title!: string;

	@IsInt()
	price!: number;

	@IsInt()
	quantity!: number;

	@IsInt()
	total!: number;
}

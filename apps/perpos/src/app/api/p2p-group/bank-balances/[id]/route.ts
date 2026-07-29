import { NextRequest } from "next/server";
import { handleDelete, handleUpdate } from "../../_lib";
import { BANK_BALANCES_CONFIG } from "../../_configs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleUpdate(req, id, BANK_BALANCES_CONFIG);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleDelete(req, id, BANK_BALANCES_CONFIG);
}

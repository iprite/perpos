import { NextRequest } from "next/server";
import { handleDelete, handleUpdate } from "../../_lib";
import { DIVIDENDS_CONFIG } from "../../_configs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleUpdate(req, id, DIVIDENDS_CONFIG);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleDelete(req, id, DIVIDENDS_CONFIG);
}

import { NextRequest } from "next/server";
import { handleDelete, handleUpdate } from "../../_lib";
import { INVESTMENTS_CONFIG } from "../../_configs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleUpdate(req, id, INVESTMENTS_CONFIG);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleDelete(req, id, INVESTMENTS_CONFIG);
}

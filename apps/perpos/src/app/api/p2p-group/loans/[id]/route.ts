import { NextRequest } from "next/server";
import { handleDelete, handleUpdate } from "../../_lib";
import { LOANS_CONFIG } from "../../_configs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleUpdate(req, id, LOANS_CONFIG);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return handleDelete(req, id, LOANS_CONFIG);
}

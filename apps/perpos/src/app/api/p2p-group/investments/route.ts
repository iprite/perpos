import { NextRequest } from "next/server";
import { handleCreate, handleList } from "../_lib";
import { INVESTMENTS_CONFIG } from "../_configs";

export async function GET(req: NextRequest) {
  return handleList(req, INVESTMENTS_CONFIG);
}

export async function POST(req: NextRequest) {
  return handleCreate(req, INVESTMENTS_CONFIG);
}

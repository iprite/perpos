import { NextRequest } from "next/server";
import { handleCreate, handleList } from "../_lib";
import { LOANS_CONFIG } from "../_configs";

export async function GET(req: NextRequest) {
  return handleList(req, LOANS_CONFIG);
}

export async function POST(req: NextRequest) {
  return handleCreate(req, LOANS_CONFIG);
}

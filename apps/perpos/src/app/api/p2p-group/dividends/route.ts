import { NextRequest } from "next/server";
import { handleCreate, handleList } from "../_lib";
import { DIVIDENDS_CONFIG } from "../_configs";

export async function GET(req: NextRequest) {
  return handleList(req, DIVIDENDS_CONFIG);
}

export async function POST(req: NextRequest) {
  return handleCreate(req, DIVIDENDS_CONFIG);
}

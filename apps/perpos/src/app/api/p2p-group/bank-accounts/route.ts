import { NextRequest } from "next/server";
import { handleCreate, handleList } from "../_lib";
import { BANK_ACCOUNTS_CONFIG } from "../_configs";

export async function GET(req: NextRequest) {
  return handleList(req, BANK_ACCOUNTS_CONFIG);
}

export async function POST(req: NextRequest) {
  return handleCreate(req, BANK_ACCOUNTS_CONFIG);
}

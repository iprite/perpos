import { NextRequest } from "next/server";
import { handleCreate, handleList } from "../_lib";
import { COMPANIES_CONFIG } from "../_configs";

export async function GET(req: NextRequest) {
  return handleList(req, COMPANIES_CONFIG);
}

export async function POST(req: NextRequest) {
  return handleCreate(req, COMPANIES_CONFIG);
}

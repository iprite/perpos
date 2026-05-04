type DriveTokenRow = {
  profile_id: string;
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null;
  scope: string | null;
  token_type: string | null;
  drive_root_folder_id: string | null;
};

type DriveFile = {
  id: string;
  name?: string;
  webViewLink?: string;
};

function requiredEnv(name: string) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function fetchJson(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.error_description || data?.error?.message || data?.error || res.statusText;
    throw new Error(String(msg || "request_failed"));
  }
  return data;
}

export async function exchangeCodeForDriveTokens(code: string, redirectUri: string) {
  const clientId = requiredEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET");

  const body = new URLSearchParams();
  body.set("code", code);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("redirect_uri", redirectUri);
  body.set("grant_type", "authorization_code");

  return (await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
  };
}

export async function refreshDriveAccessToken(refreshToken: string) {
  const clientId = requiredEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET");

  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("refresh_token", refreshToken);
  body.set("grant_type", "refresh_token");

  return (await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })) as {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  };
}

function toExpiresAtIso(expiresInSeconds: number) {
  return new Date(Date.now() + Math.max(0, expiresInSeconds) * 1000).toISOString();
}

function isStillValid(expiresAtIso: string | null) {
  if (!expiresAtIso) return false;
  const t = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(t)) return false;
  return t - Date.now() > 60 * 1000;
}

async function driveApiJson(accessToken: string, url: string, init?: RequestInit) {
  return await fetchJson(url, {
    ...(init ?? {}),
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function ensureDriveFolder(accessToken: string, folderName: string, existingFolderId?: string | null) {
  if (existingFolderId) return existingFolderId;

  const q = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(
    "files(id,name)"
  )}&pageSize=1`;
  const list = (await driveApiJson(accessToken, listUrl)) as { files?: Array<{ id: string; name: string }> };
  const found = list.files?.[0]?.id;
  if (found) return found;

  const created = (await driveApiJson(accessToken, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder", parents: ["root"] }),
  })) as { id: string };
  return created.id;
}

export async function uploadFileToDrive(params: {
  accessToken: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  folderId?: string | null;
}) {
  const boundary = `perpos_${Math.random().toString(16).slice(2)}`;
  const metadata: Record<string, any> = {
    name: params.fileName,
  };
  if (params.folderId) metadata.parents = [params.folderId];

  const metaPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n`;
  const fileHeader =
    `--${boundary}\r\n` +
    `Content-Type: ${params.mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(metaPart, "utf8"),
    Buffer.from(fileHeader, "utf8"),
    Buffer.from(params.bytes),
    Buffer.from(closing, "utf8"),
  ]);

  const url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent(
    "id,name,webViewLink"
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      "content-type": `multipart/related; boundary=${boundary}`,
      "content-length": String(body.length),
    },
    body,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as any) : null;
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    throw new Error(String(msg || "drive_upload_failed"));
  }
  return data as DriveFile;
}

export async function getDriveAccessTokenForRow(
  row: DriveTokenRow,
  saveUpdated: (patch: Partial<DriveTokenRow>) => Promise<void>
) {
  if (row.access_token && isStillValid(row.expires_at)) return row.access_token;
  const refreshed = await refreshDriveAccessToken(row.refresh_token);
  const expiresAt = toExpiresAtIso(refreshed.expires_in);
  await saveUpdated({
    access_token: refreshed.access_token,
    expires_at: expiresAt,
    scope: refreshed.scope ?? row.scope,
    token_type: refreshed.token_type ?? row.token_type,
  });
  return refreshed.access_token;
}

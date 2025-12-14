const API_URL = "http://localhost:8000";

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface User {
  id: number;
  email: string;
  created_at: string;
}

export interface DriveFolder {
  id: number;
  name: string;
  parentId: number | null;
  trashed: boolean;
  originalParentId: number | null;
}

export interface DriveFile {
  id: number;
  name: string;
  type: string;
  ownerId: number;
  parentId: number | null;
  sizeBytes: number;
  starred: boolean;
  isShared: boolean;
  trashed: boolean;
  originalParentId: number | null;
  modifiedAt: string;
}

export interface DriveState {
  rootFolderId: number;
  folders: DriveFolder[];
  files: DriveFile[];
}

async function requestJSON<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = (data as any).detail ?? msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export async function apiRegister(email: string, password: string) {
  return requestJSON<User>("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function apiLogin(email: string, password: string) {
  const form = new URLSearchParams();
  form.append("username", email);
  form.append("password", password);

  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).detail ?? res.statusText);
  }
  return (await res.json()) as TokenResponse;
}

export async function apiMe(token: string) {
  return requestJSON<User>("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function apiFetchState(token: string) {
  return requestJSON<DriveState>("/drive/state", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function apiCreateFolder(
  token: string,
  payload: { name: string; parentId: number | null }
) {
  return requestJSON<DriveFolder>("/drive/folders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function apiUploadFile(
  token: string,
  file: File,
  folderId: number | null
) {
  const form = new FormData();
  form.append("file", file);
  if (folderId != null) {
    form.append("folderId", String(folderId));
  }

  const res = await fetch(`${API_URL}/drive/files/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).detail ?? res.statusText);
  }
  return (await res.json()) as DriveFile;
}

export async function apiUpdateFile(
  token: string,
  id: number,
  patch: Partial<{
    starred: boolean;
    isShared: boolean;
    trashed: boolean;
    parentId: number | null;
    originalParentId: number | null;
  }>
) {
  return requestJSON<DriveFile>(`/drive/files/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
}

export async function apiUpdateFolder(
  token: string,
  id: number,
  patch: Partial<{
    trashed: boolean;
    parentId: number | null;
    originalParentId: number | null;
  }>
) {
  return requestJSON<DriveFolder>(`/drive/folders/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
}

export async function apiDeleteFile(token: string, id: number) {
  const res = await fetch(`${API_URL}/drive/files/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).detail ?? res.statusText);
  }
}

export async function apiDeleteFolder(token: string, id: number) {
  const res = await fetch(`${API_URL}/drive/folders/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).detail ?? res.statusText);
  }
}

export async function apiDownloadUrl(id: number) {
  return `${API_URL}/drive/files/${id}/download`;
}

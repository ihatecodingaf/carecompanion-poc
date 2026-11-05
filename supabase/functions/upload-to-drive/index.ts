/**
 * upload-to-drive
 * ──────────────────────────────────────────────────────────────────────────
 * Uploads a base64 image to Google Drive using a service account.
 * Files are organised as: precovery-patients/{patientId}/{filename}
 *
 * Required Supabase secrets:
 *   GOOGLE_DRIVE_CREDENTIALS  — full service account JSON as a string
 *   GOOGLE_DRIVE_FOLDER_ID    — ID of the shared Google Drive root folder
 *
 * Falls back to Supabase Storage if Drive secrets not set (uses the
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY built-in env vars).
 *
 * Setup steps (one-time, done by the developer):
 *   1. Google Cloud Console → IAM → Service Accounts → Create
 *   2. Download JSON key
 *   3. Drive → create folder "precovery-patients" → Share with service account email
 *   4. supabase secrets set GOOGLE_DRIVE_CREDENTIALS="$(cat sa-key.json)"
 *   5. supabase secrets set GOOGLE_DRIVE_FOLDER_ID="<folder-id-from-url>"
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Google Drive helpers ──────────────────────────────────────────────────────

interface ServiceAccount {
  client_email:  string;
  private_key:   string;
  token_uri?:    string;
}

/** Create a signed JWT for the service account and exchange for access token */
async function getGoogleAccessToken(sa: ServiceAccount): Promise<string> {
  const now    = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud:   sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   expiry,
  };

  function b64url(obj: unknown) {
    return btoa(JSON.stringify(obj))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  const sigInput = `${b64url(header)}.${b64url(payload)}`;

  // Import the RSA private key
  const pemBody  = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const keyDer   = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(sigInput),
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const jwt = `${sigInput}.${sig}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  if (!tokenRes.ok) throw new Error(`OAuth token exchange failed: ${tokenRes.status}`);
  const { access_token } = await tokenRes.json();
  return access_token as string;
}

/**
 * Create a sub-folder under the root folder (or re-use if exists).
 * Google Drive allows duplicate folder names; we just create and use it.
 */
async function getOrCreateFolder(
  token: string,
  name: string,
  parentId: string,
): Promise<string> {
  // Check if folder already exists
  const q      = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`);
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const listJson = await listRes.json();
  const existing = listJson.files?.[0]?.id as string | undefined;
  if (existing) return existing;

  // Create folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents:  [parentId],
    }),
  });
  const created = await createRes.json();
  return created.id as string;
}

/** Upload a file and return a public webViewLink */
async function uploadToDrive(
  token:     string,
  filename:  string,
  mimeType:  string,
  bytes:     Uint8Array,
  folderId:  string,
): Promise<string> {
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const boundary = 'precovery_boundary_xyz';

  const metaPart  = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`;
  const mediaPart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const ending    = `\r\n--${boundary}--`;

  const encoder    = new TextEncoder();
  const metaBytes  = encoder.encode(metaPart);
  const mediaBytes = encoder.encode(mediaPart);
  const endBytes   = encoder.encode(ending);

  const combined   = new Uint8Array(metaBytes.length + mediaBytes.length + bytes.length + endBytes.length);
  combined.set(metaBytes,                               0);
  combined.set(mediaBytes,             metaBytes.length);
  combined.set(bytes,      metaBytes.length + mediaBytes.length);
  combined.set(endBytes,   metaBytes.length + mediaBytes.length + bytes.length);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method:  'POST',
      headers: {
        Authorization:   `Bearer ${token}`,
        'Content-Type':  `multipart/related; boundary="${boundary}"`,
        'Content-Length': combined.length.toString(),
      },
      body: combined,
    },
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Drive upload failed: ${err}`);
  }

  const file = await uploadRes.json();

  // Make the file publicly readable
  await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  return `https://drive.google.com/uc?id=${file.id}`;
}

// ── Supabase Storage fallback ─────────────────────────────────────────────────

async function uploadToSupabase(
  base64Data: string,
  patientId:  string,
  filename:   string,
): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  // Decode base64
  const stripped   = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const byteString = atob(stripped);
  const bytes      = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);

  const path = `patients/${patientId}/${filename}`;
  const { error } = await supabase.storage
    .from('patient-photos')
    .upload(path, bytes, { upsert: true, contentType: 'image/jpeg' });

  if (error) throw error;
  const { data } = supabase.storage.from('patient-photos').getPublicUrl(path);
  return data.publicUrl;
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { base64Data, patientId, filename } =
      (await req.json()) as { base64Data: string; patientId: string; filename: string };

    if (!base64Data) throw new Error('base64Data is required');

    const credsRaw  = Deno.env.get('GOOGLE_DRIVE_CREDENTIALS') ?? '';
    const folderId  = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')   ?? '';

    // ── Google Drive path ──
    if (credsRaw && folderId) {
      const sa: ServiceAccount = JSON.parse(credsRaw);
      const token              = await getGoogleAccessToken(sa);

      // Create per-patient subfolder
      const patientFolderId = await getOrCreateFolder(token, patientId, folderId);

      // Decode base64
      const stripped   = base64Data.replace(/^data:image\/\w+;base64,/, '');
      const byteString = atob(stripped);
      const bytes      = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);

      const url = await uploadToDrive(token, filename, 'image/jpeg', bytes, patientFolderId);
      return new Response(JSON.stringify({ url }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Supabase Storage fallback ──
    console.warn('Google Drive credentials not set — using Supabase Storage fallback');
    const url = await uploadToSupabase(base64Data, patientId, filename);
    return new Response(JSON.stringify({ url }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('upload-to-drive error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});

function jsonResponse(res: any, status: number, payload: any) {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(payload, null, 2))
}

export default function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return jsonResponse(res, 405, { ok: false, error: "Method not allowed" })
  }

  const supabaseUrl = process.env.SUPABASE_URL || ""
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || ""

  return jsonResponse(res, 200, {
    ok: true,
    supabaseUrl,
    supabaseAnonKey,
  })
}

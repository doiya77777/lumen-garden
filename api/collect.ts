import { createClient } from "@supabase/supabase-js"

const DEFAULT_CATEGORIES = ["cs.AI"]
const DEFAULT_MAX_RESULTS = 5

function getEnv(name: string, fallback?: string) {
  const value = process.env[name]
  if (value && value.length > 0) return value
  return fallback
}

function jsonResponse(res: any, status: number, payload: any) {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(payload, null, 2))
}

function parseBool(value: any) {
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.toLowerCase() === "true"
  return false
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function extractTag(entry: string, tag: string) {
  const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"))
  return match ? decodeXml(match[1].trim()) : ""
}

function extractAll(entry: string, tag: string) {
  const matches = [...entry.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))]
  return matches.map((match) => decodeXml(match[1].trim()))
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

async function fetchArxiv(categories: string[], maxResults: number) {
  const query = categories.map((cat) => `cat:${cat}`).join(" OR ")
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(
    query,
  )}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`arXiv request failed: ${response.status}`)
  }

  const xml = await response.text()
  const entries = [...xml.matchAll(/<entry>([\\s\\S]*?)<\\/entry>/g)].map(
    (match) => match[1],
  )

  return entries.map((entry) => {
    const id = extractTag(entry, "id")
    const title = extractTag(entry, "title").replace(/\s+/g, " ")
    const summary = extractTag(entry, "summary").replace(/\s+/g, " ")
    const published = extractTag(entry, "published")
    const authors = extractAll(entry, "name")

    return {
      id,
      title,
      summary,
      published,
      authors,
      arxivId: id.split("/").pop() ?? id,
    }
  })
}

async function callOpencode(messages: { role: string; content: string }[]) {
  const apiKey = getEnv("ARK_API_KEY")
  if (!apiKey) {
    throw new Error("Missing ARK_API_KEY")
  }

  const baseUrl = getEnv("OPENCODE_BASE_URL", "https://ark.cn-beijing.volces.com/api/coding/v3")
  const model = getEnv("OPENCODE_MODEL", "ark-code-latest")

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Opencode request failed: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error("Opencode returned empty response")
  }

  return content
}

async function summarizePaper(paper: any) {
  const prompt = `Summarize the paper for a daily digest.\n\nTitle: ${paper.title}\nAuthors: ${paper.authors.join(", ")}\nAbstract: ${paper.summary}\n\nReturn JSON only with:\n- summary: 3-5 sentences.\n- takeaways: 3-5 bullet points (array of strings).\n- conclusion: 1-2 sentences.`

  const raw = await callOpencode([
    { role: "system", content: "You are a precise AI research assistant." },
    { role: "user", content: prompt },
  ])

  try {
    return JSON.parse(raw)
  } catch (error) {
    return {
      summary: raw.trim(),
      takeaways: [],
      conclusion: "",
      parseWarning: true,
    }
  }
}

function buildCoverSvg(paper: any) {
  const safeTitle = paper.title.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  const authorLine = paper.authors.slice(0, 3).join(", ")
  const subtitle = paper.authors.length > 3 ? `${authorLine} et al.` : authorLine

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f0f7f6"/>
      <stop offset="100%" stop-color="#d9e8e6"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="80" y="90" width="1040" height="450" rx="28" fill="#ffffff" opacity="0.85"/>
  <text x="140" y="200" font-family="'Schibsted Grotesk', 'Source Sans Pro', sans-serif" font-size="40" fill="#284b63">AI Paper Digest</text>
  <text x="140" y="270" font-family="'Schibsted Grotesk', 'Source Sans Pro', sans-serif" font-size="36" fill="#2b2b2b">${safeTitle}</text>
  <text x="140" y="360" font-family="'Source Sans Pro', sans-serif" font-size="26" fill="#4e4e4e">${subtitle}</text>
  <text x="140" y="430" font-family="'IBM Plex Mono', monospace" font-size="20" fill="#84a59d">${paper.arxivId}</text>
</svg>`
}

function getSupabaseClient() {
  const supabaseUrl = getEnv("SUPABASE_URL")
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function verifySupabaseToken(token: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return null

  return {
    userId: data.user.id,
    email: data.user.email ?? "",
  }
}

async function logSupabaseRun(payload: {
  userId: string
  userEmail: string
  categories: string[]
  maxResults: number
  includeAudio: boolean
  includeImages: boolean
  dryRun: boolean
  noteFile: string
  warnings: string[]
  papers: { id: string; title: string; arxivId: string }[]
  status: string
}) {
  const supabase = getSupabaseClient()
  if (!supabase) return

  await supabase.from("agent_runs").insert({
    user_id: payload.userId,
    user_email: payload.userEmail,
    categories: payload.categories,
    max_results: payload.maxResults,
    include_audio: payload.includeAudio,
    include_images: payload.includeImages,
    dry_run: payload.dryRun,
    note_file: payload.noteFile,
    warnings: payload.warnings,
    papers: payload.papers,
    status: payload.status,
  })
}

async function maybeGenerateAudio(paper: any, summary: any) {
  const ttsUrl = getEnv("TTS_API_URL")
  const ttsKey = getEnv("TTS_API_KEY")
  if (!ttsUrl || !ttsKey) return null

  const text = `${paper.title}. ${summary.summary} ${summary.conclusion}`.trim()
  if (!text) return null

  const response = await fetch(ttsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ttsKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice: getEnv("TTS_VOICE", "neutral"),
      format: "mp3",
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`TTS request failed: ${response.status} ${errorText}`)
  }

  const contentType = response.headers.get("content-type") || ""
  if (contentType.startsWith("audio/")) {
    const audioBuffer = Buffer.from(await response.arrayBuffer())
    return { buffer: audioBuffer, ext: "mp3" }
  }

  const data = await response.json()
  const audioBase64 = data.audioBase64 || data.audio || data.data
  if (!audioBase64) {
    throw new Error("TTS response missing audio data")
  }

  return { buffer: Buffer.from(audioBase64, "base64"), ext: "mp3" }
}

async function putGitHubFile(path: string, content: Buffer | string, message: string) {
  const owner = getEnv("GITHUB_OWNER")
  const repo = getEnv("GITHUB_REPO")
  const token = getEnv("GITHUB_TOKEN")
  const branch = getEnv("GITHUB_BRANCH", "main")

  if (!owner || !repo || !token) {
    throw new Error("Missing GitHub configuration (GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN)")
  }

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`

  const existing = await fetch(`${apiUrl}?ref=${branch}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "lumen-garden-agent",
    },
  })

  let sha: string | undefined
  if (existing.ok) {
    const existingData = await existing.json()
    sha = existingData.sha
  }

  const body = {
    message,
    content: Buffer.isBuffer(content) ? content.toString("base64") : Buffer.from(content).toString("base64"),
    branch,
    sha,
  }

  const response = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "lumen-garden-agent",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GitHub write failed: ${response.status} ${errorText}`)
  }

  return response.json()
}

function buildMarkdown(papers: any[], options: { title: string; date: string }) {
  const lines: string[] = []
  lines.push("---")
  lines.push(`title: ${options.title}`)
  lines.push(`date: ${options.date}`)
  lines.push("tags:")
  lines.push("  - ai")
  lines.push("  - arxiv")
  lines.push("  - digest")
  lines.push("---")
  lines.push("")
  lines.push("Daily arXiv cs.AI digest with summaries, takeaways, and conclusions.")
  lines.push("")

  for (const paper of papers) {
    lines.push(`## ${paper.title}`)
    lines.push("")
    if (paper.imagePath) {
      lines.push(`![cover](${paper.imagePath})`)
      lines.push("")
    }
    lines.push(`- Link: ${paper.id}`)
    lines.push(`- Authors: ${paper.authors.join(", ")}`)
    lines.push(`- Published: ${paper.published}`)
    lines.push("")
    lines.push(paper.summary.summary || "")
    lines.push("")
    if (paper.summary.takeaways && paper.summary.takeaways.length > 0) {
      lines.push("**Key takeaways**")
      for (const item of paper.summary.takeaways) {
        lines.push(`- ${item}`)
      }
      lines.push("")
    }
    if (paper.summary.conclusion) {
      lines.push("**Conclusion**")
      lines.push(paper.summary.conclusion)
      lines.push("")
    }
    if (paper.audioPath) {
      lines.push("<audio controls src=\"" + paper.audioPath + "\"></audio>")
      lines.push("")
    }
  }

  return lines.join("\n")
}

async function readRequestBody(req: any) {
  return new Promise((resolve) => {
    let data = ""
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString()
    })
    req.on("end", () => {
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch (error) {
        resolve({})
      }
    })
  })
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return jsonResponse(res, 405, { ok: false, error: "Method not allowed" })
  }

  const agentToken = getEnv("AGENT_TOKEN")
  const authHeader = req.headers?.authorization || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  let authMode = ""
  let authUser: { userId: string; email: string } | null = null

  if (agentToken && token && token === agentToken) {
    authMode = "token"
    authUser = { userId: "token", email: "" }
  } else if (token) {
    const supaUser = await verifySupabaseToken(token)
    if (supaUser) {
      authMode = "supabase"
      authUser = { userId: supaUser.userId, email: supaUser.email }
    }
  }

  if (!authMode) {
    return jsonResponse(res, 401, { ok: false, error: "Unauthorized" })
  }

  try {
    const body = (await readRequestBody(req)) as any
    const categories = Array.isArray(body.categories) && body.categories.length > 0 ? body.categories : DEFAULT_CATEGORIES
    const maxResults = Number(body.maxResults || DEFAULT_MAX_RESULTS)
    const includeAudio = parseBool(body.includeAudio)
    const includeImages = parseBool(body.includeImages)
    const dryRun = parseBool(body.dryRun)

    const papers = await fetchArxiv(categories, maxResults)
    const processed = []
    const warnings: string[] = []

    for (const paper of papers) {
      const summary = await summarizePaper(paper)
      if (summary.parseWarning) {
        warnings.push(`Summary parse warning for ${paper.arxivId}`)
      }

      let imagePath: string | null = null
      let audioPath: string | null = null

      if (includeImages) {
        const svg = buildCoverSvg(paper)
        const slug = slugify(paper.arxivId)
        const imageFile = `quartz/static/agent/images/${slug}.svg`
        if (!dryRun) {
          await putGitHubFile(imageFile, svg, `Add cover image for ${paper.arxivId}`)
        }
        imagePath = `/static/agent/images/${slug}.svg`
      }

      if (includeAudio) {
        try {
          const audio = await maybeGenerateAudio(paper, summary)
          if (audio) {
            const slug = slugify(paper.arxivId)
            const audioFile = `quartz/static/agent/audio/${slug}.${audio.ext}`
            if (!dryRun) {
              await putGitHubFile(audioFile, audio.buffer, `Add audio summary for ${paper.arxivId}`)
            }
            audioPath = `/static/agent/audio/${slug}.${audio.ext}`
          } else {
            warnings.push("TTS not configured; audio skipped")
          }
        } catch (error: any) {
          warnings.push(`Audio generation failed for ${paper.arxivId}: ${error.message}`)
        }
      }

      processed.push({ ...paper, summary, imagePath, audioPath })
    }

    const now = new Date()
    const date = formatDate(now)
    const title = body.title || `arXiv Digest ${date}`
    const markdown = buildMarkdown(processed, { title, date })
    const slug = slugify(title)
    const timestamp = `${now.getHours().toString().padStart(2, "0")}${now
      .getMinutes()
      .toString()
      .padStart(2, "0")}`
    const noteFile = `content/notes/${slug}-${timestamp}.md`

    let commitInfo = null
    if (!dryRun) {
      commitInfo = await putGitHubFile(noteFile, markdown, `Add arXiv digest ${date}`)
    }

    if (authMode === "supabase" && authUser) {
      await logSupabaseRun({
        userId: authUser.userId,
        userEmail: authUser.email,
        categories,
        maxResults,
        includeAudio,
        includeImages,
        dryRun,
        noteFile,
        warnings,
        papers: processed.map((paper: any) => ({
          id: paper.id,
          title: paper.title,
          arxivId: paper.arxivId,
        })),
        status: "success",
      })
    }

    return jsonResponse(res, 200, {
      ok: true,
      authMode,
      dryRun,
      noteFile,
      commitInfo,
      papers: processed.map((paper: any) => ({
        id: paper.id,
        title: paper.title,
        arxivId: paper.arxivId,
        imagePath: paper.imagePath,
        audioPath: paper.audioPath,
      })),
      warnings,
    })
  } catch (error: any) {
    if (authMode === "supabase" && authUser) {
      await logSupabaseRun({
        userId: authUser.userId,
        userEmail: authUser.email,
        categories: DEFAULT_CATEGORIES,
        maxResults: DEFAULT_MAX_RESULTS,
        includeAudio: false,
        includeImages: false,
        dryRun: true,
        noteFile: "",
        warnings: [error.message],
        papers: [],
        status: "error",
      })
    }
    return jsonResponse(res, 500, { ok: false, error: error.message })
  }
}

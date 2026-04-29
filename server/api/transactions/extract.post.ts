import { requireAuthUserId } from "../../utils/require-auth-user"
import {
  extractTransactionsFromDataUrl,
  MAX_UPLOAD_BYTES,
} from "../../utils/ai-extraction"

export default defineEventHandler(async (event) => {
  await requireAuthUserId(event)

  const body = await readBody<{ dataUrl?: string; filename?: string }>(event)
  const dataUrl = (body?.dataUrl ?? "").trim()

  const mimeMatch = /^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,/i.exec(dataUrl)
  if (!mimeMatch) {
    throw createError({
      statusCode: 400,
      statusMessage: "Arquivo inválido. Envie JPG, PNG, WebP ou PDF.",
    })
  }

  const commaIdx = dataUrl.indexOf(",")
  const approxBytes = Math.floor((dataUrl.length - commaIdx - 1) * 0.75)
  if (approxBytes > MAX_UPLOAD_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "Arquivo muito grande (máx. 8 MB).",
    })
  }

  return extractTransactionsFromDataUrl(dataUrl)
})

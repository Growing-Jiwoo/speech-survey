import { env } from './env'

export function parseAzureResponse(json: unknown): string {
  if (!json || typeof json !== 'object') return ''
  const o = json as Record<string, unknown>
  if (o.RecognitionStatus !== 'Success') return ''
  return typeof o.DisplayText === 'string' ? o.DisplayText : ''
}

export type AzureContentType = 'audio/wav' | 'audio/ogg; codecs=opus'

export async function transcribeShortAudio(audio: Buffer, contentType: AzureContentType): Promise<string> {
  const region = env('AZURE_SPEECH_REGION')
  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=simple`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': env('AZURE_SPEECH_KEY'), 'Content-Type': contentType, Accept: 'application/json' },
    body: new Uint8Array(audio),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Azure STT ${res.status}: ${await res.text()}`)
  return parseAzureResponse(await res.json())
}

import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseAzureResponse, transcribeShortAudio } from '@/lib/azure-stt'

afterEach(() => vi.unstubAllGlobals())

describe('parseAzureResponse', () => {
  it('Success면 DisplayText 반환', () => {
    expect(parseAzureResponse({ RecognitionStatus: 'Success', DisplayText: 'I like apples.' })).toBe('I like apples.')
  })
  it('NoMatch/InitialSilenceTimeout이면 빈 문자열', () => {
    expect(parseAzureResponse({ RecognitionStatus: 'NoMatch' })).toBe('')
    expect(parseAzureResponse({ RecognitionStatus: 'InitialSilenceTimeout' })).toBe('')
  })
  it('형식이 이상하면 빈 문자열', () => {
    expect(parseAzureResponse(null)).toBe('')
    expect(parseAzureResponse({})).toBe('')
  })
})

describe('transcribeShortAudio', () => {
  it('엔드포인트·헤더 올바르게 호출하고 텍스트 반환', async () => {
    process.env.AZURE_SPEECH_KEY = 'k'
    process.env.AZURE_SPEECH_REGION = 'koreacentral'
    const mock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ RecognitionStatus: 'Success', DisplayText: 'hello' }), { status: 200 }))
    vi.stubGlobal('fetch', mock)
    const text = await transcribeShortAudio(Buffer.from('xx'), 'audio/wav')
    expect(text).toBe('hello')
    const [url, init] = mock.mock.calls[0]
    expect(String(url)).toBe('https://koreacentral.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=simple')
    expect(init.headers['Ocp-Apim-Subscription-Key']).toBe('k')
    expect(init.headers['Content-Type']).toBe('audio/wav')
  })
  it('HTTP 에러면 예외', async () => {
    process.env.AZURE_SPEECH_KEY = 'k'
    process.env.AZURE_SPEECH_REGION = 'koreacentral'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 401 })))
    await expect(transcribeShortAudio(Buffer.from('xx'), 'audio/wav')).rejects.toThrow('Azure STT 401')
  })
})

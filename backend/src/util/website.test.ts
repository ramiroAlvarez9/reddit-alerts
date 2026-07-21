import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWebsiteText } from './website.js';

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html' },
  });
}

describe('fetchWebsiteText', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('strips scripts, styles, tags, and entities and collapses whitespace', async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse(
        '<html><head><style>p{color:red}</style><script>alert(1)</script></head>' +
          '<body><h1>Hi</h1><p>Hello&nbsp;world &amp; friends</p></body></html>',
      ),
    );

    const text = await fetchWebsiteText('https://example.com');

    expect(text).toBe('Hi Hello world friends');
  });

  it('sends a descriptive User-Agent header', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse('<p>x</p>'));

    await fetchWebsiteText('https://example.com');

    const init = fetchMock.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['User-Agent']).toContain('reddit-alerts');
  });

  it('passes a 15s AbortSignal timeout', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse('<p>x</p>'));

    await fetchWebsiteText('https://example.com');

    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws with the status code when the response is not OK', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('not found', { status: 404, statusText: 'Not Found' }),
    );

    await expect(fetchWebsiteText('https://example.com')).rejects.toThrow(
      'Failed to fetch website: 404',
    );
  });

  it('collapses multiple spaces into one', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse('<p>a   b\n\n  c</p>'));

    const text = await fetchWebsiteText('https://example.com');

    expect(text).toBe('a b c');
  });
});

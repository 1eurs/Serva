/**
 * The café's own typeface, inlined once, for anything that rasterises a receipt.
 *
 * Rasterising goes through an SVG <foreignObject>, and an SVG image cannot reach the network:
 * a webfont the page has loaded is simply ABSENT inside it unless its bytes are embedded. Left
 * alone, a slip prints in whatever each device happens to fall back to — Roboto on one tablet,
 * Helvetica on a laptop, some other Arabic face on the station — so the same order printed
 * from the counter and from the station came out in two different typefaces, and neither
 * matched the preview the owner picked the style in.
 *
 * Both rasterising paths call this, which is the point: ReceiptCapture (a staff device
 * printing or saving a PDF) and the station's /print/render must not disagree.
 *
 * Fetched once per page load and reused: the download is the expensive part, and a station
 * renders hundreds of receipts through one loaded page.
 *
 * A station that cannot fetch the font still has to print. On failure — or if the fetch is
 * slow enough to hold a ticket up — this resolves to undefined and the caller falls back to
 * device fonts: a slightly different-looking receipt, never a missing one.
 */
const FONT_FETCH_TIMEOUT_MS = 8_000;

let once: Promise<string | undefined> | null = null;

export function receiptFontCss(node: HTMLElement): Promise<string | undefined> {
  once ??= (async () => {
    try {
      const { getFontEmbedCSS } = await import('html-to-image');
      return await Promise.race([
        getFontEmbedCSS(node),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), FONT_FETCH_TIMEOUT_MS)),
      ]);
    } catch {
      return undefined;
    }
  })();
  return once;
}

/**
 * Text of a synchronous, blocking `<script>` that sets `data-theme` on `<html>` before first
 * paint. Only needed for a visitor with no theme cookie yet — once one exists, the server reads
 * it (see apps/web's layout) and renders `data-theme` directly, so this never runs on repeat
 * visits. A pure string (not JSX) so it can be unit-tested with `new Function(...)` and asserted
 * to be syntactically valid without a DOM.
 */
export function themeInitScript(cookieName: string): string {
  return `(function(){try{var m=document.cookie.match(new RegExp("(?:^|; )"+${JSON.stringify(cookieName)}+"=([^;]*)"));var v=m?decodeURIComponent(m[1]):null;if(v!=="light"&&v!=="dark"){v=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",v);}catch(e){}})();`;
}

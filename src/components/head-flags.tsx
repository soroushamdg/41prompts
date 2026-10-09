/* Marks <html> with .js (reveal states may hide content until scripts run)
   and .reduce (reduced motion) before first paint. */
const SCRIPT = `(function(){var d=document.documentElement;d.classList.add("js");try{if(matchMedia("(prefers-reduced-motion: reduce)").matches)d.classList.add("reduce")}catch(e){}})();`;

export function HeadFlags() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}

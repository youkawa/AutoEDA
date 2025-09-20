declare module 'vega-embed' {
  interface EmbedResult { view?: { finalize?: () => void } }
  type Embed = (el: HTMLElement, spec: object, opts: { renderer: 'svg'|'canvas'; actions: boolean; mode: 'vega-lite' }) => Promise<EmbedResult>
  const embed: Embed
  export default embed
}


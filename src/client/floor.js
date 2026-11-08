function sliceText(block, start, end) {
  const text = block.text.slice(start, end)
  if (!block.runs) return { ...block, text }
  let offset = 0
  const runs = []
  for (const run of block.runs) {
    const next = offset + run.text.length
    if (next > start && offset < end) runs.push({ ...run, text: run.text.slice(Math.max(0, start - offset), end - offset) })
    offset = next
  }
  return { ...block, text, runs }
}

// 前置引文与开场段独立于图片设置，行内表情一直跟着所在的文字。
export function floorParts(blocks, foldImages = true) {
  const context = [], output = []
  const firstText = blocks.findIndex(block => block.kind === 'text')
  const leadingQuote = firstText >= 0 && blocks.slice(0, firstText).some(block => block.kind === 'quote')
  for (const [index, block] of blocks.entries()) {
    if (block.kind === 'image') {
      if (foldImages) context.push(block)
      else output.push(block)
      continue
    }
    if (leadingQuote && index < firstText) {
      context.push(block)
      continue
    }
    if (!leadingQuote && index === firstText) {
      const boundary = /\n[\t ]*\n+/.exec(block.text) ?? /\n/.exec(block.text)
      if (boundary && boundary.index > 0 && boundary.index + boundary[0].length < block.text.length) {
        context.push(sliceText(block, 0, boundary.index))
        output.push(sliceText(block, boundary.index + boundary[0].length, block.text.length))
        continue
      }
    }
    output.push(block)
  }
  return { context, output }
}

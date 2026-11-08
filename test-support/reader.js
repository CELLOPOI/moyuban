import { createReader } from '../src/client/reader.js'
import { siteRegistry } from '../src/host/sites.js'
import { legacyBoard } from '../src/shared/boards.js'

const nga = siteRegistry({}).get('nga')
export function ngaReader(api, storage, board = legacyBoard) {
  return createReader(api, storage, board, nga.info)
}

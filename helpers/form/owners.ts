// Who holds each rostered player (players, IR and taxi). Players missing from
// the map are free agents.

import { ownerLabel } from '../waivers/format'
import { WaiverRoster, WaiverUser } from '../waivers/types'
import { Owner } from './types'

export function ownerMap(rosters: WaiverRoster[], users: WaiverUser[], mineOwnerId?: string): Record<string, Owner> {
  const out: Record<string, Owner> = {}
  rosters.forEach((r) => {
    const user = users.filter((u) => u.user_id === r.owner_id)[0]
    const label = user ? ownerLabel(user) : 'Orphan'
    const owner: Owner =
      mineOwnerId && r.owner_id === mineOwnerId ? { kind: 'mine', label } : { kind: 'other', label, ownerId: r.owner_id }
    ;[r.players, r.reserve, r.taxi].forEach((list) => (list || []).forEach((id) => (out[id] = owner)))
  })
  return out
}
